from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import logging
import math
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import (
    Exercise,
    ExerciseAdditionalSpectrum,
    ExerciseC13Peak,
    ExerciseH1Peak,
    Fragment,
    LogbookState,
    WorkingSolution,
)
from app.db.session import get_db

_SVG_SCRIPT_RE = re.compile(r"<script[\s\S]*?</script\s*>", re.IGNORECASE)
_SVG_EVENT_ATTR_RE = re.compile(
    r"""\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)""", re.IGNORECASE
)
_ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME = {
    "ir": 1,
    "h-presat": 2,
    "h-31p-dec": 3,
    "h-19f-dec": 3,
    "h-psyche": 4,
    "h-noe-diff": 4,
    "c-bbdec": 5,
    "c-dept-135": 5,
    "c-dept-90": 5,
    "c-dept-45": 5,
    "c-gated": 5,
    "cosy": 6,
    "hsqc": 6,
    "hmqc": 6,
    "mehsqc": 6,
    "19f": 7,
    "19f-1h-dec": 8,
    "31p": 9,
    "31p-1h-dec": 10,
    "10B": 11,
    "11B": 11,
    "14N": 11,
    "29Si": 11,
    "hmbc": 12,
    "h2bc": 13,
    "noesy": 14,
    "roesy": 14,
    "hoesy": 15,
    "tocsy": 16,
    "hsqc-tocsy": 17,
    "hsqc-hecade": 18,
    "hmbc-gated": 19,
    "inadequate": 20,
    "inad-sym": 21,
}

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/exercises", tags=["exercises"])


def _priority_for_additional_spectrum_filename(filename: str) -> int:
    stem = Path(filename).stem
    if not stem:
        return 0

    parts = stem.split("_")
    if len(parts) > 1:
        token = "_".join(parts[1:]).strip()
    else:
        token = stem.strip()

    normalized_token = token.lower().replace(" ", "")
    return _ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME.get(normalized_token, 0)


class AxisScale(BaseModel):
    begin: float
    end: float

    @field_validator("begin", "end")
    @classmethod
    def validate_finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Axis value must be a finite number.")
        return value

    @model_validator(mode="after")
    def validate_not_equal(self) -> "AxisScale":
        if self.begin == self.end:
            raise ValueError("Axis begin and end cannot be equal.")
        return self


