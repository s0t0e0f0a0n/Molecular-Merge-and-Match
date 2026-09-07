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
from typing import NamedTuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.api.statistics import (
    increment_incorrect_count,
    mark_exercise_completed,
    mark_exercise_selected,
)
from app.core.calculation import calculate_dbe, parse_formula
from app.core.config import settings
from app.core.solvent_tokens import (
    apply_solvent_count_delta,
    encode_solvent_text,
    extract_solvent_ids,
    resolve_solvent_tokens,
)
from app.core.tag_tokens import (
    encode_tags_list,
    resolve_tag_tokens,
    extract_tag_ids as extract_tag_ids,
    apply_tag_count_delta as apply_tag_count_delta,
)
from app.db.models import (
    Exercise,
    Statistics,
    ExerciseAdditionalNuclei,
    ExerciseAdditionalSpectrum,
    ExerciseC13Coupling,
    ExerciseC13Peak,
    ExerciseH1Peak,
    Fragment,
    LogbookState,
    WorkingSolution,
    TagsUsed,
)
from app.db.session import get_db

_SVG_SCRIPT_RE = re.compile(r"<script[\s\S]*?</script\s*>", re.IGNORECASE)
_SVG_EVENT_ATTR_RE = re.compile(
    r"""\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)""", re.IGNORECASE
)
_ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME = {
    "ir": 1,
    "h-presat": 2,
    "h-regular": 2,
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
    "10b": 11,
    "11b": 11,
    "14n": 11,
    "29si": 11,
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
    token = "_".join(parts[1:]).strip() if len(parts) > 1 else stem.strip()
    return _ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME.get(token.lower().replace(" ", ""), 0)


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
        if "<svg" not in value.lower() or "</svg>" not in value.lower():
            raise ValueError("Provided content is not a valid SVG document.")
        return value


class AdditionalSpectrumPayload(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    file_base64: str = Field(min_length=1)
    label: str | None = Field(default=None, max_length=255)
    priority: int | None = Field(default=None, ge=0)

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        file_name = Path(value).name
        if file_name != value:
            raise ValueError("Filename must not contain path segments.")
        if Path(file_name).suffix.lower() not in {".svg", ".png", ".jpg", ".jpeg"}:
            raise ValueError("Additional spectra must be SVG, PNG, JPG, or JPEG.")
        return file_name


class ExerciseCreate(BaseModel):
    h1_spectrum_svg: UploadedSvgPayload
    h1_axis_scale: AxisScale
    h1_nmr_text: str = Field(min_length=1)
    c13_spectrum_svg: UploadedSvgPayload
    c13_axis_scale: AxisScale
    c13_nmr_text: str = Field(min_length=1)
    c13_alt_text: str | None = Field(default=None)
    alt_nuc_text: str | None = Field(default=None)
    c13_apt: bool | None = Field(default=None)
    molecular_formula: str | None = Field(default=None, max_length=100)
    solution_inchi: str | None = Field(default=None)
    solution_cas_number: str | None = Field(default=None, max_length=100)
    alt1_cas_number: str | None = Field(default=None, max_length=100)
    alt2_cas_number: str | None = Field(default=None, max_length=100)
    h1_data_source: str | None = Field(default=None, max_length=255)
    c13_data_source: str | None = Field(default=None, max_length=255)
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
    atom_tag: int | None
    atom_count: int

    model_config = {"from_attributes": True}

class C13CouplingOut(BaseModel):
    id: int
    ppm: float
    multiplicity: str | None
    j_values_hz_csv: str | None
    atom_tag: int | None
    extra_info: str | None

    model_config = {"from_attributes": True}

class AdditionalSpectrumOut(BaseModel):
    id: int
    file_path: str
    label: str | None
    priority: int

    model_config = {"from_attributes": True}

class AdditionalNucleusOut(BaseModel):
    id: int
    nucleus: str
    frequency_mhz: float | None
    ppm: float
    atom_count: int
    multiplicity: str | None
    j_values_hz_csv: str | None
    extra_info: str | None

    model_config = {"from_attributes": True}


class ExerciseOut(BaseModel):
    id: int
    name: str | None
    molecular_formula: str | None
    dbe: float
    exercise_set: str | None
    tags: list[str]
    completed: bool | None = None

    h1_svg_path: str
    h1_svg_url: str   #A relative path is needed to actually use the svg
    h1_axis_start: float
    h1_axis_end: float
    h1_nmr_text: str
    h1_frequency_mhz: float | None
    h1_solvent: str | None
    h1_data_source: str | None
    h1_peaks: list[H1PeakOut]

    c13_svg_path: str
    c13_svg_url: str    #A relative path is needed to actually use the svg
    c13_axis_start: float
    c13_axis_end: float
    c13_nmr_text: str
    c13_alt_text: str | None
    c13_frequency_mhz: float | None
    c13_solvent: str | None
    c13_data_source: str | None
    c13_apt: bool | None
    c13_peaks: list[C13PeakOut]
    c13_couplings: list[C13CouplingOut]
    alt_nuclei: list[AdditionalNucleusOut]

    additional_spectra: list[AdditionalSpectrumOut]
    model_config = {"from_attributes": True}

class ExerciseSummaryOut(BaseModel):
    id: int
    name: str | None
    exercise_set: str | None
    tags: list[str]
    completed: bool | None = None

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


class ExerciseUpdateFields(BaseModel):
    model_config = {"extra": "forbid"}

    name: str | None = None
    molecular_formula: str | None = None
    exercise_set: str | None = None
    tags: list[str] | None = None
    solution_inchi_hash: str | None = None
    solution_cas_hash: str | None = None
    alt1_cas_hash: str | None = None
    alt2_cas_hash: str | None = None
    h1_nmr_text: str | None = None
    c13_nmr_text: str | None = None
    c13_alt_text: str | None = None
    alt_nuc_text: str | None = None
    c13_apt: bool | None = None
    h1_data_source: str | None = None
    c13_data_source: str | None = None
    solvent: str | None = None
    h1_solvent: str | None = None
    c13_solvent: str | None = None
    h1_axis_start: float | None = None
    h1_axis_end: float | None = None
    c13_axis_start: float | None = None
    c13_axis_end: float | None = None


class ExerciseUpdateMatch(BaseModel):
    inchi_hash: str | None = None
    cas_hash: str | None = None


class ExerciseReplaceSpectrum(BaseModel):
    h1: UploadedSvgPayload | None = None
    c13: UploadedSvgPayload | None = None


class ExerciseUpdateRequest(BaseModel):
    match: ExerciseUpdateMatch
    update: ExerciseUpdateFields = Field(default_factory=ExerciseUpdateFields)
    replace: ExerciseReplaceSpectrum = Field(default_factory=ExerciseReplaceSpectrum)
    append: list[AdditionalSpectrumPayload] = Field(default_factory=list)
    replace_additional: dict[str, AdditionalSpectrumPayload] = Field(default_factory=dict)

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
    target_path = root / f"{uuid4().hex}{suffix}"
    target_path.write_text(content, encoding="utf-8")
    return str(target_path)

def _write_base64_file(content_base64: str, original_filename: str, folder: str) -> str:
    root = _uploads_root() / folder
    root.mkdir(parents=True, exist_ok=True)
    suffix = Path(original_filename).suffix.lower() or ".bin"
    target_path = root / f"{uuid4().hex}{suffix}"
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
    return ",".join(values) if values else None

def _split_peak_entries(peaks_part: str) -> list[str]:
    entries: list[str] = []
    current: list[str] = []
    depth = 0
    for ch in peaks_part:
        if ch == "(":
            depth += 1
        elif ch == ")" and depth > 0:
            depth -= 1
        if ch == "," and depth == 0:
            entry = "".join(current).strip()
            if entry:
                entries.append(entry)
            current = []
            continue
        current.append(ch)
    tail = "".join(current).strip()
    if tail:
        entries.append(tail)
    return entries

def _parse_peak_descriptor_tokens(descriptor: str) -> list[str]:
    return [token.strip() for token in descriptor.split(",") if token.strip()]

def _extract_multiplicity(tokens: list[str]) -> str | None:
    return next(
        (
            token
            for token in tokens
            if not re.match(r"J\s*=", token, flags=re.IGNORECASE)
            and not re.fullmatch(r"\d+", token)
            and not re.fullmatch(r"\d+\s*[A-Za-z]+", token, flags=re.IGNORECASE)
        ),
        None,
    )


# =====================================================================
# DRY CORE ENGINES
# =====================================================================

class NMRHeader(NamedTuple):
    nucleus: str
    frequency_mhz: float
    solvent: str
    peaks_part: str

def _extract_nmr_header(text: str, nucleus_pattern: str, expected_format: str) -> NMRHeader:
    """
    Validates any real NMR ACS string format globally, supports empty peak data 
    blocks gracefully using lazy matching, and extracts structural metadata.
    """
    full_pattern = rf"^\s*({nucleus_pattern})\s*-\s*NMR\s*\(\s*(.+?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*MHz\s*\)\s*:\s*(.*?)\s*;\s*$"
    m = re.match(full_pattern, text.strip(), flags=re.IGNORECASE)
    if not m:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {nucleus_pattern} ACS string format. Expected: {expected_format}",
        )
    return NMRHeader(
        nucleus=m.group(1).strip(),
        solvent=m.group(2).strip(),
        frequency_mhz=float(m.group(3)),
        peaks_part=m.group(4).strip()
    )

def _parse_peak_entry_base(entry: str, error_detail: str) -> tuple[float, str]:
    """Validates single nested text tokens inside 13C and alternative spectrum lists."""
    match = re.match(r"^\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(?:\(([^)]*)\))?\s*\.?\s*$", entry)
    if not match:
        raise HTTPException(status_code=422, detail=error_detail)
    return float(match.group(1)), (match.group(2) or "").strip()


# =====================================================================
# INDIVIDUAL PARSERS
# =====================================================================

def _parse_h1_nmr_text(text: str) -> tuple[float | None, str | None, list[dict]]:
    header = _extract_nmr_header(text, "1H", "1H-NMR (solvent, x MHz): ...;")
    if not header.peaks_part:
        return header.frequency_mhz, header.solvent, []

    peak_matches = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*\(([^)]*)\)", header.peaks_part)
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
                token for token in tokens
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

        peaks.append({
            "ppm": ppm, "multiplicity": multiplicity, "j_values_hz_csv": j_csv,
            "proton_count": proton_count, "extra_info": desc,
        })
    return header.frequency_mhz, header.solvent, peaks


