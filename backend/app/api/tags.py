from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc

from app.db.models import TagsUsed
from app.db.session import get_db

router = APIRouter(prefix="/tags", tags=["tags"])


class TagOut(BaseModel):
    id: int
    tag_name: str
    description: str | None
    is_persistent: bool
    is_hideable: bool
    is_hidden: bool
    is_cheat: bool
    tag_count: int
    user_tag: bool
    progression_use: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[TagOut])
def list_tags() -> list[TagOut]:
    with get_db() as db:
        rows = db.query(TagsUsed).filter(TagsUsed.deleted_at.is_(None)).order_by(desc(TagsUsed.tag_count), TagsUsed.id.asc()).all()
        return [TagOut(
            id=r.id,
            tag_name=r.tag_name,
            description=r.description,
            is_persistent=bool(r.is_persistent),
            is_hideable=bool(r.is_hideable),
            is_hidden=bool(r.is_hidden),
            is_cheat=bool(r.is_cheat),
            tag_count=int(r.tag_count or 0),
            user_tag=bool(r.user_tag),
            progression_use=bool(r.progression_use),
        ) for r in rows]


@router.get("/{tag_id}", response_model=TagOut)
def get_tag(tag_id: int) -> TagOut:
    with get_db() as db:
        row = db.query(TagsUsed).filter(TagsUsed.id == tag_id, TagsUsed.deleted_at.is_(None)).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        return TagOut(
            id=row.id,
            tag_name=row.tag_name,
            description=row.description,
            is_persistent=bool(row.is_persistent),
            is_hideable=bool(row.is_hideable),
            is_hidden=bool(row.is_hidden),
            is_cheat=bool(row.is_cheat),
            tag_count=int(row.tag_count or 0),
            user_tag=bool(row.user_tag),
            progression_use=bool(row.progression_use),
        )


@router.delete("/{tag_id}", status_code=204, response_model=None)
def delete_tag(tag_id: int) -> None:
    with get_db() as db:
        row = db.query(TagsUsed).filter(TagsUsed.id == tag_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        # soft-delete by setting deleted_at timestamp
        row.deleted_at = datetime.utcnow()
        db.commit()


class TagHideIn(BaseModel):
    is_hidden: bool


@router.put("/{tag_id}/hide", response_model=TagOut)
def set_tag_hidden(tag_id: int, payload: TagHideIn) -> TagOut:
    with get_db() as db:
        row = db.query(TagsUsed).filter(TagsUsed.id == tag_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        row.is_hidden = bool(payload.is_hidden)
        db.commit()
        db.refresh(row)
        return TagOut(
            id=row.id,
            tag_name=row.tag_name,
            description=row.description,
            is_persistent=bool(row.is_persistent),
            is_hideable=bool(row.is_hideable),
            is_hidden=bool(row.is_hidden),
            is_cheat=bool(row.is_cheat),
            tag_count=int(row.tag_count or 0),
            user_tag=bool(row.user_tag),
            progression_use=bool(row.progression_use),
        )


@router.put("/{tag_id}/restore", response_model=TagOut)
def restore_tag(tag_id: int) -> TagOut:
    with get_db() as db:
        row = db.query(TagsUsed).filter(TagsUsed.id == tag_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        row.deleted_at = None
        db.commit()
        db.refresh(row)
        return TagOut(
            id=row.id,
            tag_name=row.tag_name,
            description=row.description,
            is_persistent=bool(row.is_persistent),
            is_hideable=bool(row.is_hideable),
            is_hidden=bool(row.is_hidden),
            is_cheat=bool(row.is_cheat),
            tag_count=int(row.tag_count or 0),
            user_tag=bool(row.user_tag),
            progression_use=bool(row.progression_use),
        )
