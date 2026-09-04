from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db.models import PredefinedFragment
from app.db.session import get_db

router = APIRouter(prefix="/predefined-fragments", tags=["predefined-fragments"])


class PredefinedFragmentCreate(BaseModel):
    name: str
    smiles: str
    keywords: str = ""


class PredefinedFragmentOut(BaseModel):
    id: int
    name: str
    smiles: str
    keywords: str
    user_added: bool
    model_config = {"from_attributes": True}


@router.get("/", response_model=list[PredefinedFragmentOut])
def list_predefined_fragments(
    search: str | None = Query(None),
) -> list[PredefinedFragment]:
    with get_db() as db:
        frags = db.query(PredefinedFragment).order_by(PredefinedFragment.id).all()
        if search:
            try:
                pat = re.compile(search, re.IGNORECASE)
            except re.error:
                raise HTTPException(400, detail="Invalid regex")
            frags = [f for f in frags if pat.search(f.keywords) or pat.search(f.name)]
        return frags

@router.post("/", response_model=PredefinedFragmentOut, status_code=201)
def create_predefined_fragment(body: PredefinedFragmentCreate):
    with get_db() as db:
        frag = PredefinedFragment(
            name=body.name,
            smiles=body.smiles,
            keywords=body.keywords,
            user_added=True,
        )
        db.add(frag)
        db.commit()
        db.refresh(frag)
        return frag


@router.delete("/{fragment_id}", status_code=204, response_model=None)
def delete_predefined_fragment(fragment_id: int):
    with get_db() as db:
        frag = db.query(PredefinedFragment).filter(PredefinedFragment.id == fragment_id).first()
        if not frag:
            raise HTTPException(status_code=404, detail="Predefined fragment not found")
        db.delete(frag)
        db.commit()