def _parse_c13_nmr_text(text: str) -> tuple[float | None, str | None, list[dict]]:
    header = _extract_nmr_header(text, "13C", "13C-NMR (solvent, x MHz): ...;")
    if not header.peaks_part:
        return header.frequency_mhz, header.solvent, []

    entries = _split_peak_entries(header.peaks_part)
    if not entries:
        raise HTTPException(status_code=422, detail="No valid 13C peaks found in ACS string.")

    peaks: list[dict] = []
    for entry in entries:
        ppm, descriptor = _parse_peak_entry_base(entry, f"Invalid 13C peak entry: '{entry}'.")
        atom_count = 1
        atom_tag = None
        if descriptor:
            for token in _parse_peak_descriptor_tokens(descriptor):
                atom_count_match = re.fullmatch(r"(\d+)\s*C", token, flags=re.IGNORECASE)
                if atom_count_match:
                    atom_count = int(atom_count_match.group(1))
                    continue
                if re.fullmatch(r"(\d+)", token):
                    atom_tag = int(token)
        peaks.append({"ppm": ppm, "atom_count": atom_count, "atom_tag": atom_tag})
    return header.frequency_mhz, header.solvent, peaks


def _parse_c13_couplings_text(text: str) -> tuple[float | None, str | None, list[dict]]:
    header = _extract_nmr_header(text, "13C", "13C-NMR (solvent, x MHz): ...;")
    if not header.peaks_part:
        return header.frequency_mhz, header.solvent, []

    entries = _split_peak_entries(header.peaks_part)
    if not entries:
        raise HTTPException(status_code=422, detail="No valid alternative 13C couplings found in ACS string.")

    couplings: list[dict] = []
    for entry in entries:
        ppm, descriptor = _parse_peak_entry_base(entry, f"Invalid alternative 13C coupling entry: '{entry}'.")
        tokens = _parse_peak_descriptor_tokens(descriptor)

        multiplicity = _extract_multiplicity(tokens)
        j_match = re.search(r"J\s*=\s*([0-9.,;\s]+)\s*Hz", descriptor, flags=re.IGNORECASE)
        j_csv = _normalize_j_values_to_csv(j_match.group(1)) if j_match else None
        atom_tag = next((int(t) for t in tokens if re.fullmatch(r"(\d+)", t)), None)

        couplings.append({
            "ppm": ppm, "multiplicity": multiplicity, "j_values_hz_csv": j_csv,
            "atom_tag": atom_tag, "extra_info": descriptor or None,
        })
    return header.frequency_mhz, header.solvent, couplings


