from __future__ import annotations

from datetime import datetime
from typing import Dict

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.statistics import checkpoint_short_timer_for_logbook_entry
from app.db.models import Fragment, LogbookState
from app.db.session import get_db

router = APIRouter(prefix="/logbook", tags=["logbook"])


class LogbookStateBody(BaseModel):
    entries_json: str
    cursor: int
    links_json: str


class LogbookStateOut(BaseModel):
    entries_json: str
    cursor: int
    links_json: str
    restarts: str = "[]"
    pause_events_json: str = "[]"

    model_config = {"from_attributes": True}


class LogbookHistoryOut(LogbookStateOut):
    archived: datetime | None = None

    model_config = {"from_attributes": True}


class LogbookStateSaveOut(LogbookStateOut):
    timer_checkpointed: bool = False

    model_config = {"from_attributes": True}


@router.get("/all", response_model=Dict[str, LogbookStateOut])
def get_all_logbooks() -> dict[str, LogbookStateOut]:
    with get_db() as db:
        rows = db.query(LogbookState).filter(LogbookState.archived.is_(None)).all()
        return {
            row.exercise_id: LogbookStateOut.model_validate(row)
            for row in rows
        }


@router.get("/history", response_model=Dict[str, list[LogbookHistoryOut]])
def get_logbook_history() -> dict[str, list[LogbookHistoryOut]]:
    # Every attempt, archived ones included, for statistics.
    with get_db() as db:
        history: dict[str, list[LogbookHistoryOut]] = {}
        for row in db.query(LogbookState).order_by(LogbookState.id).all():
            history.setdefault(row.exercise_id, []).append(LogbookHistoryOut.model_validate(row))
        return history


@router.get("/", response_model=LogbookStateOut)
def get_logbook(exercise_id: str = Query(...)) -> LogbookStateOut:
    with get_db() as db:
        row = (
            db.query(LogbookState)
            .filter(
                LogbookState.exercise_id == exercise_id,
                LogbookState.archived.is_(None),
            )
            .first()
        )
        if not row:
            return LogbookStateOut(entries_json="[]", cursor=0, links_json="[]")
        return LogbookStateOut.model_validate(row)


@router.put("/", response_model=LogbookStateSaveOut)
def set_logbook(
    body: LogbookStateBody, exercise_id: str = Query(...)
) -> LogbookStateSaveOut:
    with get_db() as db:
        row = (
            db.query(LogbookState)
            .filter(
                LogbookState.exercise_id == exercise_id,
                LogbookState.archived.is_(None),
            )
            .first()
        )
        previous_entries_json = row.entries_json if row else "[]"
        if row:
            row.entries_json = body.entries_json
            row.cursor = body.cursor
            row.links_json = body.links_json
        else:
            row = LogbookState(
                exercise_id=exercise_id,
                entries_json=body.entries_json,
                cursor=body.cursor,
                links_json=body.links_json,
            )
            db.add(row)
        timer_checkpointed = checkpoint_short_timer_for_logbook_entry(
            db,
            exercise_id,
            previous_entries_json,
            body.entries_json,
        )
        db.commit()
        db.refresh(row)
        return LogbookStateSaveOut.model_validate(row).model_copy(
            update={"timer_checkpointed": timer_checkpointed}
        )


@router.delete("/", status_code=204, response_model=None)
def clear_logbook(exercise_id: str = Query(...)) -> None:
    # After clearing, undo should not be able to bring deleted fragments back.
    with get_db() as db:
        row = db.query(LogbookState).filter(
            LogbookState.exercise_id == exercise_id,
            LogbookState.archived.is_(None),
        ).first()
        if row is not None:
            row.entries_json = "[]"
            row.cursor = 0
            row.links_json = "[]"
        db.query(Fragment).filter(
            Fragment.exercise_id == exercise_id,
            Fragment.deleted_at.isnot(None),
        ).delete(synchronize_session=False)
        db.commit()
