from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy.orm import Session

from app.db.models import SolventsUsed

SOLVENT_TOKEN_RE = re.compile(r"%solv\{(\d+)\}")


def split_escaped_names(raw_names: str) -> list[str]:
    """Split comma-separated names while supporting escaped commas (\\,)."""
    parts: list[str] = []
    current: list[str] = []
    escaping = False

    for ch in raw_names:
        if escaping:
            current.append(ch)
            escaping = False
            continue

        if ch == "\\":
            escaping = True
            continue

        if ch == ",":
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
            continue

        current.append(ch)

    if escaping:
        current.append("\\")

    tail = "".join(current).strip()
    if tail:
        parts.append(tail)

    return parts


def _preferred_name(row: SolventsUsed) -> str:
    options = split_escaped_names(row.names)
    if not options:
        return row.match

    preferred_index = row.preference if row.preference is not None else 0
    if preferred_index < 0 or preferred_index >= len(options):
        preferred_index = 0
    return options[preferred_index]


def extract_solvent_ids(solvent_text: str | None) -> set[int]:
    if not solvent_text:
        return set()
    return {int(match.group(1)) for match in SOLVENT_TOKEN_RE.finditer(solvent_text)}


def apply_solvent_count_delta(db: Session, solvent_ids: Iterable[int], delta: int) -> None:
    ids = sorted({sid for sid in solvent_ids if sid > 0})
    if not ids or delta == 0:
        return

    rows = db.query(SolventsUsed).filter(SolventsUsed.id.in_(ids)).all()
    for row in rows:
        current = int(row.count or 0)
        row.count = max(0, current + delta)


def resolve_solvent_tokens(db: Session, solvent_text: str | None) -> str | None:
    if not solvent_text:
        return solvent_text

    ids = extract_solvent_ids(solvent_text)
    if not ids:
        return solvent_text

    rows = db.query(SolventsUsed).filter(SolventsUsed.id.in_(ids)).all()
    by_id = {row.id: row for row in rows}

    def _replace(match: re.Match[str]) -> str:
        sid = int(match.group(1))
        row = by_id.get(sid)
        if row is None:
            return match.group(0)
        return _preferred_name(row)

    return SOLVENT_TOKEN_RE.sub(_replace, solvent_text)


def _find_exact_match_span(solvent_text: str, match_value: str) -> tuple[int, int] | None:
    if not match_value:
        return None

    # Matching is intentionally case-insensitive.
    pattern = re.compile(
        rf"(?<![0-9A-Za-z]){re.escape(match_value)}(?![0-9A-Za-z])",
        flags=re.IGNORECASE,
    )
    found = pattern.search(solvent_text)
    if not found:
        return None
    return found.start(), found.end()


def _token_for(solvent_id: int) -> str:
    return f"%solv{{{solvent_id}}}"


def encode_solvent_text(db: Session, raw_solvent_text: str | None) -> tuple[str | None, int | None]:
    """Replace a known solvent match inside text with a solvent-id token.

    Returns the encoded text and the solvent id that was referenced.
    """
    if raw_solvent_text is None:
        return None, None

    solvent_text = raw_solvent_text.strip()
    if not solvent_text:
        return None, None

    rows = db.query(SolventsUsed).all()
    rows.sort(key=lambda row: (-len(row.match or ""), row.id))

    for row in rows:
        span = _find_exact_match_span(solvent_text, row.match)
        if span is None:
            continue
        start, end = span
        encoded = f"{solvent_text[:start]}{_token_for(row.id)}{solvent_text[end:]}"
        return encoded, row.id

    created = SolventsUsed(
        names=solvent_text,
        match=solvent_text,
        preference=0,
        count=0,
    )
    db.add(created)
    db.flush()
    return _token_for(created.id), created.id
