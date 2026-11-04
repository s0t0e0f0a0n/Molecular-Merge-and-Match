from app.db.models import ExerciseCreationDraft
from app.db.session import SessionLocal


def test_exercise_creation_draft_store_and_fetch(client):
    nmrium_data = {
        "spectra": [
            {
                "nucleus": "1H",
                "multiplets": [{"from": 1.1, "to": 1.4, "delta": 1.31}],
                "peaks": [],
            }
        ]
    }

    response = client.post(
        "/api/v1/exercise-creation/drafts",
        json={"nmrium_data": nmrium_data},
    )

    assert response.status_code == 201
    draft = response.json()
    assert draft["nmrium_data"] == nmrium_data
    assert draft["stage"] == "nmrium"

    with SessionLocal() as db:
        stored = db.get(ExerciseCreationDraft, draft["id"])
        assert stored is not None
        assert stored.nmrium_data == nmrium_data

    fetched = client.get(f"/api/v1/exercise-creation/drafts/{draft['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["nmrium_data"] == nmrium_data

    updated_data = {"spectra": [{"nucleus": "13C", "peaks": [{"x": 24.14}]}]}
    updated = client.put(
        f"/api/v1/exercise-creation/drafts/{draft['id']}/nmrium",
        json={"nmrium_data": updated_data},
    )
    assert updated.status_code == 200
    assert updated.json()["nmrium_data"] == updated_data


def test_exercise_creation_draft_returns_404_for_unknown_id(client):
    response = client.get("/api/v1/exercise-creation/drafts/unknown")
    assert response.status_code == 404
