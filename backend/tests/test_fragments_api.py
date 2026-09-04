def test_list_fragments_empty(client):
    resp = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_and_list_fragment(client):
    body = {"exercise_id": "ex1", "label": "Methyl", "smiles": "*C", "mol_file": "mock mol"}
    resp = client.post("/api/v1/fragments/", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["label"] == "Methyl"
    assert data["smiles"] == "*C"
    assert data["exercise_id"] == "ex1"
    assert "id" in data

    resp = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_fragments_scoped_by_exercise(client):
    client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "A", "smiles": "C", "mol_file": "m"
    })
    client.post("/api/v1/fragments/", json={
        "exercise_id": "ex2", "label": "B", "smiles": "CC", "mol_file": "m"
    })

    ex1 = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"}).json()
    ex2 = client.get("/api/v1/fragments/", params={"exercise_id": "ex2"}).json()

    assert all(f["exercise_id"] == "ex1" for f in ex1)
    assert all(f["exercise_id"] == "ex2" for f in ex2)
    assert any(f["label"] == "A" for f in ex1)
    assert not any(f["label"] == "B" for f in ex1)


def test_delete_fragment(client):
    body = {"exercise_id": "ex1", "label": "Temp", "smiles": "CC", "mol_file": "mol"}
    created = client.post("/api/v1/fragments/", json=body).json()

    resp = client.delete(f"/api/v1/fragments/{created['id']}")
    assert resp.status_code == 204

    resp = client.delete(f"/api/v1/fragments/{created['id']}")
    assert resp.status_code == 404


def test_deleted_fragment_hidden_from_list(client):
    """Soft-deleted fragments are filtered out of GET /fragments."""
    created = client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "Hidden", "smiles": "C", "mol_file": "m"
    }).json()

    listed = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"}).json()
    assert any(f["id"] == created["id"] for f in listed)

    client.delete(f"/api/v1/fragments/{created['id']}")

    listed = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"}).json()
    assert not any(f["id"] == created["id"] for f in listed)


def test_restore_fragment(client):
    """A soft-deleted fragment can be restored with the same id."""
    created = client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "ToRestore", "smiles": "CN", "mol_file": "m"
    }).json()
    original_id = created["id"]

    client.delete(f"/api/v1/fragments/{original_id}")

    resp = client.post(f"/api/v1/fragments/{original_id}/restore")
    assert resp.status_code == 200
    restored = resp.json()
    assert restored["id"] == original_id
    assert restored["label"] == "ToRestore"

    listed = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"}).json()
    assert any(f["id"] == original_id for f in listed)


def test_restore_is_idempotent(client):
    """Restoring an active fragment is a no-op, not an error."""
    created = client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "Active", "smiles": "C", "mol_file": "m"
    }).json()

    resp = client.post(f"/api/v1/fragments/{created['id']}/restore")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_restore_unknown_fragment_returns_404(client):
    resp = client.post("/api/v1/fragments/999999/restore")
    assert resp.status_code == 404


def test_soft_deleted_id_is_not_reused(client):
    """After soft-deleting fragment X, creating a new fragment must give a
    different id so client-side links to the deleted one don't accidentally
    re-attach to the new one."""
    a = client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "A", "smiles": "C", "mol_file": "m"
    }).json()

    client.delete(f"/api/v1/fragments/{a['id']}")

    b = client.post("/api/v1/fragments/", json={
        "exercise_id": "ex1", "label": "B", "smiles": "CC", "mol_file": "m"
    }).json()

    assert b["id"] != a["id"]


# Additional Fragment EP/BVA tests (testing assignment)
#
# Equivalence classes for fragment creation:
# -EC1: Valid fragment (all fields present) -> 201(tested above)
# -EC2: Missing required field              -> 422
# -EC3: Empty string fields                 -> 201 (accepted; no backend validation on content)
# -EC4: Delete non-existent fragment        -> 404 (tested above)
# -EC5: List from exercise with no fragments-> []  (tested above)
# -EC6: Multiple fragments same exercise    -> all returned
#
# Boundary values:
# - exercise_id: empty string (boundary of valid input)
# - label: very long string
# - fragment_id: 0, negative, non-existent large value


def test_create_fragment_missing_field(client):
    """EC2: Missing required field returns 422."""
    # Missing mol_file field
    body = {"exercise_id": "ex1", "label": "Methyl", "smiles": "C"}
    resp = client.post("/api/v1/fragments/", json=body)
    assert resp.status_code == 422


