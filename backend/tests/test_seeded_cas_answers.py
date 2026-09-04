from app.db.models import Exercise
from app.db.session import SessionLocal, init_db


def test_seeded_exercises_have_cas_answers_and_validate(client):
    init_db()

    db = SessionLocal()
    try:
        seeded_exercises = db.query(Exercise).filter(Exercise.tags_csv.like("%example%")).all()

        # Build expected hashes map dynamically from DB
        expected_cas_hash_by_exercise_id = {
            exercise.id: exercise.solution_cas_hash
            for exercise in seeded_exercises
        }

        assert all(hash is not None for hash in expected_cas_hash_by_exercise_id.values())
    finally:
        db.close()

    for exercise_id, cas_hash in expected_cas_hash_by_exercise_id.items():
        response = client.post(
            f"/api/v1/exercises/{exercise_id}/validate-cas",
            json={"cas_number": cas_hash},
        )
        assert response.status_code == 200
        assert response.json() == {"is_correct": True}
