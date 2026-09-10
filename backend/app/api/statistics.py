from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.models import Exercise, Statistics, UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/statistics", tags=["statistics"])


class StatisticsOut(BaseModel):
    exercise_id: str
    incorrect_count: int
    cheats_used: str
    start_counting: datetime | None = None
    stop_counting: datetime | None = None
    timer_total: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


def _ensure_statistics_row(db, exercise_id: int | str) -> tuple[Statistics, bool]:
    exercise_key = str(exercise_id)
    row = (
        db.query(Statistics)
        .filter(Statistics.exercise_id == exercise_key)
        .first()
    )
    if row is not None:
        return row, False

    row = Statistics(exercise_id=exercise_key)
    db.add(row)
    db.flush()
    return row, True


def _find_statistics_row(db, exercise_id: str) -> Statistics | None:
    """Try to find a statistics row for the given id, accepting both
    bare numeric ids ("8") and prefixed keys ("exercise-8")."""
    key = str(exercise_id)
    row = db.query(Statistics).filter(Statistics.exercise_id == key).first()
    if row is not None:
        return row

    # If key is numeric, try the prefixed form
    if key.isdigit():
        alt = f"exercise-{key}"
        row = db.query(Statistics).filter(Statistics.exercise_id == alt).first()
        if row is not None:
            return row

    # If key starts with exercise- try the bare numeric suffix
    if key.startswith("exercise-"):
        suffix = key[len("exercise-"):]
        if suffix:
            row = db.query(Statistics).filter(Statistics.exercise_id == suffix).first()
            if row is not None:
                return row

    return None


def _exercise_is_incomplete(db, exercise_id: int | str) -> bool:
    try:
        exercise = db.query(Exercise).filter(Exercise.id == int(exercise_id)).first()
    except (TypeError, ValueError):
        return True
    return exercise is None or exercise.completed is not True


def _exercise_is_completed(db, exercise_id: int | str) -> bool:
    return _exercise_is_incomplete(db, exercise_id) is False


def _finalize_timer(row: Statistics, stopped_at: datetime, *, count_short_elapsed: bool) -> None:
    if row.start_counting is None or row.stop_counting is not None:
        return

    row.stop_counting = stopped_at
    elapsed_seconds = (row.stop_counting - row.start_counting).total_seconds()
    if count_short_elapsed or elapsed_seconds >= 20:
        row.timer_total += int(max(0, elapsed_seconds))


def mark_exercise_selected(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, created = _ensure_statistics_row(db, exercise_id)
        row.started_at = row.started_at or datetime.now()
        if _exercise_is_incomplete(db, exercise_id):
            row.start_counting = datetime.now() + timedelta(seconds=5)
            row.stop_counting = None
        db.commit()
        db.refresh(row)


def mark_exercise_closed(exercise_id: int | str) -> None:
    with get_db() as db:
        row, _ = _ensure_statistics_row(db, exercise_id)
        if row.start_counting is None or row.stop_counting is not None:
            db.refresh(row)
            return

        is_completed = _exercise_is_completed(db, exercise_id)
        _finalize_timer(row, datetime.now(), count_short_elapsed=is_completed)

        db.commit()
        db.refresh(row)


def mark_exercise_paused(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        if row.start_counting is None or row.stop_counting is not None:
            db.refresh(row)
            return

        # A user-initiated pause should always flush the elapsed segment.
        _finalize_timer(row, datetime.now(), count_short_elapsed=True)

        db.commit()
        db.refresh(row)


def mark_exercise_completed(exercise_id: int | str) -> None:
    with get_db() as db:
        # Once completion was recorded, repeated completion calls must not mutate statistics.
        existing = (
            db.query(Statistics)
            .filter(Statistics.exercise_id == str(exercise_id))
            .first()
        )
        if existing is not None and existing.completed_at is not None:
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        row.cheats_used = settings.cheats if settings is not None else "000000000000"
        completed_at = row.completed_at or datetime.now()
        row.completed_at = completed_at
        _finalize_timer(row, completed_at, count_short_elapsed=True)
        db.commit()
        db.refresh(row)


def mark_exercise_resumed(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        if row.stop_counting is None and row.start_counting is not None:
            db.refresh(row)
            return

        now = datetime.now()
        row.start_counting = now
        row.stop_counting = None

        db.commit()
        db.refresh(row)


def increment_incorrect_count(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        row.incorrect_count += 1
        db.commit()
        db.refresh(row)


@router.get("/", response_model=StatisticsOut)
def get_statistics(exercise_id: str = Query(...)) -> StatisticsOut:
    with get_db() as db:
        row = _find_statistics_row(db, exercise_id)
        if row is None:
            # If no statistics row exists yet, create one to maintain previous behavior
            # where selecting an exercise resulted in an available statistics row.
            row, _ = _ensure_statistics_row(db, exercise_id)
            db.commit()
            db.refresh(row)
        return StatisticsOut.model_validate(row)


@router.post("/stop", response_model=StatisticsOut)
def stop_exercise_timer(exercise_id: str = Query(...)) -> StatisticsOut:
    mark_exercise_closed(exercise_id)
    return get_statistics(exercise_id=exercise_id)


@router.post("/pause", response_model=StatisticsOut)
def pause_exercise_timer(exercise_id: str = Query(...)) -> StatisticsOut:
    mark_exercise_paused(exercise_id)
    return get_statistics(exercise_id=exercise_id)


@router.post("/resume", response_model=StatisticsOut)
def resume_exercise_timer(exercise_id: str = Query(...)) -> StatisticsOut:
    mark_exercise_resumed(exercise_id)
    return get_statistics(exercise_id=exercise_id)