def _parse_alt_nuclei_text(text: str) -> tuple[str, float | None, str | None, list[dict]]:
    header = _extract_nmr_header(text, r"[0-9]+[A-Za-z]+", "31P-NMR (solvent, x MHz): ...;")
    if not header.peaks_part:
        return header.nucleus, header.frequency_mhz, header.solvent, []

    entries = _split_peak_entries(header.peaks_part)
    if not entries:
        raise HTTPException(
            status_code=422,
            detail="No valid alternative nuclei peaks found in ACS string.",
        )

    peaks: list[dict] = []
    for entry in entries:
        ppm, descriptor = _parse_peak_entry_base(entry, f"Invalid alternative nuclei entry: '{entry}'.")
        tokens = _parse_peak_descriptor_tokens(descriptor)

        multiplicity = _extract_multiplicity(tokens)
        j_match = re.search(r"J\s*=\s*([0-9.,;\s]+)\s*Hz", descriptor, flags=re.IGNORECASE)
        j_csv = _normalize_j_values_to_csv(j_match.group(1)) if j_match else None

        peaks.append({
            "ppm": ppm, "multiplicity": multiplicity, "j_values_hz_csv": j_csv,
            "extra_info": descriptor or None,
        })
    return header.nucleus, header.frequency_mhz, header.solvent, peaks



