from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.models import Fragment, LogbookState
from app.db.session import get_db

router = APIRouter(prefix="/logbook", tags=["logbook"])


class LogbookStateBody(BaseModel):
    entries_json: str
    cursor: int
    links_json: str


class LogbookStateOut(BaseModel):
    entries_json: str
    cursor: int
    links_json: str

    model_config = {"from_attributes": True}


@router.get("/", response_model=LogbookStateOut)
def get_logbook(exercise_id: str = Query(...)) -> LogbookStateOut:
    with get_db() as db:
        row = (
            db.query(LogbookState)
            .filter(LogbookState.exercise_id == exercise_id)
            .first()
        )
        if not row:
            return LogbookStateOut(entries_json="[]", cursor=0, links_json="[]")
        return LogbookStateOut.model_validate(row)


@router.put("/", response_model=LogbookStateOut)
def set_logbook(
    body: LogbookStateBody, exercise_id: str = Query(...)
) -> LogbookState:
    with get_db() as db:
        row = (
            db.query(LogbookState)
            .filter(LogbookState.exercise_id == exercise_id)
            .first()
        )
        if row:
            row.entries_json = body.entries_json
            row.cursor = body.cursor
            row.links_json = body.links_json
        else:
            row = LogbookState(
                exercise_id=exercise_id,
                entries_json=body.entries_json,
                cursor=body.cursor,
                links_json=body.links_json,
            )
            db.add(row)
        db.commit()
        db.refresh(row)
        return row


@router.delete("/", status_code=204, response_model=None)
def clear_logbook(exercise_id: str = Query(...)) -> None:
    # After clearing, undo should not be able to bring deleted fragments back.
    with get_db() as db:
        db.query(LogbookState).filter(
            LogbookState.exercise_id == exercise_id
        ).delete(synchronize_session=False)
        db.query(Fragment).filter(
            Fragment.exercise_id == exercise_id,
            Fragment.deleted_at.isnot(None),
        ).delete(synchronize_session=False)
        db.commit()
