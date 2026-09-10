from app.api.statistics import mark_exercise_completed
from app.db.models import Statistics, UserSettings
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
