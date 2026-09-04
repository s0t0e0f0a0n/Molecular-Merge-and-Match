from __future__ import annotations

import json
import os
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base
from app.db.models import (
    Exercise,
    ExerciseAdditionalSpectrum,
    ExerciseC13Peak,
    ExerciseH1Peak,
    Fragment,
    PredefinedFragment,
)


def _ensure_sqlite_dir() -> None:
    db_path = settings.sqlite_path
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def _get_seed_file_path(filename: str) -> str:
    raw_db_path = str(settings.sqlite_path).replace("sqlite:///", "")
    db_dir = os.path.dirname(os.path.expandvars(os.path.expanduser(raw_db_path)))

    prod_path = os.path.join(db_dir, filename)
    if os.path.exists(prod_path):
        return prod_path

    base_dir = os.path.dirname(os.path.abspath(__file__))
    dev_path = os.path.normpath(os.path.join(base_dir, "..", "..", "data", filename))
    if os.path.exists(dev_path):
        return dev_path

    return prod_path

def _seed_predefined_fragments() -> None:
    """Insert predefined fragments from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(PredefinedFragment).count() > 0:
            return
        seed_path = _get_seed_file_path("predefined_fragments_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            entries = json.load(f)
        for entry in entries:
            db.add(PredefinedFragment(
                name=entry["name"], smiles=entry["smiles"],
                keywords=entry.get("keywords", ""),
                user_added=False,
            ))
        db.commit()
    finally:
        db.close()


def _seed_exercises() -> None:
    """Insert bundled example exercises if the database is empty."""

    db = SessionLocal()

    try:
        if db.query(Exercise).count() > 0:
            return

        seed_path = _get_seed_file_path("examples_seed.json")

        if not os.path.exists(seed_path):
            return

        with open(seed_path, encoding="utf-8") as f:
            examples = json.load(f)

        for example in examples:
            e = example["exercise"]

            exercise = Exercise(
                name=e.get("name"),
                molecular_formula=e.get("molecular_formula"),
                tags_csv=e.get("tags_csv"),
                exercise_set=e.get("exercise_set"),
                h1_svg_path=e.get("h1_svg_path"),
                h1_axis_start=e.get("h1_axis_start"),
                h1_axis_end=e.get("h1_axis_end"),
                c13_svg_path=e.get("c13_svg_path"),
                c13_axis_start=e.get("c13_axis_start"),
                c13_axis_end=e.get("c13_axis_end"),
                h1_nmr_text=e.get("h1_nmr_text"),
                h1_frequency_mhz=e.get("h1_frequency_mhz"),
                h1_solvent=e.get("h1_solvent"),
                c13_nmr_text=e.get("c13_nmr_text"),
                c13_frequency_mhz=e.get("c13_frequency_mhz"),
                c13_solvent=e.get("c13_solvent"),
                c13_apt=e.get("c13_apt"),
                solution_inchi_hash=e.get("solution_inchi_hash"),
                solution_cas_hash=e.get("solution_cas_hash"),
            )

            db.add(exercise)
            db.flush()

            exercise_id = exercise.id

            for p in example.get("h1_peaks", []):
                db.add(ExerciseH1Peak(
                    exercise_id=exercise_id,
                    ppm=p["ppm"],
                    multiplicity=p.get("multiplicity"),
                    j_values_hz_csv=p.get("j_values_hz_csv"),
                    proton_count=p.get("proton_count"),
                    extra_info=p.get("extra_info"),
                ))

            for p in example.get("c13_peaks", []):
                db.add(ExerciseC13Peak(
                    exercise_id=exercise_id,
                    ppm=p["ppm"],
                    atom_count=p.get("atom_count"),
                    extra_info=p.get("extra_info"),
                ))

            for s in example.get("additional_spectra", []):
                db.add(ExerciseAdditionalSpectrum(
                    exercise_id=exercise_id,
                    file_path=s["file_path"],
                    label=s.get("label"),
                ))

        db.commit()

    finally:
        db.close()


def _migrate_add_missing_columns() -> None:
    """
    Add columns introduced after initial schema creation and drop columns
    removed from the model.

    SQLAlchemy's create_all only creates missing tables, not missing columns,
    so existing databases need explicit ALTER TABLE statements.
    """
    from sqlalchemy import text

    with engine.connect() as conn:
        # Drop deprecated tables
        conn.execute(text("DROP TABLE IF EXISTS exercise_cas_answers"))
        conn.commit()

        # Update Exercise model
        result_exercise = conn.execute(text("PRAGMA table_info(exercises)"))
        existing_exercise = {row[1] for row in result_exercise}
        if "c13_apt" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN c13_apt INTEGER"))
            conn.commit()

        if "exercise_set" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN exercise_set TEXT"))
            conn.commit()

        # solution_smiles_hash and cas_answer was removed from the model; drop it so it
        # does not cause NOT NULL constraint failures on INSERT.
        # if "solution_smiles_hash" in existing_exercise:
        #     conn.execute(text("ALTER TABLE exercises DROP COLUMN solution_smiles_hash"))
        #     conn.commit()
        # Rename solution_smiles_hash -> solution_inchi_hash if needed.
        if "solution_inchi_hash" not in existing_exercise and "solution_smiles_hash" in existing_exercise:
            conn.execute(
                text("ALTER TABLE exercises RENAME COLUMN solution_smiles_hash TO solution_inchi_hash")
            )
            conn.commit()
        if "cas_answer" in existing_exercise:
            conn.execute(text("ALTER TABLE exercises DROP COLUMN cas_answer"))
            conn.commit()
        if "solution_cas_hash" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN solution_cas_hash TEXT"))
            conn.commit()

        # Update WorkingSolution model
        result_workingsolution = conn.execute(text("PRAGMA table_info(working_solution)"))
        existing_workingsolution = {row[1] for row in result_workingsolution}
        if "dbe" not in existing_workingsolution:
            conn.execute(text("ALTER TABLE working_solution ADD COLUMN dbe REAL"))
            conn.commit()

        # Update Fragment model
        result_fragment = conn.execute(text("PRAGMA table_info(fragments)"))
        existing_fragment = {row[1] for row in result_fragment}
        if "annotation" not in existing_fragment:
            conn.execute(text("ALTER TABLE fragments ADD COLUMN annotation TEXT"))
            conn.commit()


def _purge_soft_deleted_fragments() -> None:
    """Hard-delete any fragment rows still flagged as soft-deleted from a
    previous backend session. The undo logbook lives in browser sessionStorage,
    so soft-deleted rows can never be restored across a backend restart."""

    db = SessionLocal()
    try:
        db.query(Fragment).filter(Fragment.deleted_at.isnot(None)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def init_db() -> None:
    """
    Create tables and seed predefined fragments.
    """

    _ensure_sqlite_dir()
    # Import models so they register on Base.metadata.
    from app.db import models  # noqa: F401  # side-effect: registers models on Base.metadata

    Base.metadata.create_all(bind=engine)
    _migrate_add_missing_columns()
    _purge_soft_deleted_fragments()
    _seed_predefined_fragments()
    _seed_exercises()


@contextmanager
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
