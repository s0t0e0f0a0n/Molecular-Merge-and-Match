import math
import re
from datetime import datetime, timedelta
from typing import TypedDict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.statistics_keys import (
    canonical_statistics_exercise_id,
    statistics_exercise_id_keys,
)
from app.db.models import Exercise, Statistics
from app.db.session import get_db

router = APIRouter(prefix="/spacedrep", tags=["spacedrep"])


class SkipExerciseOut(BaseModel):
    due_time: datetime | None


class SpacedRepetitionResult(TypedDict):
    mastery_index: float
    next_review_days: float
    debug_components: dict[str, float]


def calculate_spaced_repetition_interval(
    timer_total: int,
    incorrect_count: int,
    cheats_used: str,
    confidence: int,
    difficulty: str,
    completed_at: datetime | None = None,
    cheats_off: datetime | None = None,
) -> SpacedRepetitionResult:
    """Calculate mastery and review interval from a Statistics row's values."""
    difficulty_match = re.fullmatch(r"([EMD])(\d+)", difficulty or "")
    if difficulty_match:
        difficulty_level = {"E": 1, "M": 2, "D": 3}[difficulty_match.group(1)]
        completion_count = int(difficulty_match.group(2))
    else:
        difficulty_level = 2
        completion_count = 0

    time_min = max(0, timer_total) / 60.0
    incorrect_tries = max(0, incorrect_count)
    completed_soon_after_disabling = bool(
        completed_at
        and cheats_off
        and 0 <= (completed_at - cheats_off).total_seconds() <= 60
    )
    cheat_used = completed_soon_after_disabling or (cheats_used or "").startswith("1")
    confidence_level = confidence if 1 <= confidence <= 5 else 3
    is_first_attempt = completion_count <= 1

    c_penalty = 0.0 if cheat_used else math.exp(-0.4 * incorrect_tries)
    c_time = 1.0 - (time_min - 1.0) / 39.0
    c_difficulty = (3.0 - difficulty_level) / 2.0
    c_confidence = (confidence_level - 1.0) / 4.0

    mastery = (
        (0.35 * c_penalty)
        + (0.25 * c_time)
        + (0.20 * c_difficulty)
        + (0.20 * c_confidence)
    )
    history_multiplier = (
        1.3
        if not is_first_attempt and not cheat_used and incorrect_tries == 0
        else 1.0
    )
    mastery_index = max(0.0, mastery * history_multiplier)
    next_review_days = 2.0 + 38.0 * (mastery_index**2)

    return {
        "mastery_index": mastery_index,
        "next_review_days": round(next_review_days, 2),
        "debug_components": {
            "C_P": c_penalty,
            "C_T": c_time,
            "C_D": c_difficulty,
            "C_C": c_confidence,
        },
    }


@router.post("/{exercise_id}/skip", response_model=SkipExerciseOut)
def skip_exercise(exercise_id: int) -> SkipExerciseOut:
    with get_db() as db:
        exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if exercise is None:
            raise HTTPException(status_code=404, detail="Exercise not found.")
        if exercise.in_SR == 0:
            return SkipExerciseOut(due_time=exercise.due_time)

        statistics = None
        for statistics_key in statistics_exercise_id_keys(exercise_id):
            statistics = (
                db.query(Statistics)
                .filter(Statistics.exercise_id == statistics_key)
                .first()
            )
            if statistics is not None:
                break
        if statistics is None:
            statistics = Statistics(
                exercise_id=canonical_statistics_exercise_id(exercise_id)
            )
            db.add(statistics)

        if exercise.completed is True:
            if statistics.completed_at is not None:
                spaced_repetition = calculate_spaced_repetition_interval(
                    timer_total=statistics.timer_total,
                    incorrect_count=statistics.incorrect_count,
                    cheats_used=statistics.cheats_used,
                    confidence=statistics.confidence,
                    difficulty=statistics.difficulty,
                    completed_at=statistics.completed_at,
                    cheats_off=statistics.cheats_off,
                )
                statistics.mastery_index = spaced_repetition["mastery_index"]
                exercise.due_time = statistics.completed_at + timedelta(
                    days=spaced_repetition["next_review_days"]
                )
            elif exercise.due_time is None:
                raise HTTPException(
                    status_code=409,
                    detail="Completed exercise is missing its completion time.",
                )
        else:
            exercise.due_time = datetime.now() + timedelta(hours=6)
        db.commit()
        db.refresh(exercise)
        return SkipExerciseOut(due_time=exercise.due_time)
