from fastapi.testclient import TestClient

from app.main import app, create_app


def test_health_returns_ok(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_non_get_api_request_requires_custom_header():
    client = TestClient(app, headers={"Host": "localhost"})
    response = client.post("/api/v1/statistics/stop")
    assert response.status_code == 403


def test_api_docs_are_disabled_unless_enabled(monkeypatch):
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    docs_disabled = TestClient(create_app(), headers={"Host": "localhost"})
    assert docs_disabled.get("/docs").status_code == 404
    assert docs_disabled.get("/redoc").status_code == 404
    assert docs_disabled.get("/openapi.json").status_code == 404

    monkeypatch.setenv("ENABLE_DOCS", "1")
    docs_enabled = TestClient(create_app(), headers={"Host": "localhost"})
    assert docs_enabled.get("/docs").status_code == 200
    assert docs_enabled.get("/redoc").status_code == 200
    assert docs_enabled.get("/openapi.json").status_code == 200
