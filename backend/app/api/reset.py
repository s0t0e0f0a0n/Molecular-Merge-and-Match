from __future__ import annotations

from fastapi import APIRouter, Query

from app.db.models import Fragment, LogbookState, WorkingSolution
from app.db.session import get_db

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.post("/reset", status_code=204, response_model=None)
def reset_exercise(exercise_id: str = Query(...)) -> None:
    # Clear the state of the exercise (fragments, working solution, logbook)
    with get_db() as db:
        db.query(Fragment).filter(
            Fragment.exercise_id == exercise_id,
        ).delete(synchronize_session=False)
        db.query(WorkingSolution).filter(
            WorkingSolution.exercise_id == exercise_id,
        ).delete(synchronize_session=False)
        db.query(LogbookState).filter(
            LogbookState.exercise_id == exercise_id,
        ).delete(synchronize_session=False)
        db.commit()
