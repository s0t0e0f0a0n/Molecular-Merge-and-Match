from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc

from app.core.solvent_tokens import split_escaped_names
from app.db.models import SolventsUsed
from app.db.session import get_db

router = APIRouter(prefix="/solvents", tags=["solvents"])


class SolventPreferenceOut(BaseModel):
    id: int
    match: str
    display: str
    names: str
    options: list[str]
    preference: int
    count: int
    selected_name: str


class UpdateSolventPreferenceRequest(BaseModel):
    preference: int


def _to_response(row: SolventsUsed) -> SolventPreferenceOut:
    options = split_escaped_names(row.names)
    if not options:
        options = [row.match]

    preference = int(row.preference or 0)
    if preference < 0 or preference >= len(options):
        preference = 0

    return SolventPreferenceOut(
        id=row.id,
        match=row.match,
        display=row.display,
        names=row.names,
        options=options,
        preference=preference,
        count=int(row.count or 0),
        selected_name=options[preference],
    )


@router.get("/", response_model=list[SolventPreferenceOut])
def list_solvents() -> list[SolventPreferenceOut]:
    with get_db() as db:
        rows = (
            db.query(SolventsUsed)
            .order_by(desc(SolventsUsed.count), SolventsUsed.id.asc())
            .all()
        )
        return [_to_response(row) for row in rows]


@router.put("/{solvent_id}/preference", response_model=SolventPreferenceOut)
def update_solvent_preference(solvent_id: int, payload: UpdateSolventPreferenceRequest) -> SolventPreferenceOut:
    with get_db() as db:
        row = db.query(SolventsUsed).filter(SolventsUsed.id == solvent_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Solvent not found")

        options = split_escaped_names(row.names)
        if not options:
            options = [row.match]

        if payload.preference < 0 or payload.preference >= len(options):
            raise HTTPException(status_code=400, detail="Invalid solvent preference index")

        row.preference = payload.preference
        db.commit()
        db.refresh(row)
        return _to_response(row)
