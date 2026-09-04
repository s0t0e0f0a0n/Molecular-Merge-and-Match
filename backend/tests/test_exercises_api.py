import base64
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

from app.core.config import settings
from app.db.models import Exercise, ExerciseAdditionalSpectrum, Statistics
from app.db.session import SessionLocal

INCHI_CCO = "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3"
INCHI_HASH_CCO = hashlib.sha256(INCHI_CCO.encode("utf-8")).hexdigest()
CAS_HASH_64_17_5 = "7a05a4f3dc259426ffd8be334301a471197bb1f72b72e81dac2aa0cd62adec71"
CAS_HASH_67_56_1 = "b1f7c1dad56ebfa8ccec1e0fd1ffefd8c4d68e580b3ff24b35417d63a1120d31"


def _upload_url_to_file_path(upload_url: str) -> Path:
    uploads_dir = Path(settings.sqlite_path).resolve().parent / "uploads"
    rel_path = upload_url.removeprefix("/uploads/")
    return uploads_dir / Path(rel_path)

def _exercise_payload(
    solution_inchi: str | None = None, solution_cas_number: str | None = None
) -> dict:
    payload = {
        "name": "Demo exercise",
        "molecular_formula": "C2H6O",
        "tags": ["demo", "inchi"],
        "h1_spectrum_svg": {
            "filename": "h1.svg",
            "svg_text": "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        },
        "h1_axis_scale": {"begin": 10.1, "end": -0.1},
        "h1_nmr_text": "1H-NMR (CDCl3, 300 MHz): 1.00 (3H, s), 3.50 (2H, q);",
        "c13_spectrum_svg": {
            "filename": "c13.svg",
            "svg_text": "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        },
        "c13_axis_scale": {"begin": 213.0, "end": -2.0},
        "c13_nmr_text": "13C-NMR (CDCl3, 75 MHz): 58.2, 18.3;",
        "additional_spectra": [],
    }
    if solution_inchi is not None:
        payload["solution_inchi"] = solution_inchi
    if solution_cas_number is not None:
        payload["solution_cas_number"] = solution_cas_number
    return payload


def test_list_exercises_empty_initially(client):
    response = client.get("/api/v1/exercises/")
    assert response.status_code == 200
    assert response.json() == []


def test_no_solution_inchi_disables_hashing(client):
    response = client.post("/api/v1/exercises/", json=_exercise_payload())
    assert response.status_code == 201

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
        assert row.solution_inchi_hash is None
    finally:
        db.close()


def test_solution_inchi_hash_stores_hash(client):
    response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_inchi=f"  {INCHI_HASH_CCO}  "),
    )
    assert response.status_code == 201

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
        assert row.solution_inchi_hash is not None

        assert row.solution_inchi_hash == INCHI_HASH_CCO
    finally:
        db.close()


def test_create_exercise_stores_additional_spectrum_priority_from_filename(client):
    payload = _exercise_payload()
    payload["additional_spectra"] = [
        {
            "filename": "42_HSQC.svg",
            "file_base64": base64.b64encode(b"<svg></svg>").decode("ascii"),
            "label": "HSQC",
        }
    ]

    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201

    db = SessionLocal()
    try:
        exercise = db.query(Exercise).first()
        assert exercise is not None
        spectrum = (
            db.query(ExerciseAdditionalSpectrum)
            .filter(ExerciseAdditionalSpectrum.exercise_id == exercise.id)
            .first()
        )
        assert spectrum is not None
        assert spectrum.priority == 6
    finally:
        db.close()


def test_import_update_stores_explicit_additional_spectrum_priority(client):
    response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_inchi=INCHI_HASH_CCO),
    )
    assert response.status_code == 201
    exercise_id = response.json()["id"]

    response = client.post(
        "/api/v1/exercises/import-update",
        json={
            "match": {"inchi_hash": INCHI_HASH_CCO},
            "append": [
                {
                    "filename": "custom-spectrum.svg",
                    "file_base64": base64.b64encode(b"spectrum").decode("ascii"),
                    "label": "IR",
                    "priority": 42,
                }
            ],
        },
    )
    assert response.status_code == 200

    db = SessionLocal()
    try:
        spectrum = db.query(ExerciseAdditionalSpectrum).one()
        assert spectrum.exercise_id == exercise_id
        assert spectrum.priority == 42
    finally:
        db.close()


