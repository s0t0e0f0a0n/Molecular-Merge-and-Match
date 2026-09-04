from __future__ import annotations

import re
from typing import Iterable, List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.solvent_tokens import split_escaped_names
from app.db.models import TagsUsed

TAG_TOKEN_RE = re.compile(r"%tag\{(\d+)\}")


def extract_tag_ids(tag_text: str | None) -> set[int]:
    if not tag_text:
        return set()
    return {int(match.group(1)) for match in TAG_TOKEN_RE.finditer(tag_text)}


def apply_tag_count_delta(db: Session, tag_ids: Iterable[int], delta: int) -> None:
    ids = sorted({tid for tid in tag_ids if tid > 0})
    if not ids or delta == 0:
        return

    rows = db.query(TagsUsed).filter(TagsUsed.id.in_(ids)).all()
    for row in rows:
        current = int(row.tag_count or 0)
        row.tag_count = max(0, current + delta)


def resolve_tag_tokens(db: Session, tag_text: str | None, omit_hidden: bool = False) -> str | None:
    if not tag_text:
        return tag_text

    ids = extract_tag_ids(tag_text)
    if not ids:
        return tag_text

    query = db.query(TagsUsed).filter(TagsUsed.id.in_(ids))
    if omit_hidden:
        query = query.filter(TagsUsed.is_hidden.is_(False))

    rows = query.all()
    by_id = {row.id: row for row in rows}

    def _replace(match: re.Match[str]) -> str:
        tid = int(match.group(1))
        row = by_id.get(tid)
        if row is None:
            return '' if omit_hidden else match.group(0)
        return row.tag_name

    return TAG_TOKEN_RE.sub(_replace, tag_text)


def encode_tags_list(db: Session, tags: List[str]) -> Tuple[str | None, set[int]]:
    """Encode a list of plain tag names into token references, creating TagsUsed rows when needed.

    Returns encoded CSV string and set of created/used tag ids.
    """
    if not tags:
        return None, set()

    ids: list[int] = []
    for tag in tags:
        name = tag.strip()
        if not name:
            continue

        # Find existing tag case-insensitively and not soft-deleted
        existing = (
            db.query(TagsUsed)
            .filter(func.lower(TagsUsed.tag_name) == name.lower())
            .filter(TagsUsed.deleted_at.is_(None))
            .first()
        )
        if existing is None:
            created = TagsUsed(
                tag_name=name,
                is_persistent=False,
                is_hidden=False,
                tag_count=0,
                user_tag=True,
            )
            db.add(created)
            db.flush()
            ids.append(created.id)
        else:
            ids.append(existing.id)

    encoded_parts = [f"%tag{{{i}}}" for i in ids]
    encoded_csv = ",".join(encoded_parts) if encoded_parts else None
    return encoded_csv, set(ids)