def _normalize_hashed_value(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip()
    return normalized if normalized else None

def _normalize_optional_text(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip()
    return normalized or None

def _normalize_solution_hash(raw_hash: str | None) -> str | None:
    normalized = _normalize_hashed_value(raw_hash)
    if normalized is None:
        return None
    return normalized.lower() if re.fullmatch(r"[0-9a-fA-F]{64}", normalized) else normalized

def _normalize_solution_cas_number(raw_cas_number: str | None) -> str | None:
    if raw_cas_number is None:
        return None
    normalized = re.sub(r"\s+", "", raw_cas_number.strip())
    return normalized if normalized else None

def _hash_solution_cas_number(normalized_cas_number: str) -> str:
    return hashlib.sha256(normalized_cas_number.encode("utf-8")).hexdigest()

def _normalize_or_hash_solution_cas(raw_cas_number: str | None) -> str | None:
    normalized = _normalize_solution_cas_number(raw_cas_number)
    if normalized is None:
        return None
    return normalized.lower() if re.fullmatch(r"[0-9a-fA-F]{64}", normalized) else _hash_solution_cas_number(normalized)

def _prepare_solution_cas_fields(raw_cas_number: str | None) -> str | None:
    return _normalize_or_hash_solution_cas(raw_cas_number)


# =====================================================================
# API RESPONSE CONVERTERS
# =====================================================================

def _to_response(row: Exercise, db) -> ExerciseOut:
    tags = []
    parts: list[str] = []
    if row.tags_csv:
        resolved = resolve_tag_tokens(db, row.tags_csv)
        parts.extend([p.strip() for p in (resolved or "").split(",") if p and p.strip()])
    seen = set()
    for p in parts:
        if p not in seen:
            seen.add(p)
            tags.append(p)

    return ExerciseOut(
        id=row.id, name=row.name, molecular_formula=row.molecular_formula, dbe=row.dbe,
        exercise_set=row.exercise_set, tags=tags, h1_svg_path=row.h1_svg_path, h1_svg_url=row.h1_svg_path,
        h1_axis_start=row.h1_axis_start, h1_axis_end=row.h1_axis_end, h1_nmr_text=row.h1_nmr_text,
        h1_frequency_mhz=row.h1_frequency_mhz, h1_solvent=resolve_solvent_tokens(db, row.h1_solvent),
        h1_data_source=row.h1_data_source, h1_peaks=[H1PeakOut.model_validate(p) for p in row.h1_peaks],
        c13_svg_path=row.c13_svg_path, c13_svg_url=row.c13_svg_path, c13_axis_start=row.c13_axis_start,
        c13_axis_end=row.c13_axis_end, c13_nmr_text=row.c13_nmr_text, c13_alt_text=row.c13_alt_text,
        c13_frequency_mhz=row.c13_frequency_mhz, c13_solvent=resolve_solvent_tokens(db, row.c13_solvent),
        c13_data_source=row.c13_data_source, c13_apt=row.c13_apt, completed=row.completed,
        c13_peaks=[C13PeakOut.model_validate(p) for p in row.c13_peaks],
        c13_couplings=[C13CouplingOut.model_validate(c) for c in row.c13_couplings],
        alt_nuclei=[AdditionalNucleusOut.model_validate(n) for n in row.alt_nuclei],
        additional_spectra=[
            AdditionalSpectrumOut(id=s.id, file_path=s.file_path, label=s.label, priority=s.priority)
            for s in row.additional_spectra
        ],
    )

def _to_summary_response(row: Exercise) -> ExerciseSummaryOut:
    tags = []
    parts: list[str] = []
    hidden_names: set[str] = set()
    try:
        with get_db() as _db:
            if row.tags_csv:
                resolved = resolve_tag_tokens(_db, row.tags_csv, omit_hidden=True)
                parts.extend([p.strip() for p in (resolved or "").split(",") if p and p.strip()])
            if parts:
                normalized_names = {p.lower() for p in parts if p}
                hidden_names = {
                    hidden.tag_name.lower() for hidden in (
                        _db.query(TagsUsed)
                        .filter(func.lower(TagsUsed.tag_name).in_(normalized_names))
                        .filter(TagsUsed.is_hidden.is_(True)).all()
                    )
                }
    except Exception:
        if row.tags_csv:
            parts = [p.strip() for p in row.tags_csv.split(",") if p and p.strip()]

    seen = set()
    for p in parts:
        if p and p.lower() not in hidden_names and p not in seen:
            seen.add(p)
            tags.append(p)

    return ExerciseSummaryOut(id=row.id, name=row.name, exercise_set=row.exercise_set, tags=tags, completed=row.completed)


# =====================================================================
# ROUTER ENDPOINTS
# =====================================================================

@router.get("/summaries", response_model=list[ExerciseSummaryOut])
def list_exercise_summaries() -> list[ExerciseSummaryOut]:
    with get_db() as db:
        rows = db.query(Exercise).order_by(Exercise.id.desc()).all()
        return [_to_summary_response(row) for row in rows]


@router.post("/import-update", response_model=ExerciseOut)
def update_exercise_from_import(body: ExerciseUpdateRequest) -> ExerciseOut:
    match_inchi = _normalize_solution_hash(body.match.inchi_hash)
    match_cas = _prepare_solution_cas_fields(body.match.cas_hash)
    if match_inchi is None and match_cas is None:
        raise HTTPException(status_code=422, detail="At least one match identifier is required.")

    created_file_paths: list[str] = []
    old_file_paths: list[str] = []
    try:
        with get_db() as db:
            inchi_row = (
                db.query(Exercise).filter(Exercise.solution_inchi_hash == match_inchi).first()
                if match_inchi else None
            )
            cas_row = (
                db.query(Exercise).filter(Exercise.solution_cas_hash == match_cas).first()
                if match_cas else None
            )
            if inchi_row and cas_row and inchi_row.id != cas_row.id:
                raise HTTPException(status_code=409, detail="InChI and CAS identifiers match different exercises.")
            exercise = inchi_row or cas_row
            if not exercise:
                raise HTTPException(status_code=404, detail="No exercise matched the supplied identifiers.")

            fields = body.update
            if "solution_inchi_hash" in fields.model_fields_set:
                exercise.solution_inchi_hash = _normalize_solution_hash(fields.solution_inchi_hash)
            if "solution_cas_hash" in fields.model_fields_set:
                exercise.solution_cas_hash = _prepare_solution_cas_fields(fields.solution_cas_hash)
            for field_name in (
                "name", "exercise_set", "c13_alt_text", "alt_nuc_text", "h1_data_source",
                "c13_data_source", "h1_axis_start", "h1_axis_end", "c13_axis_start", "c13_axis_end",
                "c13_apt", "alt1_cas_hash", "alt2_cas_hash",
            ):
                if field_name in fields.model_fields_set:
                    value = getattr(fields, field_name)
                    if field_name in {"alt1_cas_hash", "alt2_cas_hash"}:
                        value = _prepare_solution_cas_fields(value)
                    elif isinstance(value, str):
                        value = value.strip() or None
                    setattr(exercise, field_name, value)

            if "molecular_formula" in fields.model_fields_set:
                formula = fields.molecular_formula.strip() if fields.molecular_formula else None
                exercise.molecular_formula = formula
                exercise.dbe = calculate_dbe(parse_formula(formula)) if formula else 0.0

            if "tags" in fields.model_fields_set:
                old_tag_ids = extract_tag_ids(exercise.tags_csv)
                apply_tag_count_delta(db, old_tag_ids, -1)
                encoded_tags, tag_ids = encode_tags_list(db, fields.tags or [])
                exercise.tags_csv = encoded_tags
                apply_tag_count_delta(db, tag_ids, +1)

            nmr_updates = {}
            if "h1_nmr_text" in fields.model_fields_set:
                exercise.h1_nmr_text = (fields.h1_nmr_text or "").strip()
                frequency, solvent, peaks = _parse_h1_nmr_text(exercise.h1_nmr_text)
                exercise.h1_frequency_mhz, nmr_updates["h1_solvent"] = frequency, solvent
                db.query(ExerciseH1Peak).filter(ExerciseH1Peak.exercise_id == exercise.id).delete(synchronize_session=False)
                for peak in peaks:
                    db.add(ExerciseH1Peak(exercise_id=exercise.id, **peak))
            if "c13_nmr_text" in fields.model_fields_set:
                exercise.c13_nmr_text = (fields.c13_nmr_text or "").strip()
                frequency, solvent, peaks = _parse_c13_nmr_text(exercise.c13_nmr_text)
                exercise.c13_frequency_mhz, nmr_updates["c13_solvent"] = frequency, solvent
                db.query(ExerciseC13Peak).filter(ExerciseC13Peak.exercise_id == exercise.id).delete(synchronize_session=False)
                for peak in peaks:
                    db.add(ExerciseC13Peak(exercise_id=exercise.id, **peak))

            solvent_override = fields.solvent if "solvent" in fields.model_fields_set else None
            if solvent_override is not None or "h1_solvent" in fields.model_fields_set or "c13_solvent" in fields.model_fields_set:
                h1_solvent = fields.h1_solvent if "h1_solvent" in fields.model_fields_set else nmr_updates.get("h1_solvent", exercise.h1_solvent)
                c13_solvent = fields.c13_solvent if "c13_solvent" in fields.model_fields_set else nmr_updates.get("c13_solvent", exercise.c13_solvent)
                if solvent_override is not None:
                    h1_solvent = c13_solvent = solvent_override
                old_solvent_ids = extract_solvent_ids(exercise.h1_solvent) | extract_solvent_ids(exercise.c13_solvent)
                apply_solvent_count_delta(db, old_solvent_ids, -1)
                exercise.h1_solvent, _ = encode_solvent_text(db, h1_solvent)
                exercise.c13_solvent, _ = encode_solvent_text(db, c13_solvent)
                apply_solvent_count_delta(db, extract_solvent_ids(exercise.h1_solvent) | extract_solvent_ids(exercise.c13_solvent), +1)

            for spectrum_name, spectrum in (("h1", body.replace.h1), ("c13", body.replace.c13)):
                if spectrum is not None:
                    old_path = getattr(exercise, f"{spectrum_name}_svg_path")
                    new_path = _write_text_file(spectrum.svg_text, spectrum.filename, spectrum_name)
                    created_file_paths.append(new_path)
                    setattr(exercise, f"{spectrum_name}_svg_path", _upload_file_path_to_url(new_path))
                    old_file_paths.append(old_path)

            for spectrum in body.append:
                file_path = _write_base64_file(spectrum.file_base64, spectrum.filename, "additional")
                created_file_paths.append(file_path)
                db.add(ExerciseAdditionalSpectrum(
                    exercise_id=exercise.id,
                    file_path=_upload_file_path_to_url(file_path),
                    label=spectrum.label,
                    priority=(
                        spectrum.priority
                        if spectrum.priority is not None
                        else _priority_for_additional_spectrum_filename(spectrum.filename)
                    ),
                ))

            for key, spectrum in body.replace_additional.items():
                existing = next(
                    (item for item in exercise.additional_spectra if (item.label or "").strip().lower() in {key.strip().lower(), (spectrum.label or "").strip().lower()}),
                    None,
                )
                if existing is None:
                    raise HTTPException(status_code=404, detail=f"Additional spectrum '{key}' not found.")
                file_path = _write_base64_file(spectrum.file_base64, spectrum.filename, "additional")
                created_file_paths.append(file_path)
                old_file_paths.append(existing.file_path)
                existing.file_path = _upload_file_path_to_url(file_path)
                if spectrum.label:
                    existing.label = spectrum.label

            db.commit()
            refreshed = db.query(Exercise).options(
                selectinload(Exercise.h1_peaks), selectinload(Exercise.c13_peaks),
                selectinload(Exercise.c13_couplings), selectinload(Exercise.alt_nuclei),
                selectinload(Exercise.additional_spectra),
            ).filter(Exercise.id == exercise.id).first()
            if not refreshed:
                raise HTTPException(status_code=500, detail="Failed to load updated exercise.")

            response = _to_response(refreshed, db)
        sqlite_root = Path(settings.sqlite_path).resolve().parent
        for path in old_file_paths:
            try:
                disk_path = (sqlite_root / path.lstrip("/")).resolve()
                if disk_path.is_relative_to(sqlite_root):
                    disk_path.unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("Failed to delete replaced file %s: %s", path, exc)
        return response
    except Exception:
        for file_path in created_file_paths:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception:
                pass
        raise

@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(exercise_id: int) -> ExerciseOut:
    with get_db() as db:
        row = (
            db.query(Exercise)
            .options(
                selectinload(Exercise.h1_peaks), selectinload(Exercise.c13_peaks),
                selectinload(Exercise.c13_couplings), selectinload(Exercise.alt_nuclei),
                selectinload(Exercise.additional_spectra),
            )
            .filter(Exercise.id == exercise_id).first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")
        mark_exercise_selected(exercise_id)
        return _to_response(row, db)

@router.get("/", response_model=list[ExerciseOut])
def list_exercises() -> list[ExerciseOut]:
    with get_db() as db:
        rows = (
            db.query(Exercise)
            .options(
                selectinload(Exercise.h1_peaks), selectinload(Exercise.c13_peaks),
                selectinload(Exercise.c13_couplings), selectinload(Exercise.additional_spectra),
            )
            .order_by(Exercise.id.desc()).all()
        )
        return [_to_response(row, db) for row in rows]

@router.post("/{exercise_id}/validate-cas", response_model=CasAnswerValidationOut)
def validate_cas_answer(
    exercise_id: int, body: CasAnswerValidationIn
) -> CasAnswerValidationOut:
    input_hash = _normalize_or_hash_solution_cas(body.cas_number)
    if input_hash is None:
        increment_incorrect_count(exercise_id)
        return CasAnswerValidationOut(is_correct=False)

    with get_db() as db:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")

        candidate_hashes = [v for v in (row.solution_cas_hash, row.alt1_cas_hash, row.alt2_cas_hash) if v is not None]
        if not candidate_hashes:
            increment_incorrect_count(exercise_id)
            return CasAnswerValidationOut(is_correct=False)

        is_correct = any(hmac.compare_digest(c_hash, input_hash) for c_hash in candidate_hashes)
        if is_correct:
            was_completed = row.completed is True
            row.completed = True
            db.commit()
            if not was_completed:
                mark_exercise_completed(exercise_id)
        else:
            increment_incorrect_count(exercise_id)
        return CasAnswerValidationOut(is_correct=is_correct)

@router.post("/{exercise_id}/validate-solution", response_model=SolutionValidationOut)
def validate_solution_answer(
    exercise_id: int, body: SolutionValidationIn
) -> SolutionValidationOut:
    input_hash = _normalize_solution_hash(body.solution_hash)
    if input_hash is None:
        increment_incorrect_count(exercise_id)
        return SolutionValidationOut(is_correct=False)

    with get_db() as db:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Exercise not found.")
        if row.solution_inchi_hash is None:
            increment_incorrect_count(exercise_id)
            return SolutionValidationOut(is_correct=False)

        is_correct = hmac.compare_digest(row.solution_inchi_hash, input_hash)
        if is_correct:
            was_completed = row.completed is True
            row.completed = True
            db.commit()
            if not was_completed:
                mark_exercise_completed(exercise_id)
        else:
            increment_incorrect_count(exercise_id)
        return SolutionValidationOut(is_correct=is_correct)

@router.get("/{exercise_id}/dbe", response_model=DbeOut)
def get_exercise_dbe(exercise_id: int) -> DbeOut:
    with get_db() as db:
        ws = db.query(WorkingSolution).filter_by(exercise_id=f"exercise-{exercise_id}").first()
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
        if exercise.h1_svg_path: file_paths.append(exercise.h1_svg_path)
        if exercise.c13_svg_path: file_paths.append(exercise.c13_svg_path)
        for spec in exercise.additional_spectra:
            if spec.file_path: file_paths.append(spec.file_path)

        used_solvent_ids = extract_solvent_ids(exercise.h1_solvent) | extract_solvent_ids(exercise.c13_solvent)
        apply_solvent_count_delta(db, used_solvent_ids, -1)

        tag_ids = set()
        try:
            tag_ids |= extract_tag_ids(exercise.tags_csv)
        except Exception:
            pass
        apply_tag_count_delta(db, tag_ids, -1)

        db.delete(exercise); db.commit()
        sqlite_root = Path(settings.sqlite_path).resolve().parent
        for path in file_paths:
            try:
                disk_path = (sqlite_root / path.lstrip("/")).resolve()
                if disk_path.is_relative_to(sqlite_root):
                    disk_path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"Failed to delete file {path}: {e}")


# =====================================================================
# THE EXERCISE CREATION ROUTE (SAFEGUARDED & RESOLVED)
# =====================================================================

@router.post("/", response_model=ExerciseOut, status_code=201)
def create_exercise(body: ExerciseCreate) -> ExerciseOut:
    h1_frequency_mhz, h1_solvent, h1_peaks = _parse_h1_nmr_text(body.h1_nmr_text)
    c13_frequency_mhz, c13_solvent, c13_peaks = _parse_c13_nmr_text(body.c13_nmr_text)

    c13_alt_text = _normalize_optional_text(body.c13_alt_text)
    alt_nuc_text = _normalize_optional_text(body.alt_nuc_text)

    c13_couplings: list[dict] = []
    if c13_alt_text and c13_alt_text.strip():
        _, _, c13_couplings = _parse_c13_couplings_text(c13_alt_text)

    alt_nucleus = None
    alt_nucleus_frequency = None
    alt_nuclei_peaks: list[dict] = []
    if alt_nuc_text and alt_nuc_text.strip():
        alt_nucleus, alt_nucleus_frequency, _, alt_nuclei_peaks = _parse_alt_nuclei_text(alt_nuc_text)

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

    # If no global `solvent` column provided, prefer solvent values extracted
    # from the provided NMR text (already parsed above). Normalize them so
    # subsequent token encoding receives either a non-empty string or None.
    if solvent_override is None:
        h1_solvent = _normalize_optional_text(h1_solvent)
        c13_solvent = _normalize_optional_text(c13_solvent)

    solution_inchi_hash = _normalize_solution_hash(body.solution_inchi)
    solution_cas_hash = _prepare_solution_cas_fields(body.solution_cas_number)
    alt1_cas_hash = _prepare_solution_cas_fields(body.alt1_cas_number)
    alt2_cas_hash = _prepare_solution_cas_fields(body.alt2_cas_number)

    molecular_formula = body.molecular_formula.strip() if body.molecular_formula else None
    formula_dbe = 0.0
    if molecular_formula:
        try:
            formula_dbe = calculate_dbe(parse_formula(molecular_formula))
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid molecular formula: {molecular_formula}",
            ) from exc

    created_file_paths: list[str] = []

    try:
        with get_db() as db:
            if solution_inchi_hash is not None:
                if db.query(Exercise).filter(Exercise.solution_inchi_hash == solution_inchi_hash).first():
                    raise HTTPException(status_code=409, detail="Exercise with the same solution InChI already exists.")

            h1_path = _write_text_file(body.h1_spectrum_svg.svg_text, body.h1_spectrum_svg.filename, "h1")
            created_file_paths.append(h1_path)
            c13_path = _write_text_file(body.c13_spectrum_svg.svg_text, body.c13_spectrum_svg.filename, "c13")
            created_file_paths.append(c13_path)

            display_name = body.name.strip() if body.name else (body.molecular_formula.strip() if body.molecular_formula else None)

            exercise = Exercise(
                name=display_name,
                molecular_formula=molecular_formula,
                dbe=formula_dbe,
                exercise_set=body.exercise_set.strip() if body.exercise_set else None,
                tags_csv=None,
                h1_svg_path=_upload_file_path_to_url(h1_path),
                h1_axis_start=body.h1_axis_scale.begin,
                h1_axis_end=body.h1_axis_scale.end,
                c13_svg_path=_upload_file_path_to_url(c13_path),
                c13_axis_start=body.c13_axis_scale.begin,
                c13_axis_end=body.c13_axis_scale.end,
                h1_nmr_text=body.h1_nmr_text.strip(),
                h1_frequency_mhz=h1_frequency_mhz,
                h1_solvent=None,
                h1_data_source=body.h1_data_source.strip() if body.h1_data_source else None,
                c13_nmr_text=body.c13_nmr_text.strip(),
                c13_frequency_mhz=c13_frequency_mhz,
                c13_solvent=None,
                c13_data_source=body.c13_data_source.strip() if body.c13_data_source else None,
                c13_apt=body.c13_apt,
                c13_alt_text=c13_alt_text,
                alt_nuc_text=alt_nuc_text,
                solution_inchi_hash=solution_inchi_hash,
                solution_cas_hash=solution_cas_hash,
                alt1_cas_hash=alt1_cas_hash,
                alt2_cas_hash=alt2_cas_hash,
            )

            db.add(exercise)
            db.flush()

            # Encode and create tags for provided tag list (manual creation).
            if body.tags:
                encoded_tags, tag_ids = encode_tags_list(db, body.tags)
                exercise.tags_csv = encoded_tags
                apply_tag_count_delta(db, tag_ids, +1)

            encoded_h1_solvent, _ = encode_solvent_text(db, h1_solvent)
            encoded_c13_solvent, _ = encode_solvent_text(db, c13_solvent)
            exercise.h1_solvent = encoded_h1_solvent
            exercise.c13_solvent = encoded_c13_solvent

            used_solvent_ids = extract_solvent_ids(encoded_h1_solvent) | extract_solvent_ids(encoded_c13_solvent)
            apply_solvent_count_delta(db, used_solvent_ids, +1)

            for peak in h1_peaks:
                db.add(
                    ExerciseH1Peak(
                        exercise_id=exercise.id,
                        ppm=peak["ppm"],
                        multiplicity=peak["multiplicity"],
                        j_values_hz_csv=peak["j_values_hz_csv"],
                        proton_count=peak["proton_count"],
                        extra_info=peak["extra_info"]
                    )
                )

            for peak in c13_peaks:
                db.add(
                    ExerciseC13Peak(
                        exercise_id=exercise.id,
                        ppm=peak["ppm"],
                        atom_tag=peak["atom_tag"],
                        atom_count=peak["atom_count"]
                    )
                )

            for coupling in c13_couplings:
                db.add(
                    ExerciseC13Coupling(
                        exercise_id=exercise.id,
                        ppm=coupling["ppm"],
                        multiplicity=coupling["multiplicity"],
                        j_values_hz_csv=coupling["j_values_hz_csv"],
                        atom_tag=coupling["atom_tag"],
                        extra_info=coupling["extra_info"]
                    )
                )

            for alt_peak in alt_nuclei_peaks:
                db.add(
                    ExerciseAdditionalNuclei(
                        exercise_id=exercise.id,
                        nucleus=alt_nucleus,
                        frequency_mhz=alt_nucleus_frequency,
                        ppm=alt_peak["ppm"],
                        multiplicity=alt_peak["multiplicity"],
                        j_values_hz_csv=alt_peak["j_values_hz_csv"],
                        extra_info=alt_peak["extra_info"]
                    )
                )

            for spectrum in body.additional_spectra:
                file_path = _write_base64_file(
                    content_base64=spectrum.file_base64,
                    original_filename=spectrum.filename,
                    folder="additional"
                )
                created_file_paths.append(file_path)
                db.add(
                    ExerciseAdditionalSpectrum(
                        exercise_id=exercise.id,
                        file_path=_upload_file_path_to_url(file_path),
                        label=spectrum.label,
                        priority=(
                            spectrum.priority
                            if spectrum.priority is not None
                            else _priority_for_additional_spectrum_filename(spectrum.filename)
                        ),
                    )
                )

            db.commit()

            created = (
                db.query(Exercise)
                .options(
                    selectinload(Exercise.h1_peaks),
                    selectinload(Exercise.c13_peaks),
                    selectinload(Exercise.additional_spectra)
                )
                .filter(Exercise.id == exercise.id)
                .first()
            )
            if not created:
                raise HTTPException(
                    status_code=500, detail="Failed to load created exercise."
                )

            return _to_response(created, db)
    except Exception:
        for file_path in created_file_paths:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception:
                pass
        raise
