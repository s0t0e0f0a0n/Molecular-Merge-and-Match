from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.models import WorkingSolution
from app.db.session import get_db

router = APIRouter(prefix="/working-solution", tags=["working-solution"])


class WorkingSolutionBody(BaseModel):
    smiles: str
    mol_file: str


class WorkingSolutionOut(BaseModel):
    smiles: str | None
    mol_file: str | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=WorkingSolutionOut | None)
def get_working_solution(exercise_id: str = Query(...)):
    with get_db() as db:
        row = (
            db.query(WorkingSolution)
            .filter(WorkingSolution.exercise_id == exercise_id)
            .first()
        )
        if not row or (row.smiles is None and row.mol_file is None):
            return None
        return row


@router.put("/", response_model=WorkingSolutionOut)
def set_working_solution(
    body: WorkingSolutionBody, exercise_id: str = Query(...)
) -> WorkingSolution:
    with get_db() as db:
        row = (
            db.query(WorkingSolution)
            .filter(WorkingSolution.exercise_id == exercise_id)
            .first()
        )
        if row:
            row.smiles = body.smiles
            row.mol_file = body.mol_file
        else:
            row = WorkingSolution(
                exercise_id=exercise_id,
                smiles=body.smiles,
                mol_file=body.mol_file,
            )
            db.add(row)
        db.commit()
        db.refresh(row)
        return row


@router.delete("/", status_code=204, response_model=None)
def clear_working_solution(exercise_id: str = Query(...)):
    with get_db() as db:
        row = (
            db.query(WorkingSolution)
            .filter(WorkingSolution.exercise_id == exercise_id)
            .first()
        )
        if row:
            row.smiles = None
            row.mol_file = None
            db.commit()