def test_create_fragment_empty_strings(client):
    """EC3/BVA: Empty strings for all fields are accepted (no content validation)."""
    body = {"exercise_id": "", "label": "", "smiles": "", "mol_file": ""}
    resp = client.post("/api/v1/fragments/", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["exercise_id"] == ""
    assert data["label"] == ""


def test_multiple_fragments_same_exercise(client):
    """EC6: Multiple fragments for the same exercise are all returned."""
    for i in range(3):
        client.post("/api/v1/fragments/", json={
            "exercise_id": "ex1", "label": f"Frag{i}", "smiles": "C" * (i + 1), "mol_file": "m"
        })
    resp = client.get("/api/v1/fragments/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert len(resp.json()) == 3


def test_delete_fragment_nonexistent_large_id(client):
    """BVA: Delete with a very large non-existent ID returns 404."""
    resp = client.delete("/api/v1/fragments/999999")
    assert resp.status_code == 404


def test_list_fragments_missing_exercise_id(client):
    """BVA: Missing exercise_id query param returns 422."""
    resp = client.get("/api/v1/fragments/")
    assert resp.status_code == 422


# Working Solution tests

def test_working_solution_empty(client):
    resp = client.get("/api/v1/working-solution/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200


def test_set_and_get_working_solution(client):
    body = {"smiles": "CCO", "mol_file": "mol data"}
    resp = client.put("/api/v1/working-solution/", json=body, params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert resp.json()["smiles"] == "CCO"

    resp = client.get("/api/v1/working-solution/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200
    assert resp.json()["smiles"] == "CCO"


def test_working_solution_scoped_by_exercise(client):
    client.put("/api/v1/working-solution/", json={"smiles": "CCO", "mol_file": "m"}, params={"exercise_id": "ex1"})
    client.put("/api/v1/working-solution/", json={"smiles": "CC", "mol_file": "m"}, params={"exercise_id": "ex2"})

    ex1 = client.get("/api/v1/working-solution/", params={"exercise_id": "ex1"}).json()
    ex2 = client.get("/api/v1/working-solution/", params={"exercise_id": "ex2"}).json()

    assert ex1["smiles"] == "CCO"
    assert ex2["smiles"] == "CC"


def test_clear_working_solution(client):
    client.put("/api/v1/working-solution/", json={"smiles": "CC", "mol_file": "x"}, params={"exercise_id": "ex1"})
    resp = client.delete("/api/v1/working-solution/", params={"exercise_id": "ex1"})
    assert resp.status_code == 204

    resp = client.get("/api/v1/working-solution/", params={"exercise_id": "ex1"})
    assert resp.status_code == 200


#Additional Working Solution EP/BVA tests (testing assignment)
#
# Equivalence classes for set_working_solution:
# -EC1: Valid SMILES + mol_file -> 200, data stored (tested above)
# -EC2: Overwrite existing solution -> 200, updated
# -EC3: Missing required field -> 422
# -EC4: Empty exercise_id -> accepted (no validation)
#
# Boundary values:
# - Missing exercise_id query param -> 422
# - Clear when no solution exists -> 204 (idempotent)


def test_overwrite_working_solution(client):
    """EC2: Overwriting an existing solution replaces it."""
    client.put("/api/v1/working-solution/", json={"smiles": "CCO", "mol_file": "m"}, params={"exercise_id": "ex1"})
    client.put("/api/v1/working-solution/", json={"smiles": "CC=O", "mol_file": "m2"}, params={"exercise_id": "ex1"})

    resp = client.get("/api/v1/working-solution/", params={"exercise_id": "ex1"})
    assert resp.json()["smiles"] == "CC=O"
    assert resp.json()["mol_file"] == "m2"


def test_set_working_solution_missing_field(client):
    """EC3: Missing required field returns 422."""
    body = {"smiles": "C"}  # missing mol_file
    resp = client.put("/api/v1/working-solution/", json=body, params={"exercise_id": "ex1"})
    assert resp.status_code == 422


def test_working_solution_missing_exercise_id(client):
    """BVA: Missing exercise_id query param returns 422."""
    resp = client.get("/api/v1/working-solution/")
    assert resp.status_code == 422


def test_clear_working_solution_idempotent(client):
    """BVA: Clearing when no solution exists is still 204."""
    resp = client.delete("/api/v1/working-solution/", params={"exercise_id": "nonexistent"})
    assert resp.status_code == 204