class UploadedSvgPayload(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    svg_text: str = Field(min_length=1)

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        file_name = Path(value).name
        if file_name != value:
            raise ValueError("Filename must not contain path segments.")
        if not file_name.lower().endswith(".svg"):
            raise ValueError("File must be an SVG (.svg).")
        return file_name

    @field_validator("svg_text")
    @classmethod
    def validate_svg_content(cls, value: str) -> str:
        value = _SVG_SCRIPT_RE.sub("", value)
        value = _SVG_EVENT_ATTR_RE.sub("", value)
        lowered = value.lower()
        if "<svg" not in lowered or "</svg>" not in lowered:
            raise ValueError("Provided content is not a valid SVG document.")
        return value


class AdditionalSpectrumPayload(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    file_base64: str = Field(min_length=1)
    label: str | None = Field(default=None, max_length=255)

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        file_name = Path(value).name
        if file_name != value:
            raise ValueError("Filename must not contain path segments.")
        allowed = {".svg", ".png", ".jpg", ".jpeg"}
        suffix = Path(file_name).suffix.lower()
        if suffix not in allowed:
            raise ValueError("Additional spectra must be SVG, PNG, JPG, or JPEG.")
        return file_name


class ExerciseCreate(BaseModel):
    h1_spectrum_svg: UploadedSvgPayload
    h1_axis_scale: AxisScale
    h1_nmr_text: str = Field(min_length=1)

    c13_spectrum_svg: UploadedSvgPayload
    c13_axis_scale: AxisScale
    c13_nmr_text: str = Field(min_length=1)
    c13_apt: bool | None = Field(default=None)
    molecular_formula: str | None = Field(default=None, max_length=100)
    solution_inchi: str | None = Field(default=None)
    solution_cas_number: str | None = Field(default=None, max_length=100)

    name: str | None = Field(default=None, max_length=255)
    exercise_set: str | None = Field(default=None, max_length=255)
    tags: list[str] = Field(default_factory=list)
    additional_spectra: list[AdditionalSpectrumPayload] = Field(default_factory=list)

    solvent: str | None = Field(default=None, max_length=100)
    h1_solvent: str | None = Field(default=None, max_length=100)
    c13_solvent: str | None = Field(default=None, max_length=100)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in tags:
            t = tag.strip()
            if not t:
                continue
            if len(t) > 64:
                raise ValueError("Tag is too long (max 64 characters).")
            if "," in t:
                raise ValueError("Tags cannot contain commas.")
            cleaned.append(t)
        return cleaned

    @model_validator(mode="after")
    def validate_name(self) -> "ExerciseCreate":
        if self.name is not None and not self.name.strip():
            raise ValueError("Name cannot be empty if provided.")
        if self.exercise_set is not None and not self.exercise_set.strip():
            raise ValueError("Exercise set cannot be empty if provided.")
        return self


class H1PeakOut(BaseModel):
    id: int
    ppm: float
    multiplicity: str | None
    j_values_hz_csv: str | None
    proton_count: int | None
    extra_info: str | None

    model_config = {"from_attributes": True}


class C13PeakOut(BaseModel):
    id: int
    ppm: float
    atom_count: int
    extra_info: str | None

    model_config = {"from_attributes": True}


class AdditionalSpectrumOut(BaseModel):
    id: int
    file_path: str
    label: str | None
    priority: int

    model_config = {"from_attributes": True}


class ExerciseOut(BaseModel):
    id: int
    name: str | None
    molecular_formula: str | None
    exercise_set: str | None
    tags: list[str]

    h1_svg_path: str
    h1_svg_url: str   #A relative path is needed to actually use the svg
    h1_axis_start: float
    h1_axis_end: float
    h1_nmr_text: str
    h1_frequency_mhz: float | None
    h1_solvent: str | None
    h1_peaks: list[H1PeakOut]

    c13_svg_path: str
    c13_svg_url: str    #A relative path is needed to actually use the svg
    c13_axis_start: float
    c13_axis_end: float
    c13_nmr_text: str
    c13_frequency_mhz: float | None
    c13_solvent: str | None
    c13_apt: bool | None
    c13_peaks: list[C13PeakOut]

    additional_spectra: list[AdditionalSpectrumOut]

    model_config = {"from_attributes": True}

class ExerciseSummaryOut(BaseModel):
    id: int
    name: str | None
    exercise_set: str | None
    tags: list[str]

    model_config = {"from_attributes": True}


class CasAnswerValidationIn(BaseModel):
    cas_number: str


class CasAnswerValidationOut(BaseModel):
    is_correct: bool


class SolutionValidationIn(BaseModel):
    solution_hash: str


class SolutionValidationOut(BaseModel):
    is_correct: bool

class DbeUpdate(BaseModel):
    dbe: float | None

class DbeOut(BaseModel):
    dbe: float | None

def _uploads_root() -> Path:
    sqlite_parent = Path(settings.sqlite_path).resolve().parent
    root = sqlite_parent / "uploads" / "exercises"
    root.mkdir(parents=True, exist_ok=True)
    return root

def _upload_file_path_to_url(file_path: str) -> str:
    """Convert absolute upload file path to public upload URL."""
    uploads_dir = Path(settings.sqlite_path).resolve().parent / "uploads"
    rel = Path(file_path).resolve().relative_to(uploads_dir)
    return "/uploads/" + rel.as_posix()


def _abs_path_to_url(path: str) -> str:
    """Convert an absolute upload path to a routable URL path served by the static mount."""
    # Already a public URL
    if path.startswith("/uploads/") or path.startswith("/examples/") or path.startswith("/references/"):
        return path

    uploads_dir = Path(settings.sqlite_path).resolve().parent / "uploads"

    try:
        rel = Path(path).resolve().relative_to(uploads_dir)
        return "/uploads/" + rel.as_posix()
    except Exception:
        return path


def _write_text_file(content: str, original_filename: str, folder: str) -> str:
    root = _uploads_root() / folder
    root.mkdir(parents=True, exist_ok=True)
    suffix = Path(original_filename).suffix.lower() or ".txt"
    target_name = f"{uuid4().hex}{suffix}"
    target_path = root / target_name
    target_path.write_text(content, encoding="utf-8")
    return str(target_path)


def _write_base64_file(content_base64: str, original_filename: str, folder: str) -> str:
    root = _uploads_root() / folder
    root.mkdir(parents=True, exist_ok=True)

    suffix = Path(original_filename).suffix.lower() or ".bin"
    target_name = f"{uuid4().hex}{suffix}"
    target_path = root / target_name

    try:
        raw = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail="Invalid base64 file payload."
        ) from exc

    target_path.write_bytes(raw)
    return str(target_path)


def _normalize_j_values_to_csv(raw: str) -> str | None:
    values: list[str] = []
    for part in re.split(r"[;,]", raw):
        token = part.strip()
        if not token:
            continue
        try:
            values.append(str(float(token)))
        except ValueError:
            continue
    if not values:
        return None
    return ",".join(values)


def _parse_h1_nmr_text(text: str) -> tuple[float | None, str | None, list[dict]]:
    h1_re = re.compile(
        r"^\s*1H\s*-\s*NMR\s*\(\s*(.+?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*MHz\s*\)\s*:\s*(.+?)\s*;\s*$",
        flags=re.IGNORECASE,
    )
    m = h1_re.match(text.strip())
    if not m:
        raise HTTPException(
            status_code=422,
            detail="Invalid 1H ACS string format. Expected: 1H-NMR (solvent, x MHz): ...;",
        )

    solvent = m.group(1).strip()
    frequency_mhz = float(m.group(2))
    peaks_part = m.group(3).strip()

    peak_matches = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*\(([^)]*)\)", peaks_part)
    if not peak_matches:
        raise HTTPException(
            status_code=422, detail="No valid 1H peaks found in ACS string."
        )

    peaks: list[dict] = []
    for ppm_str, descriptor in peak_matches:
        ppm = float(ppm_str)
        desc = descriptor.strip()

        tokens = [t.strip() for t in desc.split(",") if t.strip()]
        multiplicity = next(
            (
                token
                for token in tokens
                if not re.fullmatch(r"\d+\s*H\b", token, flags=re.IGNORECASE)
                and not re.match(r"J\s*=", token, flags=re.IGNORECASE)
                and not re.fullmatch(
                    r"[0-9]+(?:\.[0-9]+)?(?:\s*Hz)?", token, flags=re.IGNORECASE
                )
            ),
            None,
        )

        j_match = re.search(r"J\s*=\s*([0-9.,;\s]+)\s*Hz", desc, flags=re.IGNORECASE)
        j_csv = _normalize_j_values_to_csv(j_match.group(1)) if j_match else None

        proton_match = re.search(r"(\d+)\s*H\b", desc, flags=re.IGNORECASE)
        proton_count = int(proton_match.group(1)) if proton_match else None

        peaks.append(
            {
                "ppm": ppm,
                "multiplicity": multiplicity,
                "j_values_hz_csv": j_csv,
                "proton_count": proton_count,
                "extra_info": desc,
            }
        )

    return frequency_mhz, solvent, peaks


