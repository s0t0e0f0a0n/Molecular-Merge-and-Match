from app.db.models import UserSettings
from app.db.session import SessionLocal


def test_settings_response_includes_spaced_repetition_mode(client):
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter_by(name="User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.SR_mode = True
        db.commit()
    finally:
        db.close()

    response = client.get("/api/v1/settings/")

    assert response.status_code == 200
    assert response.json()["SR_mode"] is True
