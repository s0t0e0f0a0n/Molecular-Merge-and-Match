from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.models import Exercise, Fragment, LogbookState, Statistics, WorkingSolution
from app.db.session import get_db

router = APIRouter(prefix="/exercises", tags=["exercises"])


class ResetExercisesRequest(BaseModel):
    exercise_ids: list[int]
    level: Literal["logbook", "workspace", "completion", "progression", "exercise"]


@router.post("/reset-batch", status_code=204, response_model=None)
def reset_exercises(body: ResetExercisesRequest) -> None:
    with get_db() as db:
        for exercise_id in set(body.exercise_ids):
            keys = (str(exercise_id), f"exercise-{exercise_id}")
            if body.level in {"logbook", "workspace", "completion"}:
                # Keep the logbook data, but mark it as archived.
                db.query(LogbookState).filter(LogbookState.exercise_id.in_(keys)).update(
                    {LogbookState.archived: datetime.now()},
                    synchronize_session=False,
                )
            if body.level in {"progression", "exercise"}:
                db.query(LogbookState).filter(LogbookState.exercise_id.in_(keys)).delete(synchronize_session=False)
            if body.level in {"workspace", "completion", "progression", "exercise"}:
                db.query(Fragment).filter(Fragment.exercise_id.in_(keys)).delete(synchronize_session=False)
                db.query(WorkingSolution).filter(WorkingSolution.exercise_id.in_(keys)).delete(synchronize_session=False)
            exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
            if body.level in {"completion", "progression", "exercise"} and exercise is not None:
                exercise.completed = False
            if body.level == "completion":
                db.query(Statistics).filter(Statistics.exercise_id.in_(keys)).update(
                    {
                        Statistics.started_at: None,
                        Statistics.timer_total: 0,
                        Statistics.completed_at: None,
                    },
                    synchronize_session=False,
                )
            if body.level in {"progression", "exercise"}:
                db.query(Statistics).filter(Statistics.exercise_id.in_(keys)).delete(synchronize_session=False)
            if body.level == "exercise" and exercise is not None:
                db.delete(exercise)
        db.commit()


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