def _parse_c13_nmr_text(text: str) -> tuple[float | None, str | None, list[dict]]:
    c13_re = re.compile(
        r"^\s*13C\s*-\s*NMR\s*\(\s*(.+?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*MHz\s*\)\s*:\s*(.+?)\s*;\s*$",
        flags=re.IGNORECASE,
    )
    m = c13_re.match(text.strip())
    if not m:
        raise HTTPException(
            status_code=422,
            detail="Invalid 13C ACS string format. Expected: 13C-NMR (solvent, x MHz): ...;",
        )

    solvent = m.group(1).strip()
    frequency_mhz = float(m.group(2))
    peaks_part = m.group(3).strip()

    ppm_tokens = re.findall(r"-?[0-9]+(?:\.[0-9]+)?", peaks_part)
    if not ppm_tokens:
        raise HTTPException(
            status_code=422, detail="No valid 13C peaks found in ACS string."
        )

    peaks = [
        {"ppm": float(token), "atom_count": 1, "extra_info": None}
        for token in ppm_tokens
    ]
    return frequency_mhz, solvent, peaks


def _normalize_hashed_value(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None

    normalized = raw_value.strip()
    if not normalized:
        return None

    return normalized


def _normalize_optional_text(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip()
    return normalized or None


def _normalize_solution_hash(raw_hash: str | None) -> str | None:
    normalized = _normalize_hashed_value(raw_hash)
    if normalized is None:
        return None
    if re.fullmatch(r"[0-9a-fA-F]{64}", normalized):
        return normalized.lower()
    return normalized


def _normalize_solution_cas_number(raw_cas_number: str | None) -> str | None:
    if raw_cas_number is None:
        return None

    normalized = re.sub(r"\s+", "", raw_cas_number.strip())
    if not normalized:
        return None

    return normalized


def _hash_solution_cas_number(normalized_cas_number: str) -> str:
    return hashlib.sha256(normalized_cas_number.encode("utf-8")).hexdigest()


def _normalize_or_hash_solution_cas(raw_cas_number: str | None) -> str | None:
    normalized = _normalize_solution_cas_number(raw_cas_number)
    if normalized is None:
        return None

    if re.fullmatch(r"[0-9a-fA-F]{64}", normalized):
        return normalized.lower()

    return _hash_solution_cas_number(normalized)


def _prepare_solution_cas_fields(raw_cas_number: str | None) -> str | None:
    return _normalize_or_hash_solution_cas(raw_cas_number)


def _to_response(row: Exercise) -> ExerciseOut:
    tags = []
    if row.tags_csv:
        tags = [t for t in (part.strip() for part in row.tags_csv.split(",")) if t]

    return ExerciseOut(
        id=row.id,
        name=row.name,
        molecular_formula=row.molecular_formula,
        exercise_set=row.exercise_set,
        tags=tags,
        h1_svg_path=row.h1_svg_path,
        h1_svg_url=row.h1_svg_path,
        h1_axis_start=row.h1_axis_start,
        h1_axis_end=row.h1_axis_end,
        h1_nmr_text=row.h1_nmr_text,
        h1_frequency_mhz=row.h1_frequency_mhz,
        h1_solvent=row.h1_solvent,
        h1_peaks=[H1PeakOut.model_validate(p) for p in row.h1_peaks],

        c13_svg_path=row.c13_svg_path,
        c13_svg_url=row.c13_svg_path,
        c13_axis_start=row.c13_axis_start,
        c13_axis_end=row.c13_axis_end,
        c13_nmr_text=row.c13_nmr_text,
        c13_frequency_mhz=row.c13_frequency_mhz,
        c13_solvent=row.c13_solvent,
        c13_apt=row.c13_apt,
        c13_peaks=[C13PeakOut.model_validate(p) for p in row.c13_peaks],
        additional_spectra=[
            AdditionalSpectrumOut(
                id=s.id,
                file_path=s.file_path,
                label=s.label,
                priority=s.priority,
            )
            for s in row.additional_spectra
        ],
    )

#The tags are separated to use in the exercise list and only the wanted data for the list is returned.
def _to_summary_response(row: Exercise) -> ExerciseSummaryOut:
    tags = []
    if row.tags_csv:
        tags = [t for t in (part.strip() for part in row.tags_csv.split(",")) if t]

    return ExerciseSummaryOut(
        id=row.id,
        name=row.name,
        exercise_set=row.exercise_set,
        tags=tags,
    )

#Here a list of all exercises is fetched from the database and send using HTTP
@router.get("/summaries", response_model=list[ExerciseSummaryOut])
def list_exercise_summaries() -> list[ExerciseSummaryOut]:
    with get_db() as db:
        rows = (
            db.query(Exercise)
            .order_by(Exercise.id.desc())
            .all()
        )
        return [_to_summary_response(row) for row in rows]


#Here the data of a single exercise is fetched from the database and send using HTTP
@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(exercise_id: int) -> ExerciseOut:
    with get_db() as db:
        row = (
            db.query(Exercise)
            .options(
                selectinload(Exercise.h1_peaks),
                selectinload(Exercise.c13_peaks),
                selectinload(Exercise.additional_spectra),
            )
            .filter(Exercise.id == exercise_id)
            .first()
        )

        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")

        return _to_response(row)

@router.get("/", response_model=list[ExerciseOut])
def list_exercises() -> list[ExerciseOut]:
    with get_db() as db:
        rows = (
            db.query(Exercise)
            .options(
                selectinload(Exercise.h1_peaks),
                selectinload(Exercise.c13_peaks),
                selectinload(Exercise.additional_spectra),
            )
            .order_by(Exercise.id.desc())
            .all()
        )
        return [_to_response(row) for row in rows]


@router.post("/{exercise_id}/validate-cas", response_model=CasAnswerValidationOut)
def validate_cas_answer(
    exercise_id: int, body: CasAnswerValidationIn
) -> CasAnswerValidationOut:
    input_hash = _normalize_or_hash_solution_cas(body.cas_number)
    if input_hash is None:
        return CasAnswerValidationOut(is_correct=False)

    with get_db() as db:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")

        if row.solution_cas_hash is None:
            return CasAnswerValidationOut(is_correct=False)

        return CasAnswerValidationOut(
            is_correct=hmac.compare_digest(row.solution_cas_hash, input_hash)
        )


@router.post("/{exercise_id}/validate-solution", response_model=SolutionValidationOut)
def validate_solution_answer(
    exercise_id: int, body: SolutionValidationIn
) -> SolutionValidationOut:
    input_hash = _normalize_solution_hash(body.solution_hash)
    if input_hash is None:
        return SolutionValidationOut(is_correct=False)

    with get_db() as db:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")

        if row.solution_inchi_hash is None:
            return SolutionValidationOut(is_correct=False)

        return SolutionValidationOut(
            is_correct=hmac.compare_digest(row.solution_inchi_hash, input_hash)
        )

@router.get("/{exercise_id}/dbe", response_model=DbeOut)
def get_exercise_dbe(exercise_id: int) -> DbeOut:
    with get_db() as db:
        storage_key = f"exercise-{exercise_id}"
        ws = db.query(WorkingSolution).filter_by(exercise_id=storage_key).first()
        return DbeOut(dbe=ws.dbe if ws else None)

@router.put("/{exercise_id}/dbe", response_model=DbeOut)
def update_exercise_dbe(exercise_id: int, payload: DbeUpdate) -> DbeOut:
    with get_db() as db:
        storage_key = f"exercise-{exercise_id}"
        ws = db.query(WorkingSolution).filter_by(exercise_id=storage_key).first()

        if not ws:
            ws = WorkingSolution(exercise_id=storage_key, dbe=payload.dbe)
            db.add(ws)
        else:
            ws.dbe = payload.dbe

        db.commit()
        db.refresh(ws)
        return DbeOut(dbe=ws.dbe)

@router.delete("/{exercise_id}", status_code=204, response_model=None)
def delete_exercise(exercise_id: int) -> None:
    with get_db() as db:
        exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not exercise:
            raise HTTPException(status_code=404, detail="Exercise not found.")

        exercise_key = f"exercise-{exercise_id}"

        db.query(Fragment).filter(
            Fragment.exercise_id == exercise_key,
        ).delete(synchronize_session=False)
        db.query(WorkingSolution).filter(
            WorkingSolution.exercise_id == exercise_key,
        ).delete(synchronize_session=False)
        db.query(LogbookState).filter(
            LogbookState.exercise_id == exercise_key,
        ).delete(synchronize_session=False)

        file_paths = []
        if exercise.h1_svg_path:
            file_paths.append(exercise.h1_svg_path)
        if exercise.c13_svg_path:
            file_paths.append(exercise.c13_svg_path)
        for spectrum in exercise.additional_spectra:
            if spectrum.file_path:
                file_paths.append(spectrum.file_path)

        db.delete(exercise)
        db.commit()

        sqlite_root = Path(settings.sqlite_path).resolve().parent
        for file_path in file_paths:
            try:
                disk_path = sqlite_root / file_path.lstrip("/")
                resolved_path = disk_path.resolve()
                if not resolved_path.is_relative_to(sqlite_root):
                    logger.warning(f"Attempted to delete file outside uploads directory: {file_path}")
                    continue
                resolved_path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")

@router.post("/", response_model=ExerciseOut, status_code=201)
def create_exercise(body: ExerciseCreate) -> ExerciseOut:
    h1_frequency_mhz, h1_solvent, h1_peaks = _parse_h1_nmr_text(body.h1_nmr_text)
    c13_frequency_mhz, c13_solvent, c13_peaks = _parse_c13_nmr_text(body.c13_nmr_text)

    solvent_override = _normalize_optional_text(body.solvent)
    h1_solvent_override = _normalize_optional_text(body.h1_solvent)
    c13_solvent_override = _normalize_optional_text(body.c13_solvent)

    if solvent_override:
        h1_solvent = solvent_override
        c13_solvent = solvent_override
    if h1_solvent_override:
        h1_solvent = h1_solvent_override
    if c13_solvent_override:
        c13_solvent = c13_solvent_override

    solution_inchi_hash = _normalize_solution_hash(body.solution_inchi)
    solution_cas_hash = _prepare_solution_cas_fields(body.solution_cas_number)

    created_file_paths: list[str] = []

    try:
        with get_db() as db:
            if solution_inchi_hash is not None:
                existing = (
                    db.query(Exercise)
                    .filter(Exercise.solution_inchi_hash == solution_inchi_hash)
                    .first()
                )
                if existing:
                    raise HTTPException(
                        status_code=409,
                        detail="Exercise with the same solution InChI already exists.",
                    )

            h1_path = _write_text_file(
                content=body.h1_spectrum_svg.svg_text,
                original_filename=body.h1_spectrum_svg.filename,
                folder="h1",
            )
            created_file_paths.append(h1_path)

            c13_path = _write_text_file(
                content=body.c13_spectrum_svg.svg_text,
                original_filename=body.c13_spectrum_svg.filename,
                folder="c13",
            )
            created_file_paths.append(c13_path)

            display_name = body.name.strip() if body.name else None
            if not display_name:
                display_name = (
                    body.molecular_formula.strip() if body.molecular_formula else None
                )

            exercise = Exercise(
                name=display_name,
                molecular_formula=body.molecular_formula.strip()
                if body.molecular_formula
                else None,
                exercise_set=body.exercise_set.strip() if body.exercise_set else None,
                tags_csv=",".join(body.tags) if body.tags else None,
                h1_svg_path=_upload_file_path_to_url(h1_path),
                h1_axis_start=body.h1_axis_scale.begin,
                h1_axis_end=body.h1_axis_scale.end,
                c13_svg_path=_upload_file_path_to_url(c13_path),
                c13_axis_start=body.c13_axis_scale.begin,
                c13_axis_end=body.c13_axis_scale.end,
                h1_nmr_text=body.h1_nmr_text.strip(),
                h1_frequency_mhz=h1_frequency_mhz,
                h1_solvent=h1_solvent,
                c13_nmr_text=body.c13_nmr_text.strip(),
                c13_frequency_mhz=c13_frequency_mhz,
                c13_solvent=c13_solvent,
                c13_apt=body.c13_apt,
                solution_inchi_hash=solution_inchi_hash,
                solution_cas_hash=solution_cas_hash,
            )

            db.add(exercise)
            db.flush()

            for peak in h1_peaks:
                db.add(
                    ExerciseH1Peak(
                        exercise_id=exercise.id,
                        ppm=peak["ppm"],
                        multiplicity=peak["multiplicity"],
                        j_values_hz_csv=peak["j_values_hz_csv"],
                        proton_count=peak["proton_count"],
                        extra_info=peak["extra_info"],
                    )
                )

            for peak in c13_peaks:
                db.add(
                    ExerciseC13Peak(
                        exercise_id=exercise.id,
                        ppm=peak["ppm"],
                        atom_count=peak["atom_count"],
                        extra_info=peak["extra_info"],
                    )
                )

            for spectrum in body.additional_spectra:
                file_path = _write_base64_file(
                    content_base64=spectrum.file_base64,
                    original_filename=spectrum.filename,
                    folder="additional",
                )
                created_file_paths.append(file_path)
                db.add(
                    ExerciseAdditionalSpectrum(
                        exercise_id=exercise.id,
                        file_path=_upload_file_path_to_url(file_path),
                        label=spectrum.label,
                        priority=_priority_for_additional_spectrum_filename(
                            spectrum.filename
                        ),
                    )
                )

            db.commit()

            created = (
                db.query(Exercise)
                .options(
                    selectinload(Exercise.h1_peaks),
                    selectinload(Exercise.c13_peaks),
                    selectinload(Exercise.additional_spectra),
                )
                .filter(Exercise.id == exercise.id)
                .first()
            )
            if not created:
                raise HTTPException(
                    status_code=500, detail="Failed to load created exercise."
                )

            return _to_response(created)
    except Exception:
        for file_path in created_file_paths:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception:
                pass
        raise