def test_import_update_replaces_additional_spectrum_row_and_file(client):
    payload = _exercise_payload(solution_inchi=INCHI_HASH_CCO)
    payload["additional_spectra"] = [
        {
            "filename": "1_IR.svg",
            "file_base64": base64.b64encode(b"old spectrum").decode("ascii"),
            "label": "IR",
        }
    ]
    created_response = client.post("/api/v1/exercises/", json=payload)
    assert created_response.status_code == 201
    exercise_id = created_response.json()["id"]

    db = SessionLocal()
    try:
        spectrum = (
            db.query(ExerciseAdditionalSpectrum)
            .filter(ExerciseAdditionalSpectrum.exercise_id == exercise_id)
            .one()
        )
        old_path = spectrum.file_path
        old_file = _upload_url_to_file_path(old_path)
        assert old_file.exists()
        spectrum_id = spectrum.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/exercises/import-update",
        json={
            "match": {"inchi_hash": INCHI_HASH_CCO},
            "replace_additional": {
                "ir": {
                    "filename": "1_IR.svg",
                    "file_base64": base64.b64encode(b"new spectrum").decode("ascii"),
                    "label": "IR",
                }
            },
        },
    )
    assert response.status_code == 200

    db = SessionLocal()
    try:
        replacement = db.query(ExerciseAdditionalSpectrum).filter(
            ExerciseAdditionalSpectrum.id == spectrum_id,
        ).one()
        assert replacement.exercise_id == exercise_id
        assert replacement.file_path != old_path
        assert _upload_url_to_file_path(replacement.file_path).read_bytes() == b"new spectrum"
        assert not old_file.exists()
    finally:
        db.close()


def test_create_exercise_parses_solvent_with_parentheses(client):
    payload = _exercise_payload()
    payload["h1_nmr_text"] = (
        "1H-NMR ((CH3)2SO, 300 MHz): 9.65 (1H, s), 9.14 (1H, s),"
        " 7.34 (2H, d, J = 8.8 Hz), 6.67 (2H, d, J = 8.8 Hz), 1.98 (3H, s);"
    )
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201

    created = response.json()
    assert created["h1_solvent"] == "(CH3)2SO"

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
    finally:
        db.close()


def test_create_exercise_uses_solvent_override(client):
    payload = _exercise_payload()
    payload["solvent"] = "D2O"
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201


    # API returns resolved solvent text; DB stores tokenized form
    created = response.json()
    assert created["h1_solvent"] == "D2O"
    assert created["c13_solvent"] == "D2O"

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
        assert row.h1_solvent is not None and "%solv{" in row.h1_solvent
        assert row.c13_solvent is not None and "%solv{" in row.c13_solvent
    finally:
        db.close()


def test_create_exercise_with_solution_cas_stores_only_hash(client):
    response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_cas_number=" 64 - 17 - 5 "),
    )
    assert response.status_code == 201
    created_id = response.json()["id"]

    db = SessionLocal()
    try:
        row = (
            db.query(Exercise)
            .filter(Exercise.id == created_id)
            .first()
        )
        assert row is not None
        expected_hash = hashlib.sha256("64-17-5".encode("utf-8")).hexdigest()
        assert row.solution_cas_hash == expected_hash
    finally:
        db.close()


def test_create_exercise_keeps_alt_cas_fields_optional(client):
    response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_cas_number="64-17-5"),
    )
    assert response.status_code == 201
    created_id = response.json()["id"]

    db = SessionLocal()
    try:
        row = (
            db.query(Exercise)
            .filter(Exercise.id == created_id)
            .first()
        )
        assert row is not None
        assert row.alt1_cas_hash is None
        assert row.alt2_cas_hash is None
    finally:
        db.close()
        
def test_create_exercise_with_empty_peak_segments(client):
    """
    Verifies that the lazy quantifier (.*?) successfully matches 1H and 13C 
    headers even when they contain absolutely no data blocks between ':' and ';'.
    """
    payload = _exercise_payload()
    payload["h1_nmr_text"] = "1H-NMR (CDCl3, 400 MHz):;"
    payload["c13_nmr_text"] = "13C-NMR (CDCl3, 100 MHz):;"

    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201
    
    created = response.json()
    assert created["h1_peaks"] == []
    assert created["c13_peaks"] == []


def test_create_exercise_with_blank_optional_text_fields(client):
    """
    Verifies that when optional text fields are explicitly passed as spaces, 
    tabs, or empty strings, the upfront string guard strips them out safely 
    and skips engine extraction without throwing a 422 exception.
    """
    payload = _exercise_payload()
    payload["c13_alt_text"] = "   "  # Whitespace padding
    payload["alt_nuc_text"] = ""     # Empty string string
    
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201
    
    created = response.json()
    assert created["c13_couplings"] == []
    assert created["alt_nuclei"] == []


def test_create_exercise_with_populated_optional_text_fields(client):
    """
    Validates that when the optional fields are provided with data, they are 
    correctly processed by the underlying loops and saved to the response structure.
    """
    payload = _exercise_payload()
    payload["c13_alt_text"] = "13C-NMR (CDCl3, 100 MHz): 125.1 (d, J = 5.5 Hz, 2);"
    payload["alt_nuc_text"] = "31P-NMR (CDCl3, 162 MHz): -14.2 (s);"

    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201
    
    created = response.json()
    assert len(created["c13_couplings"]) == 1
    assert created["c13_couplings"][0]["ppm"] == 125.1
    assert created["c13_couplings"][0]["atom_tag"] == 2
    
    assert len(created["alt_nuclei"]) == 1
    assert created["alt_nuclei"][0]["nucleus"] == "31P"
    assert created["alt_nuclei"][0]["ppm"] == -14.2

