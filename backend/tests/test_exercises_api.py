import base64
import hashlib
from pathlib import Path

from app.core.config import settings
from app.db.models import Exercise, ExerciseAdditionalSpectrum
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
        assert spectrum.priority == 10
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

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
        assert row.h1_solvent == "(CH3)2SO"
    finally:
        db.close()


def test_create_exercise_uses_solvent_override(client):
    payload = _exercise_payload()
    payload["solvent"] = "D2O"
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201

    db = SessionLocal()
    try:
        row = db.query(Exercise).first()
        assert row is not None
        assert row.h1_solvent == "D2O"
        assert row.c13_solvent == "D2O"
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


def test_validate_cas_returns_true_when_input_matches_hash(client):
    create_response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_cas_number="64-17-5"),
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/exercises/{created_id}/validate-cas",
        json={"cas_number": " 64 - 17 - 5 "},
    )
    assert response.status_code == 200
    assert response.json() == {"is_correct": True}


def test_validate_cas_returns_false_when_input_does_not_match_hash(client):
    create_response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_cas_number="64-17-5"),
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/exercises/{created_id}/validate-cas",
        json={"cas_number": "67-56-1"},
    )
    assert response.status_code == 200
    assert response.json() == {"is_correct": False}


def test_validate_solution_returns_true_when_input_matches_hash(client):
    create_response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_inchi=INCHI_HASH_CCO),
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]

    response = client.post(
        f"/api/v1/exercises/{created_id}/validate-solution",
        json={"solution_hash": INCHI_HASH_CCO},
    )
    assert response.status_code == 200
    assert response.json() == {"is_correct": True}


def test_validate_solution_returns_false_when_input_does_not_match_hash(client):
    create_response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_inchi=INCHI_HASH_CCO),
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]

    wrong_hash = hashlib.sha256("InChI=1S/CH4/h1H4".encode("utf-8")).hexdigest()
    response = client.post(
        f"/api/v1/exercises/{created_id}/validate-solution",
        json={"solution_hash": wrong_hash},
    )
    assert response.status_code == 200
    assert response.json() == {"is_correct": False}


def test_list_exercises_returns_created_exercise(client):
    create_response = client.post(
        "/api/v1/exercises/",
        json=_exercise_payload(solution_inchi=INCHI_HASH_CCO),
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]

    list_response = client.get("/api/v1/exercises/")
    assert list_response.status_code == 200
    data = list_response.json()

    assert len(data) == 1
    assert data[0]["id"] == created_id
    assert data[0]["name"] == "Demo exercise"
    assert data[0]["molecular_formula"] == "C2H6O"


def test_svg_script_tag_is_stripped(client):
    payload = _exercise_payload()
    payload["h1_spectrum_svg"]["svg_text"] = (
        "<svg xmlns='http://www.w3.org/2000/svg'>"
        "<script>alert('xss')</script>"
        "</svg>"
    )
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201

    exercise_id = response.json()["id"]
    db = SessionLocal()
    try:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        assert row is not None
        h1_content = _upload_url_to_file_path(row.h1_svg_path).read_text(encoding="utf-8")
        assert "<script" not in h1_content.lower()
    finally:
        db.close()


def test_svg_event_handler_attribute_is_stripped(client):
    payload = _exercise_payload()
    payload["c13_spectrum_svg"]["svg_text"] = (
        "<svg xmlns='http://www.w3.org/2000/svg' onload=\"alert('xss')\"></svg>"
    )
    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201

    exercise_id = response.json()["id"]
    db = SessionLocal()
    try:
        row = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        assert row is not None
        c13_content = _upload_url_to_file_path(row.c13_svg_path).read_text(encoding="utf-8")
        assert "onload" not in c13_content.lower()
    finally:
        db.close()


def test_svg_paths_in_response_are_url_not_filesystem(client):
    response = client.post("/api/v1/exercises/", json=_exercise_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["h1_svg_path"].startswith("/uploads/")
    assert data["c13_svg_path"].startswith("/uploads/")
    assert not data["h1_svg_path"].startswith("/Users/")
    assert not data["h1_svg_path"].startswith("/app/")


def test_rejects_old_h1_format(client):
    payload = _exercise_payload()
    payload["h1_nmr_text"] = "1H NMR (300 MHz, CDCl3) δ 1.00 (s, 3H), 3.50 (q, 2H)."
    payload["c13_nmr_text"] = "13C NMR (75 MHz, CDCl3) δ 58.2, 18.3."

    response = client.post("/api/v1/exercises/", json=payload)

    assert response.status_code == 422
    assert "1H-NMR (solvent, x MHz): ...;" in response.json()["detail"]


def test_duplicate_solution_inchi_is_rejected(client):
    client.post("/api/v1/exercises/", json=_exercise_payload(solution_inchi=INCHI_HASH_CCO))
    response = client.post(
        "/api/v1/exercises/", json=_exercise_payload(solution_inchi=INCHI_HASH_CCO)
    )
    assert response.status_code == 409


def test_c13_apt_round_trip(client):
    payload = _exercise_payload()
    payload["c13_apt"] = True

    create_response = client.post("/api/v1/exercises/", json=payload)
    assert create_response.status_code == 201
    exercise_id = create_response.json()["id"]
    assert create_response.json()["c13_apt"] is True

    get_response = client.get(f"/api/v1/exercises/{exercise_id}")
    assert get_response.status_code == 200
    assert get_response.json()["c13_apt"] is True


def test_c13_apt_defaults_to_none(client):
    response = client.post("/api/v1/exercises/", json=_exercise_payload())
    assert response.status_code == 201
    assert response.json()["c13_apt"] is None


def test_c13_apt_false(client):
    payload = _exercise_payload()
    payload["c13_apt"] = False

    response = client.post("/api/v1/exercises/", json=payload)
    assert response.status_code == 201
    assert response.json()["c13_apt"] is False
