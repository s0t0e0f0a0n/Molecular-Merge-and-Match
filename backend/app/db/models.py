from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    molecular_formula: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dbe: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tags_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    bookmark: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise_set: Mapped[str | None] = mapped_column(String(255), nullable=True)

    h1_svg_path: Mapped[str] = mapped_column(Text, nullable=False)
    h1_axis_start: Mapped[float] = mapped_column(Float, nullable=False)
    h1_axis_end: Mapped[float] = mapped_column(Float, nullable=False)

    c13_svg_path: Mapped[str] = mapped_column(Text, nullable=False)
    c13_axis_start: Mapped[float] = mapped_column(Float, nullable=False)
    c13_axis_end: Mapped[float] = mapped_column(Float, nullable=False)

    h1_nmr_text: Mapped[str] = mapped_column(Text, nullable=False)
    h1_frequency_mhz: Mapped[float | None] = mapped_column(Float, nullable=True)
    h1_solvent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    h1_data_source: Mapped[str | None] = mapped_column(String(255), nullable=True)

    c13_nmr_text: Mapped[str] = mapped_column(Text, nullable=False)
    c13_frequency_mhz: Mapped[float | None] = mapped_column(Float, nullable=True)
    c13_solvent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    c13_apt: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    c13_alt_text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    c13_data_source: Mapped[str | None] = mapped_column(String(255), nullable=True)

    alt_nuc_text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    # SvdV added
    # Bookmark, completion status, completion timing, complete at time, open and close time
    # Additional 13C information, incorrect counter, used cheats (which ones), additional 13C tabel
    # Additional 19F/31P etc table
    completed: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=0)

    #alternative CAS numbers for enantiomers and their racemic mixtures
    #alternative InChI is not yet needed
    solution_inchi_hash: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    solution_cas_hash: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    alt1_cas_hash: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    alt2_cas_hash: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    available_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
        #server_default=func.now(),
        #onupdate=func.now(),
    )
    stop_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
        #server_default=func.now(),
        #onupdate=func.now(),
    )
    h1_peaks: Mapped[list["ExerciseH1Peak"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )
    c13_peaks: Mapped[list["ExerciseC13Peak"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )
    c13_couplings: Mapped[list["ExerciseC13Coupling"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )
    alt_nuclei: Mapped[list["ExerciseAdditionalNuclei"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )
    additional_spectra: Mapped[list["ExerciseAdditionalSpectrum"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )

class ExerciseH1Peak(Base):
    __tablename__ = "exercise_h1_peaks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ppm: Mapped[float] = mapped_column(Float, nullable=False)
    multiplicity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    j_values_hz_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    proton_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extra_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    exercise: Mapped["Exercise"] = relationship(back_populates="h1_peaks")

class ExerciseC13Peak(Base):
    __tablename__ = "exercise_c13_peaks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ppm: Mapped[float] = mapped_column(Float, nullable=False)
    atom_tag: Mapped[int] = mapped_column(Integer, nullable=True)
    atom_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    exercise: Mapped["Exercise"] = relationship(back_populates="c13_peaks")

class ExerciseC13Coupling(Base):
    __tablename__ = "exercise_c13_couplings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ppm: Mapped[float] = mapped_column(Float, nullable=False)
    multiplicity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    j_values_hz_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    atom_tag: Mapped[int] = mapped_column(Integer, nullable=True)
    extra_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    exercise: Mapped["Exercise"] = relationship(back_populates="c13_couplings")

class ExerciseAdditionalNuclei(Base):
    __tablename__ = "exercise_alt_nuclei"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nucleus: Mapped[str] = mapped_column(String(5), nullable=False)
    frequency_mhz: Mapped[float | None] = mapped_column(Float, nullable=True)
    atom_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    ppm: Mapped[float] = mapped_column(Float, nullable=False)
    multiplicity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    j_values_hz_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_info: Mapped[str | None] = mapped_column(Text, nullable=True)

    exercise: Mapped["Exercise"] = relationship(back_populates="alt_nuclei")

class ExerciseAdditionalSpectrum(Base):
    __tablename__ = "exercise_additional_spectra"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    exercise: Mapped["Exercise"] = relationship(back_populates="additional_spectra")


class Fragment(Base):
    __tablename__ = "fragments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[str] = mapped_column(String(50), nullable=False, default="ex1")
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    smiles: Mapped[str] = mapped_column(Text, nullable=False)
    mol_file: Mapped[str] = mapped_column(Text, nullable=False)
    annotation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Soft-delete: NULL = active, timestamp = soft-deleted. Lets undo restore the
    # same id (preserving link references) and lets the next created fragment
    # avoid colliding with the deleted one.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None
    )

class TagsUsed(Base):
    __tablename__ = "tags_used"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tag_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_persistent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_hideable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_cheat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tag_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    user_tag: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    # Soft-delete: NULL = active, timestamp = soft-deleted. Similar to Fragment. Want to re-use the same name in current session
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None
    )

class SolventsUsed(Base):
    __tablename__ = "solvents_used"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    names: Mapped[str] = mapped_column(String(255), nullable=False)
    match: Mapped[str] = mapped_column(String(50), nullable=False, default="solvent")
    display: Mapped[str] = mapped_column(String(100), nullable=False, default="solvent")
    preference: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)


class PredefinedFragment(Base):
    """Predefined fragment library - shared list among exercises"""

    __tablename__ = "predefined_fragments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    smiles: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[str] = mapped_column(Text, nullable=False, default="")
    user_added: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class WorkingSolution(Base):
    __tablename__ = "working_solution"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    smiles: Mapped[str | None] = mapped_column(Text, nullable=True)
    mol_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    dbe: Mapped[float | None] = mapped_column(Float, nullable=True)


class LogbookState(Base):
    __tablename__ = "logbook_states"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    entries_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    cursor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    links_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

class Statistics(Base):
    __tablename__ = "statistics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    exercise_id: Mapped[str] = mapped_column(String(50), nullable=False, default="ex1")
    incorrect_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cheats_used: Mapped[int] = mapped_column(Integer, nullable=False, default=000000)
    start_counting: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None
    )
    stop_counting: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None
    )
    timer_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
    )

class UserSettings(Base):
    __tablename__ = "user_settings"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Global setting, not linked to one exercise.
    # Decides what happens to links after merging two fragments.
    link_inherit_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="none",
    )
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="Light")
    layout_opt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    show_CAS_input: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_solvent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_exchange: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_missing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_warnings: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_creation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_timer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cheats: Mapped[str] = mapped_column(String(15), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
