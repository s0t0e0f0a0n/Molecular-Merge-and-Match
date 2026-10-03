from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.api.spacedrep import calculate_spaced_repetition_interval
from app.core.statistics_keys import (
    canonical_statistics_exercise_id,
    statistics_exercise_id_keys,
)
from app.db.models import Exercise, LogbookState, Statistics, UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/statistics", tags=["statistics"])
MIN_TIMER_SECONDS_TO_PERSIST = 10


class StatisticsOut(BaseModel):
    exercise_id: str
    incorrect_count: int = 0
    cheats_used: str = "000000000000"
    cheats_off: datetime | None = None
    fragments_drawn: int | None = 0
    merges_done: int | None = 0
    matches_done: int | None = 0
    start_counting: datetime | None = None
    stop_counting: datetime | None = None
    timer_total: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    difficulty: str = "O0"
    confidence: int = 0

    model_config = {"from_attributes": True}


class DifficultyRatingIn(BaseModel):
    rating: Literal["E", "M", "D"]
    confidence: int = Field(default=3, ge=1, le=5)
    iterate: bool = False


def _is_reference_exercise(db, exercise_id: int | str) -> bool:
    try:
        exercise = db.query(Exercise).filter(Exercise.id == int(exercise_id)).first()
    except (TypeError, ValueError):
        return False
    return exercise is not None and (exercise.exercise_set or "").strip().lower() == "references"


def _ensure_statistics_row(db, exercise_id: int | str) -> tuple[Statistics | None, bool]:
    if _is_reference_exercise(db, exercise_id):
        return None, False

    row = _find_statistics_row(db, str(exercise_id))
    if row is not None:
        return row, False

    row = Statistics(exercise_id=canonical_statistics_exercise_id(exercise_id))
    db.add(row)
    db.flush()
    return row, True


def _find_statistics_row(db, exercise_id: str) -> Statistics | None:
    """Try to find a statistics row for the given id, accepting both
    bare numeric ids ("8") and prefixed keys ("exercise-8")."""
    for key in statistics_exercise_id_keys(exercise_id):
        row = db.query(Statistics).filter(Statistics.exercise_id == key).first()
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


def _find_or_create_logbook_state(db, exercise_id: int | str) -> LogbookState:
    key = str(exercise_id)
    bare_key = key.removeprefix("exercise-")
    keys = [key]
    if bare_key.isdigit():
        keys = [f"exercise-{bare_key}", bare_key]

    for storage_key in keys:
        row = (
            db.query(LogbookState)
            .filter(LogbookState.exercise_id == storage_key)
            .first()
        )
        if row is not None:
            return row

    row = LogbookState(
        exercise_id=f"exercise-{bare_key}" if bare_key.isdigit() else key,
    )
    db.add(row)
    db.flush()
    return row


