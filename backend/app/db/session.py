from __future__ import annotations

import json
import os
from contextlib import contextmanager
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.calculation import calculate_dbe, parse_formula
from app.core.config import settings
from app.db.base import Base
from app.db.models import (
    Exercise,
    ExerciseAdditionalSpectrum,
    ExerciseC13Peak,
    ExerciseH1Peak,
    ExerciseC13Coupling,
    SolventsUsed,
    TagsUsed,
    Fragment,
    PredefinedFragment,
    UserSettings,
    WorkingSolution,
)


_USER_SETTINGS_PRESETS: tuple[dict[str, object], ...] = (
    {
        "name": "Default",
        "link_inherit_mode": "none",
        "theme": "Light",
        "layout_opt": 0,
        "show_CAS_input": False,
        "show_solvent": True,
        "show_exchange": True,
        "show_missing": False,
        "show_warnings": True,
        "show_timer": True,
        "cheats": "000000000000",
    },
    {
        "name": "Beginner",
        "link_inherit_mode": "none",
        "theme": "Light",
        "layout_opt": 0,
        "show_CAS_input": True,
        "show_solvent": True,
        "show_exchange": True,
        "show_missing": True,
        "show_warnings": True,
        "show_timer": True,
        "cheats": "110100000000",
    },
    {
        "name": "Exam",
        "link_inherit_mode": "none",
        "theme": "Light",
        "layout_opt": 0,
        "show_CAS_input": False,
        "show_solvent": False,
        "show_exchange": False,
        "show_missing": False,
        "show_warnings": False,
        "show_timer": True,
        "cheats": "000000000000",
    },
    {
        "name": "User",
        "link_inherit_mode": "none",
        "theme": "Light",
        "layout_opt": 0,
        "show_CAS_input": False,
        "show_solvent": True,
        "show_exchange": True,
        "show_missing": False,
        "show_warnings": True,
        "show_timer": True,
        "cheats": "000000000000",
    },
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

def _seed_solvents() -> None:
    """Insert predefined solvents from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(SolventsUsed).count() > 0:
            return
        seed_path = _get_seed_file_path("solvent_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            solvents = json.load(f)
        for sol in solvents:
            db.add(SolventsUsed(
                names=sol["names"],
                match=sol["match"],
                display=sol["display"],
                preference=sol["preference"],
                count=sol.get("count", 0),
            ))
        db.commit()
    finally:
        db.close()

def _seed_tags() -> None:
    """Insert predefined tags from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(TagsUsed).count() > 0:
            return
        seed_path = _get_seed_file_path("tags_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            tags = json.load(f)
        for tag in tags:
            db.add(TagsUsed(
                tag_name=tag["tag_name"],
                description=tag["description"],
                is_persistent=tag.get("is_persistent", False),
                is_hidden=tag.get("is_hidden", False),
                is_cheat=tag.get("is_cheat", False),
                tag_count=tag.get("tag_count", 0),
                user_tag=tag.get("user_tag", False),
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
            molecular_formula = e.get("molecular_formula")

            formula_dbe = e.get("dbe")
            if formula_dbe is None:
                try:
                    formula_dbe = (
                        calculate_dbe(parse_formula(molecular_formula))
                        if molecular_formula
                        else 0.0
                    )
                except ValueError:
                    formula_dbe = 0.0

            exercise = Exercise(
                name=e.get("name"),
                molecular_formula=molecular_formula,
                dbe=formula_dbe,
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
                c13_alt_text=e.get("c13_alt_text"),
                c13_frequency_mhz=e.get("c13_frequency_mhz"),
                c13_solvent=e.get("c13_solvent"),
                c13_apt=e.get("c13_apt"),
                completed=e.get("completed"),
                solution_inchi_hash=e.get("solution_inchi_hash"),
                solution_cas_hash=e.get("solution_cas_hash"),
                h1_data_source=e.get("h1_data_source"),
                c13_data_source=e.get("c13_data_source"),
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
                    atom_tag=p.get("atom_tag"),
                    atom_count=p.get("atom_count") or 1,
                ))

            for c in example.get("c13_couplings", []):
                db.add(ExerciseC13Coupling(
                    exercise_id=exercise_id,
                    ppm=c["ppm"],
                    multiplicity=c.get("multiplicity"),
                    j_values_hz_csv=c.get("j_values_hz_csv"),
                    extra_info=c.get("extra_info"),
                    atom_tag=c.get("atom_tag"),
                    
                ))

            for s in example.get("additional_spectra", []):
                db.add(ExerciseAdditionalSpectrum(
                    exercise_id=exercise_id,
                    file_path=s["file_path"],
                    label=s.get("label"),
                    priority=s.get("priority") or 0,
                ))

        db.commit()

    finally:
        db.close()

def _seed_preloaded_fragments() -> None:
    """Insert preloaded fragments from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(Fragment).count() > 0:
            return
        seed_path = _get_seed_file_path("preloaded_fragments_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            frags = json.load(f)
        for frag in frags:
            db.add(Fragment(
                exercise_id=frag["exercise_id"], label=frag["label"],
                smiles=frag["smiles"], mol_file=frag["mol_file"],
                annotation=frag["annotation"],
            ))
        db.commit()
    finally:
        db.close()


def _seed_preloaded_solutions() -> None:
    """Insert predefined answers from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(WorkingSolution).count() > 0:
            return
        seed_path = _get_seed_file_path("preloaded_solutions_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            answers = json.load(f)
        for answer in answers:
            db.add(WorkingSolution(
                exercise_id=answer["exercise_id"],
                smiles=answer["smiles"],
                mol_file=answer["mol_file"],
                dbe=answer["dbe"],
            ))
        db.commit()
    finally:
        db.close()


def _seed_user_settings_presets() -> None:
    """Ensure hardcoded named UserSettings presets exist in the database."""

    db = SessionLocal()
    try:
        existing_by_name = {
            row.name: row
            for row in db.query(UserSettings).filter(UserSettings.name.isnot(None)).all()
            if row.name
        }

        created_any = False
        for preset in _USER_SETTINGS_PRESETS:
            preset_name = str(preset["name"])
            if preset_name in existing_by_name:
                continue
            db.add(UserSettings(**preset))
            created_any = True

        if created_any:
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
        if "bookmark" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN bookmark INTEGER"))
            conn.commit()
        if "completed" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN completed BOOLEAN DEFAULT 0"))
            conn.commit()
        if "available_at" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN available_at DATETIME"))
            conn.commit()
        if "stop_at" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN stop_at DATETIME"))
            conn.commit()
        if "alt1_cas_hash" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN alt1_cas_hash TEXT"))
            conn.commit()
        if "alt2_cas_hash" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN alt2_cas_hash TEXT"))
            conn.commit()
        if "h1_data_source" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN h1_data_source STRING(255)"))
            conn.commit()
        if "c13_data_source" not in existing_exercise:
            conn.execute(text("ALTER TABLE exercises ADD COLUMN c13_data_source STRING(255)"))
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
        # Update UserSettings model
        result_settings = conn.execute(text("PRAGMA table_info(user_settings)"))
        existing_settings = {row[1] for row in result_settings}
        if "name" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN name TEXT"))
            conn.commit()
        if "show_CAS_input" not in existing_settings and "solvent_labels" in existing_settings:
            conn.execute(text("ALTER TABLE user_settings RENAME COLUMN solvent_labels TO show_CAS_input"))
            conn.commit()
        if "show_solvent" not in existing_settings and "solvent_opt" in existing_settings:
            conn.execute(text("ALTER TABLE user_settings RENAME COLUMN solvent_opt TO show_solvent"))
            conn.commit()
        if "show_exchange" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN show_exchange BOOLEAN"))
            conn.commit()
        if "show_missing" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN show_missing BOOLEAN"))
            conn.commit()
        if "show_warnings" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN show_warnings BOOLEAN"))
            conn.commit()
        if "show_creation" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN show_creation BOOLEAN"))
            conn.commit()
        if "show_timer" not in existing_settings:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN show_timer BOOLEAN"))
            conn.commit()
        conn.execute(text("UPDATE user_settings SET name = 'user' WHERE name IS NULL OR TRIM(name) = ''"))
        conn.commit()
        conn.execute(text("DELETE FROM user_settings WHERE name = 'user' AND id NOT IN (SELECT MIN(id) FROM user_settings WHERE name = 'user')"))
        conn.commit()

        # Update SolventsUsed model
        result_solvents = conn.execute(text("PRAGMA table_info(solvents_used)"))
        existing_solvents = {row[1] for row in result_solvents}
        if "preference" not in existing_solvents:
            conn.execute(text("ALTER TABLE solvents_used ADD COLUMN preference INTEGER NOT NULL DEFAULT 0"))
            conn.commit()
        if "count" not in existing_solvents:
            conn.execute(text("ALTER TABLE solvents_used ADD COLUMN count INTEGER"))
            conn.commit()
        if "display" not in existing_solvents:
            conn.execute(text("ALTER TABLE solvents_used ADD COLUMN display STRING(100)"))
            conn.commit()

        # Update TagsUsed model
        result_tags = conn.execute(text("PRAGMA table_info(tags_used)"))
        existing_tags = {row[1] for row in result_tags}
        if "description" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN description TEXT"))
            conn.commit()
        if "tag_count" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN tag_count INTEGER"))
            conn.commit()
        if "is_persistent" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN is_persistent BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
        if "is_hidden" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
        if "user_tag" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN user_tag BOOLEAN"))
            conn.commit()
        if "is_hideable" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN is_hideable BOOLEAN NOT NULL DEFAULT 1"))
            conn.commit()
        if "is_cheat" not in existing_tags:
            conn.execute(text("ALTER TABLE tags_used ADD COLUMN is_cheat BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()


        # Update Statistics model
        result_statistics = conn.execute(text("PRAGMA table_info(statistics)"))
        existing_statistics = {row[1] for row in result_statistics}
        if "started_at" not in existing_statistics:
            conn.execute(text("ALTER TABLE statistics ADD COLUMN started_at DATETIME"))
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

        # Update C13 peaks model for older database versions
        result_c13_peaks = conn.execute(text("PRAGMA table_info(exercise_c13_peaks)"))
        existing_c13_peaks = {row[1] for row in result_c13_peaks}
        if "atom_tag" not in existing_c13_peaks:
            conn.execute(text("ALTER TABLE exercise_c13_peaks ADD COLUMN atom_tag INTEGER"))
            conn.commit()
        if "atom_count" not in existing_c13_peaks:
            conn.execute(
                text("ALTER TABLE exercise_c13_peaks ADD COLUMN atom_count INTEGER NOT NULL DEFAULT 1")
            )
            conn.commit()

        result_alt_nuclei = conn.execute(text("PRAGMA table_info(exercise_alt_nuclei)"))
        existing_alt_nuclei = {row[1] for row in result_alt_nuclei}
        if "atom_count" not in existing_alt_nuclei:
            conn.execute(
                text("ALTER TABLE exercise_alt_nuclei ADD COLUMN atom_count INTEGER NOT NULL DEFAULT 1")
            )
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
    _seed_user_settings_presets()
    _purge_soft_deleted_fragments()
    _seed_predefined_fragments()
    _seed_solvents()
    _seed_tags()
    _seed_exercises()
    _seed_preloaded_fragments()
    _seed_preloaded_solutions()


@contextmanager
def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
