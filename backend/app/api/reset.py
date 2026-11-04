from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.statistics_keys import statistics_exercise_id_keys
from app.core.usage_counts import recount_exercise_usage
from app.db.models import (
    Exercise,
    Fragment,
    LogbookState,
    Statistics,
    StatisticsReviewEvent,
    WorkingSolution,
)
from app.db.session import _reopen_overdue_exercises_in_db, get_db

router = APIRouter(prefix="/exercises", tags=["exercises"])


class ResetExercisesRequest(BaseModel):
    exercise_ids: list[int]
    level: Literal["logbook", "workspace", "completion", "progression", "exercise"]


def reset_exercise_data(db, exercise_id: int, level: str) -> None:
    keys = (str(exercise_id), f"exercise-{exercise_id}")
    # Seeded examples and references have no statistics row; only full deletion applies to them.
    if level != "exercise" and db.query(Statistics.id).filter(
        Statistics.exercise_id.in_(statistics_exercise_id_keys(exercise_id))
    ).first() is None:
        return
    if level in {"logbook", "workspace", "completion"}:
        # Keep the logbook data, but mark it as archived; the next write starts a new row.
        db.query(LogbookState).filter(
            LogbookState.exercise_id.in_(keys),
            LogbookState.archived.is_(None),
        ).update(
            {LogbookState.archived: datetime.now()},
            synchronize_session=False,
        )
    if level in {"progression", "exercise"}:
        db.query(LogbookState).filter(LogbookState.exercise_id.in_(keys)).delete(synchronize_session=False)
    if level in {"workspace", "completion", "progression", "exercise"}:
        db.query(Fragment).filter(Fragment.exercise_id.in_(keys)).delete(synchronize_session=False)
        db.query(WorkingSolution).filter(WorkingSolution.exercise_id.in_(keys)).delete(synchronize_session=False)
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
    if level in {"completion", "progression", "exercise"} and exercise is not None:
        exercise.completed = False
    if level == "completion":
        db.query(Statistics).filter(Statistics.exercise_id.in_(keys)).update(
            {
                Statistics.started_at: None,
                Statistics.timer_total: 0,
                Statistics.completed_at: None,
            },
            synchronize_session=False,
        )
    if level in {"progression", "exercise"}:
        db.query(StatisticsReviewEvent).filter(
            StatisticsReviewEvent.exercise_id.in_(keys)
        ).delete(synchronize_session=False)
        db.query(Statistics).filter(Statistics.exercise_id.in_(keys)).delete(synchronize_session=False)
    if level == "exercise" and exercise is not None:
        db.delete(exercise)


@router.post("/reset-batch", status_code=204, response_model=None)
def reset_exercises(body: ResetExercisesRequest) -> None:
    with get_db() as db:
        for exercise_id in set(body.exercise_ids):
            reset_exercise_data(db, exercise_id, body.level)
        if body.level == "exercise":
            db.flush()
            recount_exercise_usage(db)
        db.commit()


class ResetDueExercisesResponse(BaseModel):
    exercise_ids: list[int]


@router.post("/reset-due", response_model=ResetDueExercisesResponse)
def reset_due_exercises() -> ResetDueExercisesResponse:
    # Same reopening as enabling spaced repetition; due dates are left untouched.
    with get_db() as db:
        exercise_ids = _reopen_overdue_exercises_in_db(db, require_sr_mode=False)
        db.commit()
    return ResetDueExercisesResponse(exercise_ids=exercise_ids)


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
        logbook = db.query(LogbookState).filter(
            LogbookState.exercise_id == exercise_id,
            LogbookState.archived.is_(None),
        ).first()
        if logbook is not None:
            logbook.entries_json = "[]"
            logbook.cursor = 0
            logbook.links_json = "[]"
        db.commit()
