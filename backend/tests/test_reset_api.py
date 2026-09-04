"""Tests for resetting a single exercise.

Reset clears the fragments, working solution, and logbook for the chosen
exercise. Other exercises stay untouched.
"""

from app.db.models import Fragment, LogbookState, WorkingSolution
from app.db.session import SessionLocal


def test_reset_clears_fragments_working_solution_and_logbook(client):
    client.post(
        "/api/v1/fragments/",
        json={"exercise_id": "ex1", "label": "F1", "smiles": "C", "mol_file": "m"},
    )
    client.put(
        "/api/v1/working-solution/",
        json={"smiles": "CCO", "mol_file": "m"},
        params={"exercise_id": "ex1"},
    )
    client.put(
        "/api/v1/logbook/",
        json={"entries_json": '[{"x":1}]', "cursor": 1, "links_json": "[]"},
        params={"exercise_id": "ex1"},
    )

    resp = client.post("/api/v1/exercises/reset", params={"exercise_id": "ex1"})
    assert resp.status_code == 204

    db = SessionLocal()
    try:
        assert db.query(Fragment).filter(Fragment.exercise_id == "ex1").count() == 0
        assert (
            db.query(WorkingSolution).filter(WorkingSolution.exercise_id == "ex1").count()
            == 0
        )
        assert (
            db.query(LogbookState).filter(LogbookState.exercise_id == "ex1").count() == 0
        )
    finally:
        db.close()


def test_reset_doesnt_touch_other_exercises(client):
    client.post(
        "/api/v1/fragments/",
        json={"exercise_id": "ex2", "label": "keep", "smiles": "C", "mol_file": "m"},
    )
    client.put(
        "/api/v1/logbook/",
        json={"entries_json": '[{"x":1}]', "cursor": 1, "links_json": "[]"},
        params={"exercise_id": "ex2"},
    )

    client.post("/api/v1/exercises/reset", params={"exercise_id": "ex1"})

    listed = client.get("/api/v1/fragments/", params={"exercise_id": "ex2"}).json()
    assert any(f["label"] == "keep" for f in listed)

    fetched = client.get("/api/v1/logbook/", params={"exercise_id": "ex2"}).json()
    assert fetched["cursor"] == 1


def test_reset_of_empty_exercise_succeeds(client):
    resp = client.post(
        "/api/v1/exercises/reset", params={"exercise_id": "never-existed"}
    )
    assert resp.status_code == 204


def test_reset_needs_exercise_id(client):
    resp = client.post("/api/v1/exercises/reset")
    assert resp.status_code == 422
