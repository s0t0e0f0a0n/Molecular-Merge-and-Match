def test_list_predefined_fragments_empty(client):
    resp = client.get("/api/v1/predefined-fragments/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_and_list_predefined_fragment(client):
    body = {"name": "Methyl group", "smiles": "C", "keywords": "methyl,CH3,alkyl"}
    resp = client.post("/api/v1/predefined-fragments/", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Methyl group"
    assert data["smiles"] == "C"
    assert data["keywords"] == "methyl,CH3,alkyl"
    assert data["user_added"] is True
    assert "id" in data

    resp = client.get("/api/v1/predefined-fragments/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_by_keyword(client):
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Methyl group", "smiles": "C", "keywords": "methyl,CH3,alkyl"
    })
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Phenyl ring", "smiles": "c1ccccc1", "keywords": "phenyl,benzene,aromatic,ring"
    })

    resp = client.get("/api/v1/predefined-fragments/", params={"search": "methyl"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["name"] == "Methyl group"


def test_search_by_regex(client):
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Hydroxyl group", "smiles": "O", "keywords": "hydroxyl,OH,alcohol"
    })
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Carboxyl group", "smiles": "C(=O)O", "keywords": "carboxyl,COOH,acid"
    })
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Phenyl ring", "smiles": "c1ccccc1", "keywords": "phenyl,benzene,ring"
    })

    resp = client.get("/api/v1/predefined-fragments/", params={"search": "acid|alcohol"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 2
    names = {r["name"] for r in results}
    assert names == {"Hydroxyl group", "Carboxyl group"}


def test_search_invalid_regex(client):
    resp = client.get("/api/v1/predefined-fragments/", params={"search": "[invalid"})
    assert resp.status_code == 400


def test_search_matches_name_too(client):
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Phenyl ring", "smiles": "c1ccccc1", "keywords": "aromatic"
    })

    resp = client.get("/api/v1/predefined-fragments/", params={"search": "Phenyl"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_delete_predefined_fragment(client):
    created = client.post("/api/v1/predefined-fragments/", json={
        "name": "Temp", "smiles": "CC", "keywords": "temp"
    }).json()

    resp = client.delete(f"/api/v1/predefined-fragments/{created['id']}")
    assert resp.status_code == 204

    resp = client.delete(f"/api/v1/predefined-fragments/{created['id']}")
    assert resp.status_code == 404


def test_delete_does_not_affect_other_fragments(client):
    client.post("/api/v1/predefined-fragments/", json={
        "name": "Keep", "smiles": "C", "keywords": "keep"
    }).json()
    b = client.post("/api/v1/predefined-fragments/", json={
        "name": "Delete", "smiles": "CC", "keywords": "delete"
    }).json()

    client.delete(f"/api/v1/predefined-fragments/{b['id']}")

    resp = client.get("/api/v1/predefined-fragments/")
    results = resp.json()
    assert len(results) == 1
    assert results[0]["name"] == "Keep"
