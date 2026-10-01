from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.core.solvent_tokens import extract_solvent_ids
from app.core.tag_tokens import extract_tag_ids
from app.db.models import Exercise, SolventsUsed, TagsUsed


def recount_exercise_usage(db: Session) -> None:
    solvent_rows = db.query(SolventsUsed).all()
    tag_rows = db.query(TagsUsed).all()
    solvent_counts = {row.id: 0 for row in solvent_rows}
    tag_counts = {row.id: 0 for row in tag_rows}

    for exercise in db.query(Exercise).all():
        for tag_id in extract_tag_ids(exercise.tags_csv):
            if tag_id in tag_counts:
                tag_counts[tag_id] += 1

        solvent_ids = extract_solvent_ids(exercise.h1_solvent) | extract_solvent_ids(exercise.c13_solvent)
        raw_solvents = " ".join(filter(None, (exercise.h1_solvent, exercise.c13_solvent)))
        for row in solvent_rows:
            if row.match and re.search(
                rf"(?<![0-9A-Za-z]){re.escape(row.match)}(?![0-9A-Za-z])",
                raw_solvents,
                flags=re.IGNORECASE,
            ):
                solvent_ids.add(row.id)
        for solvent_id in solvent_ids:
            if solvent_id in solvent_counts:
                solvent_counts[solvent_id] += 1

    for row in solvent_rows:
        row.count = solvent_counts[row.id]
    for row in tag_rows:
        row.tag_count = tag_counts[row.id]
