import json

from app.api.statistics import mark_exercise_completed
from app.db.models import Exercise, LogbookState, Statistics, UserSettings
from app.db.session import SessionLocal


def test_completion_stores_active_cheats(client):
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.cheats = "10011110000"
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(42)

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "42").one()
        assert row.cheats_used == "10011110000"
    finally:
        db.close()

    response = client.get("/api/v1/statistics/", params={"exercise_id": "42"})
    assert response.status_code == 200
    assert response.json()["cheats_used"] == "10011110000"


def test_completion_stores_final_logbook_counts(client):
    entries = [
        {"kind": "create-fragment"},
        {"kind": "create-fragment"},
        {"kind": "link"},
        {"kind": "link"},
        {"kind": "unlink"},
        {"kind": "merge-fragments"},
        {"kind": "delete-fragment"},
    ]
    db = SessionLocal()
    try:
        db.add(LogbookState(exercise_id="exercise-43", entries_json=json.dumps(entries)))
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(43)

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "43").one()
        assert row.fragments_drawn == 1
        assert row.matches_done == 1
        assert row.merges_done == 1
    finally:
        db.close()


def test_difficulty_rating_overwrites_letter_and_increments_count(client):
    first = client.post(
        "/api/v1/statistics/difficulty",
        params={"exercise_id": "44"},
        json={"rating": "E"},
    )
    assert first.status_code == 200
    assert first.json()["difficulty"] == "E1"

    second = client.post(
        "/api/v1/statistics/difficulty",
        params={"exercise_id": "44"},
        json={"rating": "D"},
    )
    assert second.status_code == 200
    assert second.json()["difficulty"] == "D1"


def test_reference_exercise_does_not_create_statistics_row(client):
    db = SessionLocal()
    try:
        db.add(
            Exercise(
                exercise_set="References",
                h1_svg_path="/references/h1.svg",
                h1_axis_start=0,
                h1_axis_end=1,
                h1_nmr_text="reference",
                c13_svg_path="/references/c13.svg",
                c13_axis_start=0,
                c13_axis_end=1,
                c13_nmr_text="reference",
                completed=True,
            )
        )
        db.commit()
        exercise_id = db.query(Exercise).order_by(Exercise.id.desc()).first().id
    finally:
        db.close()

    response = client.get("/api/v1/statistics/", params={"exercise_id": str(exercise_id)})
    assert response.status_code == 200
    assert response.json()["completed_at"] is None

    db = SessionLocal()
    try:
        assert db.query(Statistics).filter(Statistics.exercise_id == str(exercise_id)).first() is None
    finally:
        db.close()
