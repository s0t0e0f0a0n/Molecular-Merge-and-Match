from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db.models import Fragment
from app.db.session import get_db

router = APIRouter(prefix="/fragments", tags=["fragments"])


class FragmentCreate(BaseModel):
    exercise_id: str
    label: str
    smiles: str
    mol_file: str


class FragmentUpdate(BaseModel):
    smiles: str
    mol_file: str


class FragmentOut(BaseModel):
    id: int
    exercise_id: str
    label: str
    smiles: str
    mol_file: str
    annotation: str | None = None

    model_config = {"from_attributes": True}


class FragmentAnnotationUpdate(BaseModel):
    annotation: str | None


@router.get("/", response_model=list[FragmentOut])
def list_fragments(exercise_id: str = Query(...)) -> list[Fragment]:
    with get_db() as db:
        return (
            db.query(Fragment)
            .filter(Fragment.exercise_id == exercise_id)
            .filter(Fragment.deleted_at.is_(None))
            .order_by(Fragment.id)
            .all()
        )


@router.post("/", response_model=FragmentOut, status_code=201)
def create_fragment(body: FragmentCreate) -> Fragment:
    with get_db() as db:
        frag = Fragment(
            exercise_id=body.exercise_id,
            label=body.label,
            smiles=body.smiles,
            mol_file=body.mol_file,
        )
        db.add(frag)
        db.commit()
        db.refresh(frag)
        return frag


@router.put("/{fragment_id}", response_model=FragmentOut)
def update_fragment(fragment_id: int, body: FragmentUpdate) -> Fragment:
    with get_db() as db:
        frag = (
            db.query(Fragment)
            .filter(Fragment.id == fragment_id, Fragment.deleted_at.is_(None))
            .first()
        )
        if not frag:
            raise HTTPException(status_code=404, detail="Fragment not found")
        frag.smiles = body.smiles
        frag.mol_file = body.mol_file
        db.commit()
        db.refresh(frag)
        return frag


@router.delete("/{fragment_id}", status_code=204, response_model=None)
def delete_fragment(fragment_id: int):
    """Soft-delete: keep the row but flag it. Undo can restore the same id."""
    with get_db() as db:
        frag = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        if not frag or frag.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Fragment not found")
        frag.deleted_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/{fragment_id}/restore", response_model=FragmentOut)
def restore_fragment(fragment_id: int) -> Fragment:
    """Bring back a soft-deleted fragment with the same id. Idempotent."""
    with get_db() as db:
        frag = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        if not frag:
            raise HTTPException(status_code=404, detail="Fragment not found")
        if frag.deleted_at is not None:
            frag.deleted_at = None
            db.commit()
            db.refresh(frag)
        return frag


@router.put("/{fragment_id}/annotation")
def update_fragment_annotation(fragment_id: int, payload: FragmentAnnotationUpdate):
    with get_db() as db:
        fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        if not fragment:
            raise HTTPException(status_code=404, detail="Fragment not found")

        fragment.annotation = payload.annotation
        db.commit()

        return {"status": "ok", "annotation": fragment.annotation}