def _load_restart_intervals(logbook: LogbookState) -> list[dict[str, str | None]]:
    try:
        intervals = json.loads(logbook.restarts or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(intervals, list):
        return []
    return [
        interval for interval in intervals
        if isinstance(interval, dict) and isinstance(interval.get("start"), str)
    ]


def _record_timer_start(db, exercise_id: int | str, started_at: datetime) -> None:
    logbook = _find_or_create_logbook_state(db, exercise_id)
    intervals = _load_restart_intervals(logbook)
    if intervals and intervals[-1].get("stop") is None:
        intervals[-1]["stop"] = started_at.isoformat()
    intervals.append({"start": started_at.isoformat(), "stop": None})
    logbook.restarts = json.dumps(intervals)


def _record_timer_stop(db, row: Statistics, stopped_at: datetime) -> None:
    logbook = _find_or_create_logbook_state(db, row.exercise_id)
    intervals = _load_restart_intervals(logbook)
    active_interval = next(
        (interval for interval in reversed(intervals) if interval.get("stop") is None),
        None,
    )
    if active_interval is None:
        if row.start_counting is None:
            return
        active_interval = {"start": row.start_counting.isoformat(), "stop": None}
        intervals.append(active_interval)
    active_interval["stop"] = stopped_at.isoformat()
    logbook.restarts = json.dumps(intervals)


def _finalize_timer(
    db,
    row: Statistics,
    stopped_at: datetime,
    *,
    count_short_elapsed: bool,
) -> None:
    if row.start_counting is None or row.stop_counting is not None:
        return

    row.stop_counting = stopped_at
    _record_timer_stop(db, row, stopped_at)
    elapsed_seconds = (row.stop_counting - row.start_counting).total_seconds()
    if count_short_elapsed or elapsed_seconds >= MIN_TIMER_SECONDS_TO_PERSIST:
        row.timer_total += int(max(0, elapsed_seconds))


def _parse_logbook_entry_timestamp(value: object) -> datetime | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        timestamp = float(value)
        if abs(timestamp) >= 1e11:
            timestamp /= 1000
        try:
            return datetime.fromtimestamp(timestamp)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if timestamp.tzinfo is not None:
                return timestamp.astimezone().replace(tzinfo=None)
            return timestamp
        except ValueError:
            return None
    return None


def checkpoint_short_timer_for_logbook_entry(
    db,
    exercise_id: int | str,
    previous_entries_json: str,
    entries_json: str,
) -> bool:
    try:
        previous_entries = json.loads(previous_entries_json or "[]")
        entries = json.loads(entries_json or "[]")
    except (TypeError, json.JSONDecodeError):
        return False
    if not isinstance(previous_entries, list) or not isinstance(entries, list):
        return False

    previous_ids = {
        str(entry["id"])
        for entry in previous_entries
        if isinstance(entry, dict) and entry.get("id") is not None
    }
    new_entry_timestamps = [
        _parse_logbook_entry_timestamp(entry.get("ts"))
        for entry in entries
        if isinstance(entry, dict)
        and entry.get("id") is not None
        and str(entry["id"]) not in previous_ids
    ]
    new_entry_timestamps = [timestamp for timestamp in new_entry_timestamps if timestamp is not None]
    if not new_entry_timestamps:
        return False

    row = _find_statistics_row(db, str(exercise_id))
    if row is None or row.start_counting is None or row.stop_counting is not None:
        return False
    now = datetime.now()
    elapsed_seconds = (now - row.start_counting).total_seconds()
    if not 0 <= elapsed_seconds < MIN_TIMER_SECONDS_TO_PERSIST:
        return False
    if not any(row.start_counting <= timestamp <= now for timestamp in new_entry_timestamps):
        return False

    _finalize_timer(db, row, now, count_short_elapsed=True)
    row.start_counting = now
    row.stop_counting = None
    _record_timer_start(db, row.exercise_id, now)
    return True


def mark_exercise_selected(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, created = _ensure_statistics_row(db, exercise_id)
        if row is None:
            return
        if created or row.started_at is None:
            row.started_at = datetime.now()
        if _exercise_is_incomplete(db, exercise_id):
            now = datetime.now()
            if row.start_counting is not None and row.stop_counting is None:
                _finalize_timer(db, row, now, count_short_elapsed=True)
            row.start_counting = now + timedelta(seconds=3)
            row.stop_counting = None
            _record_timer_start(db, row.exercise_id, row.start_counting)
        db.commit()
        db.refresh(row)


def mark_exercise_closed(exercise_id: int | str) -> None:
    with get_db() as db:
        row, _ = _ensure_statistics_row(db, exercise_id)
        if row is None:
            return

        row.pause_total += 1
        if row.start_counting is not None and row.stop_counting is None:
            _finalize_timer(db, row, datetime.now(), count_short_elapsed=True)

        db.commit()
        db.refresh(row)


def mark_exercise_paused(exercise_id: int | str) -> None:
    with get_db() as db:
        if _exercise_is_completed(db, exercise_id):
            return

        row, _ = _ensure_statistics_row(db, exercise_id)
        if row is None:
            return
        row.pause_total += 1
        if row.start_counting is None or row.stop_counting is not None:
            db.commit()
            db.refresh(row)
            return

        # A user-initiated pause should always flush the elapsed segment.
        _finalize_timer(db, row, datetime.now(), count_short_elapsed=True)

        db.commit()
        db.refresh(row)


def mark_exercise_completed(exercise_id: int | str) -> None:
    with get_db() as db:
        # Once completion was recorded, repeated completion calls must not mutate statistics.
        existing = _find_statistics_row(db, str(exercise_id))
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
        _finalize_timer(db, row, completed_at, count_short_elapsed=True)
        spaced_repetition = calculate_spaced_repetition_interval(
            timer_total=row.timer_total,
            incorrect_count=row.incorrect_count,
            cheats_used=row.cheats_used,
            confidence=row.confidence,
            difficulty=row.difficulty,
            completed_at=completed_at,
            cheats_off=row.cheats_off,
        )
        row.mastery_index = spaced_repetition["mastery_index"]
        exercise = db.query(Exercise).filter(Exercise.id == int(exercise_id)).first()
        if exercise is not None:
            exercise.due_time = completed_at + timedelta(
                days=spaced_repetition["next_review_days"]
            )
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
        _record_timer_start(db, row.exercise_id, now)

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


def reset_difficulty_counter(row: Statistics) -> None:
    match = re.fullmatch(r"([EMD])(\d+)", row.difficulty or "")
    if match and int(match.group(2)) != 0:
        row.difficulty = f"{match.group(1)}0"


def reset_exercise_difficulty(exercise_id: int | str) -> None:
    with get_db() as db:
        row = _find_statistics_row(db, str(exercise_id))
        if row is None:
            return
        reset_difficulty_counter(row)
        db.commit()


def _next_difficulty(current: str | None, rating: str, *, increment: bool) -> str:
    match = re.fullmatch(r"[EMD](\d+)", current or "")
    count = int(match.group(1)) if match else 0
    if increment:
        count += 1
    count = max(1, count)
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
        row.difficulty = _next_difficulty(row.difficulty, body.rating, increment=body.iterate)
        row.confidence = body.confidence
        # Rating arrives after completion, so mastery must be recomputed with it.
        if row.completed_at is not None:
            spaced_repetition = calculate_spaced_repetition_interval(
                timer_total=row.timer_total,
                incorrect_count=row.incorrect_count,
                cheats_used=row.cheats_used,
                confidence=row.confidence,
                difficulty=row.difficulty,
                completed_at=row.completed_at,
                cheats_off=row.cheats_off,
            )
            row.mastery_index = spaced_repetition["mastery_index"]
            exercise = db.query(Exercise).filter(Exercise.id == int(exercise_id)).first()
            if exercise is not None:
                exercise.due_time = row.completed_at + timedelta(
                    days=spaced_repetition["next_review_days"]
                )
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
