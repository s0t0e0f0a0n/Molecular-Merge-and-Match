from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.models import ExerciseCreationDraft
from app.db.session import get_db

router = APIRouter(prefix="/exercise-creation/drafts", tags=["exercise-creation"])


class NMRiumDraftPayload(BaseModel):
    nmrium_data: dict[str, Any]


class ExerciseCreationDraftOut(BaseModel):
    id: str
    stage: str
    nmrium_data: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=ExerciseCreationDraftOut, status_code=201)
def create_exercise_creation_draft(body: NMRiumDraftPayload) -> ExerciseCreationDraft:
    with get_db() as db:
        draft = ExerciseCreationDraft(
            id=str(uuid4()),
            stage="nmrium",
            nmrium_data=body.nmrium_data,
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)
        return draft


@router.get("/{draft_id}", response_model=ExerciseCreationDraftOut)
def get_exercise_creation_draft(draft_id: str) -> ExerciseCreationDraft:
    with get_db() as db:
        draft = db.get(ExerciseCreationDraft, draft_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Exercise creation draft not found.")
        return draft


@router.put("/{draft_id}/nmrium", response_model=ExerciseCreationDraftOut)
def update_exercise_creation_draft(
    draft_id: str,
    body: NMRiumDraftPayload,
) -> ExerciseCreationDraft:
    with get_db() as db:
        draft = db.get(ExerciseCreationDraft, draft_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Exercise creation draft not found.")
        draft.nmrium_data = body.nmrium_data
        db.commit()
        db.refresh(draft)
        return draft
