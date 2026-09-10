from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db.models import Exercise, LogbookState, Statistics, UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/statistics", tags=["statistics"])


class StatisticsOut(BaseModel):
    exercise_id: str
    incorrect_count: int = 0
    cheats_used: str = "000000000000"
    fragments_drawn: int | None = 0
    merges_done: int | None = 0
    matches_done: int | None = 0
    start_counting: datetime | None = None
    stop_counting: datetime | None = None
    timer_total: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    difficulty: str = "O0"

    model_config = {"from_attributes": True}


class DifficultyRatingIn(BaseModel):
    rating: Literal["E", "M", "D"]


def _is_reference_exercise(db, exercise_id: int | str) -> bool:
    try:
        exercise = db.query(Exercise).filter(Exercise.id == int(exercise_id)).first()
    except (TypeError, ValueError):
        return False
    return exercise is not None and (exercise.exercise_set or "").strip().lower() == "references"


def _ensure_statistics_row(db, exercise_id: int | str) -> tuple[Statistics | None, bool]:
    if _is_reference_exercise(db, exercise_id):
        return None, False

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


def _logbook_event_counts(db, exercise_id: int | str) -> tuple[int, int, int]:
    key = str(exercise_id)
    keys = [key]
    if key.isdigit():
        keys.append(f"exercise-{key}")
    elif key.startswith("exercise-"):
        keys.append(key[len("exercise-"):])

    row = db.query(LogbookState).filter(LogbookState.exercise_id.in_(keys)).first()
    if row is None:
        return 0, 0, 0

    try:
        entries = json.loads(row.entries_json)
    except (TypeError, json.JSONDecodeError):
        return 0, 0, 0
    if not isinstance(entries, list):
        return 0, 0, 0

    created_fragments = sum(1 for entry in entries if isinstance(entry, dict) and entry.get("kind") == "create-fragment")
    deleted_fragments = sum(1 for entry in entries if isinstance(entry, dict) and entry.get("kind") == "delete-fragment")
    linked = sum(1 for entry in entries if isinstance(entry, dict) and entry.get("kind") == "link")
    unlinked = sum(1 for entry in entries if isinstance(entry, dict) and entry.get("kind") == "unlink")
    merges = sum(1 for entry in entries if isinstance(entry, dict) and entry.get("kind") == "merge-fragments")
    return max(0, created_fragments - deleted_fragments), max(0, linked - unlinked), merges


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
        if row is None:
            return
        row.started_at = row.started_at or datetime.now()
        if _exercise_is_incomplete(db, exercise_id):
            row.start_counting = datetime.now() + timedelta(seconds=5)
            row.stop_counting = None
        db.commit()
        db.refresh(row)


def mark_exercise_closed(exercise_id: int | str) -> None:
    with get_db() as db:
        row, _ = _ensure_statistics_row(db, exercise_id)
        if row is None or row.start_counting is None or row.stop_counting is not None:
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
        if row is None:
            return
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
        if row is None:
            return
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        row.cheats_used = settings.cheats if settings is not None else "000000000000"
        completed_at = row.completed_at or datetime.now()
        row.completed_at = completed_at
        row.fragments_drawn, row.matches_done, row.merges_done = _logbook_event_counts(db, exercise_id)
        _finalize_timer(row, completed_at, count_short_elapsed=True)
        db.commit()
        db.refresh(row)


def mark_exercise_resumed(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        if row is None:
            return
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
        if row is None:
            return
        row.incorrect_count += 1
        db.commit()
        db.refresh(row)


def _next_difficulty(current: str | None, rating: str) -> str:
    match = re.fullmatch(r"[EMD](\d+)", current or "")
    count = int(match.group(1)) if match else 1
    return f"{rating}{count}"


@router.get("/", response_model=StatisticsOut)
def get_statistics(exercise_id: str = Query(...)) -> StatisticsOut:
    with get_db() as db:
        if _is_reference_exercise(db, exercise_id):
            return StatisticsOut(exercise_id=str(exercise_id))
        row = _find_statistics_row(db, exercise_id)
        if row is None:
            # If no statistics row exists yet, create one to maintain previous behavior
            # where selecting an exercise resulted in an available statistics row.
            row, _ = _ensure_statistics_row(db, exercise_id)
            db.commit()
            db.refresh(row)
        return StatisticsOut.model_validate(row)


@router.post("/difficulty", response_model=StatisticsOut)
def rate_exercise_difficulty(
    exercise_id: str = Query(...), body: DifficultyRatingIn = ...
) -> StatisticsOut:
    with get_db() as db:
        if _is_reference_exercise(db, exercise_id):
            return StatisticsOut(exercise_id=str(exercise_id), difficulty=f"{body.rating}1")
        row = _find_statistics_row(db, exercise_id)
        if row is None:
            row, _ = _ensure_statistics_row(db, exercise_id)
        row.difficulty = _next_difficulty(row.difficulty, body.rating)
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

