from app.db.models import SolventsUsed
from app.db.session import SessionLocal


def test_solvent_responses_include_smiles(client):
    db = SessionLocal()
    solvent = SolventsUsed(
        names="CDCl3,chloroform-d",
        match="CDCl3",
        display="Chloroform",
        smiles="ClC(Cl)([2H])Cl",
        preference=0,
        count=0,
    )
    db.add(solvent)
    db.commit()
    solvent_id = solvent.id
    db.close()

    try:
        response = client.get("/api/v1/solvents/")
        listed_solvent = next(item for item in response.json() if item["id"] == solvent_id)
        assert listed_solvent["smiles"] == "ClC(Cl)([2H])Cl"

        response = client.put(
            f"/api/v1/solvents/{solvent_id}/preference",
            json={"preference": 1},
        )
        assert response.status_code == 200
        assert response.json()["smiles"] == "ClC(Cl)([2H])Cl"
    finally:
        db = SessionLocal()
        db.query(SolventsUsed).filter(SolventsUsed.id == solvent_id).delete()
        db.commit()
        db.close()
