from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_non_get_api_request_requires_custom_header():
    client = TestClient(app, headers={"Host": "localhost"})
    response = client.post("/api/v1/statistics/stop")
    assert response.status_code == 403
