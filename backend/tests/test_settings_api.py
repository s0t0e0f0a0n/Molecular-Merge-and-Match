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


def test_new_display_settings_can_be_saved_and_fetched(client):
    response = client.put(
        "/api/v1/settings/",
        json={
            "show_apt": True,
            "show_source": True,
            "show_tags": True,
            "enable_delete": True,
            "SR_mode": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["show_apt"] is True
    assert response.json()["show_source"] is True
    assert response.json()["show_tags"] is True
    assert response.json()["enable_delete"] is True
    assert response.json()["SR_mode"] is True

    fetched = client.get("/api/v1/settings/")
    assert fetched.status_code == 200
    assert fetched.json()["show_apt"] is True
    assert fetched.json()["show_source"] is True
    assert fetched.json()["show_tags"] is True
    assert fetched.json()["enable_delete"] is True
    assert fetched.json()["SR_mode"] is True
