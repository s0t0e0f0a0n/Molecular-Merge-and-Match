"""The logbook is stored as one row per exercise with three fields
(entries_json, cursor, links_json). When you clear a logbook, any fragments
the user deleted in that exercise are also removed.
"""

import json

from app.db.models import Fragment, LogbookState
from app.db.session import SessionLocal


def test_empty_logbook_gives_back_defaults(client):
    """
        When nothing has been saved yet, the API should give back an empty
        logbook instead of an error.
    """

    resp = client.get("/api/v1/logbook/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"entries_json": "[]", "cursor": 0, "links_json": "[]"}


def test_fetching_needs_an_exercise_id(client):
    resp = client.get("/api/v1/logbook/")
    assert resp.status_code == 422


def test_saved_logbook_is_fetched_back(client):
    body = {
        "entries_json": '[{"id":"a","ts":1,"kind":"create-fragment","fragmentId":7,"fragLabel":"OH"}]',
        "cursor": 1,
        "links_json": '[{"fragmentId":"7","peakId":"H3"}]',
    }
    resp = client.put("/api/v1/logbook/", json=body, params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert resp.json() == body

    resp = client.get("/api/v1/logbook/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert resp.json() == body


def test_saving_overwrites_the_previous_one(client):
    first = {"entries_json": "[]", "cursor": 0, "links_json": "[]"}
    second = {
        "entries_json": '[{"id":"b","ts":2,"kind":"clear-links","before":[]}]',
        "cursor": 1,
        "links_json": "[]",
    }
    client.put("/api/v1/logbook/", json=first, params={"exercise_id": "ex1"})
    resp = client.put("/api/v1/logbook/", json=second, params={"exercise_id": "ex1"})
    assert resp.status_code == 200

    fetched = client.get("/api/v1/logbook/", params={"exercise_id": "ex1"}).json()
    assert fetched["cursor"] == 1
    assert "clear-links" in fetched["entries_json"]


def test_each_exercise_has_its_own_logbook(client):
    """Saving to one exercise must never overwrite or mix into another one."""

    a = {"entries_json": '[{"id":"a"}]', "cursor": 5, "links_json": "[]"}
    b = {"entries_json": '[{"id":"b"}]', "cursor": 9, "links_json": "[]"}
    client.put("/api/v1/logbook/", json=a, params={"exercise_id": "ex1"})
    client.put("/api/v1/logbook/", json=b, params={"exercise_id": "ex2"})

    ex1 = client.get("/api/v1/logbook/", params={"exercise_id": "ex1"}).json()
    ex2 = client.get("/api/v1/logbook/", params={"exercise_id": "ex2"}).json()

    assert ex1["cursor"] == 5
    assert '"a"' in ex1["entries_json"]
    assert ex2["cursor"] == 9
    assert '"b"' in ex2["entries_json"]


def test_saving_needs_all_fields(client):
    body = {"entries_json": "[]", "cursor": 0}  # missing links_json
    resp = client.put("/api/v1/logbook/", json=body, params={"exercise_id": "ex1"})
    assert resp.status_code == 422


def test_saving_needs_an_exercise_id(client):
    body = {"entries_json": "[]", "cursor": 0, "links_json": "[]"}
    resp = client.put("/api/v1/logbook/", json=body)
    assert resp.status_code == 422


def test_saved_logbook_ends_up_in_db(client):
    """ The saved logbook should show up in the db, so it is not only the response is correct."""

    body = {"entries_json": '[{"x":1}]', "cursor": 1, "links_json": "[]"}
    client.put("/api/v1/logbook/", json=body, params={"exercise_id": "ex-db"})

    db = SessionLocal()
    try:
        row = db.query(LogbookState).filter(LogbookState.exercise_id == "ex-db").one()
        assert row.cursor == 1
        assert row.entries_json == '[{"x":1}]'
    finally:
        db.close()


def test_clearing_removes_logbook(client):
    body = {"entries_json": '[{"x":1}]', "cursor": 1, "links_json": "[]"}
    client.put("/api/v1/logbook/", json=body, params={"exercise_id": "ex1"})

    resp = client.delete("/api/v1/logbook/", params={"exercise_id": "ex1"})
    assert resp.status_code == 204

    fetched = client.get("/api/v1/logbook/", params={"exercise_id": "ex1"}).json()
    assert fetched == {"entries_json": "[]", "cursor": 0, "links_json": "[]"}


def test_clearing_empty_logbook_still_works(client):
    """Clearing a logbook that was never saved should still succeed."""

    resp = client.delete("/api/v1/logbook/", params={"exercise_id": "never-existed"})
    assert resp.status_code == 204


def test_clearing_logbook_removes_deleted_fragments(client):
    """
    After the logbook is cleared, the user cannot perform 'undo' operations.
    So soft deleted rown are unreachable.
    """

    created = client.post(
        "/api/v1/fragments/",
        json={"exercise_id": "ex1", "label": "DeletedFrag", "smiles": "C", "mol_file": "m"},
    ).json()
    client.delete(f"/api/v1/fragments/{created['id']}")

    # Make sure soft-deleted rows exist
    db = SessionLocal()
    try:
        row = db.query(Fragment).filter(Fragment.id == created["id"]).one()
        assert row.deleted_at is not None
    finally:
        db.close()

    client.delete("/api/v1/logbook/", params={"exercise_id": "ex1"})

    db = SessionLocal()
    try:
        gone = db.query(Fragment).filter(Fragment.id == created["id"]).first()
        assert gone is None
    finally:
        db.close()


def test_clearing_keeps_active_fragments(client):
    """Clearing should leave the user's active fragments alone."""

    active = client.post(
        "/api/v1/fragments/",
        json={"exercise_id": "ex1", "label": "Keep", "smiles": "C", "mol_file": "m"},
    ).json()

    client.delete("/api/v1/logbook/", params={"exercise_id": "ex1"})

    listed = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"}).json()
    assert any(f["id"] == active["id"] for f in listed)


def test_clearing_one_exercise_does_not_affect_another(client):
    """Clearing the logbook of 1 exercise must not remove fragments from a different one."""

    ex2_doomed = client.post(
        "/api/v1/fragments/",
        json={"exercise_id": "ex2", "label": "Ex2-only", "smiles": "CC", "mol_file": "m"},
    ).json()
    client.delete(f"/api/v1/fragments/{ex2_doomed['id']}")

    client.delete("/api/v1/logbook/", params={"exercise_id": "ex1"})

    db = SessionLocal()
    try:
        row = db.query(Fragment).filter(Fragment.id == ex2_doomed["id"]).one()
        assert row.deleted_at is not None  # still marked as deleted, not actually removed
    finally:
        db.close()


def test_clearing_needs_exercise_id(client):
    resp = client.delete("/api/v1/logbook/")
    assert resp.status_code == 422


def test_saving_many_entries_does_not_cut_them(client):
    """
    The long logbook should not be cut off after going through the db.
    """

    big_entries = json.dumps([
        {
        "id": f"e{i}",
        "ts": i,
        "kind": "link",
        "fragmentId": "1",
        "peakId": f"H{i}"
        }
    for i in range(500)
    ])
    body = {"entries_json": big_entries, "cursor": 500, "links_json": "[]"}

    client.put("/api/v1/logbook/", json=body, params={"exercise_id": "ex-big"})

    fetched = client.get("/api/v1/logbook/", params={"exercise_id": "ex-big"}).json()

    assert fetched["entries_json"] == big_entries
    assert fetched["cursor"] == 500
