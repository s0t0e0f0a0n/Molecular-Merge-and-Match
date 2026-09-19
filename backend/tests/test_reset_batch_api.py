from datetime import datetime

import pytest

from app.db.models import (
    Exercise,
    ExerciseAdditionalNuclei,
    ExerciseAdditionalSpectrum,
    ExerciseC13Coupling,
    ExerciseC13Peak,
    ExerciseH1Peak,
    Fragment,
    LogbookState,
    Statistics,
    WorkingSolution,
)
from app.db.session import SessionLocal


def _seed_exercise() -> int:
    db = SessionLocal()
    try:
        exercise = Exercise(
            name="Reset target",
            molecular_formula="C2H6O",
            h1_svg_path="/uploads/h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/uploads/c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
            exercise_set="set-a",
            completed=True,
        )
        db.add(exercise)
        db.flush()
        exercise_id = exercise.id
        storage_key = f"exercise-{exercise_id}"
        db.add_all([
            ExerciseH1Peak(exercise_id=exercise_id, ppm=1.0),
            ExerciseC13Peak(exercise_id=exercise_id, ppm=10.0),
            ExerciseC13Coupling(exercise_id=exercise_id, ppm=20.0),
            ExerciseAdditionalNuclei(exercise_id=exercise_id, nucleus="19F", ppm=30.0),
            ExerciseAdditionalSpectrum(exercise_id=exercise_id, file_path="/uploads/additional.svg"),
            Fragment(exercise_id=storage_key, label="fragment", smiles="C", mol_file="mol"),
            WorkingSolution(exercise_id=storage_key, smiles="CC", mol_file="mol"),
            LogbookState(exercise_id=storage_key, entries_json="[{\"kind\":\"link\"}]", cursor=1, links_json="[]"),
            Statistics(
                exercise_id=str(exercise_id),
                started_at=datetime(2024, 1, 1),
                completed_at=datetime(2024, 1, 2),
                timer_total=12,
            ),
        ])
        db.commit()
        return exercise_id
    finally:
        db.close()


def _counts(exercise_id: int) -> dict[str, int]:
    db = SessionLocal()
    try:
        return {
            "exercise": db.query(Exercise).filter(Exercise.id == exercise_id).count(),
            "h1": db.query(ExerciseH1Peak).filter(ExerciseH1Peak.exercise_id == exercise_id).count(),
            "c13": db.query(ExerciseC13Peak).filter(ExerciseC13Peak.exercise_id == exercise_id).count(),
            "coupling": db.query(ExerciseC13Coupling).filter(ExerciseC13Coupling.exercise_id == exercise_id).count(),
            "alt": db.query(ExerciseAdditionalNuclei).filter(ExerciseAdditionalNuclei.exercise_id == exercise_id).count(),
            "additional": db.query(ExerciseAdditionalSpectrum).filter(ExerciseAdditionalSpectrum.exercise_id == exercise_id).count(),
            "fragment": db.query(Fragment).filter(Fragment.exercise_id == f"exercise-{exercise_id}").count(),
            "solution": db.query(WorkingSolution).filter(WorkingSolution.exercise_id == f"exercise-{exercise_id}").count(),
            "logbook": db.query(LogbookState).filter(LogbookState.exercise_id == f"exercise-{exercise_id}").count(),
            "logbook_archived": db.query(LogbookState).filter(
                LogbookState.exercise_id == f"exercise-{exercise_id}",
                LogbookState.archived.isnot(None),
            ).count(),
            "statistics": db.query(Statistics).filter(Statistics.exercise_id == str(exercise_id)).count(),
        }
    finally:
        db.close()


@pytest.mark.parametrize("level", ["logbook", "workspace", "completion", "progression"])
def test_reset_batch_escalation_levels(client, level):
    exercise_id = _seed_exercise()
    response = client.post(
        "/api/v1/exercises/reset-batch",
        json={"exercise_ids": [exercise_id], "level": level},
    )
    assert response.status_code == 204

    counts = _counts(exercise_id)
    assert counts["exercise"] == 1
    assert counts["h1"] == 1
    assert counts["c13"] == 1
    assert counts["coupling"] == 1
    assert counts["alt"] == 1
    assert counts["additional"] == 1

    if level in {"logbook", "workspace", "completion"}:
        # Logbook data is kept, but marked as archived.
        assert counts["logbook"] == 1
        assert counts["logbook_archived"] == 1
    else:
        assert counts["logbook"] == 0
        assert counts["logbook_archived"] == 0
    if level == "logbook":
        assert counts["fragment"] == 1
        assert counts["solution"] == 1
        assert counts["statistics"] == 1
    elif level == "workspace":
        assert counts["fragment"] == 0
        assert counts["solution"] == 0
        assert counts["statistics"] == 1
    elif level == "completion":
        assert counts["fragment"] == 0
        assert counts["solution"] == 0
        assert counts["statistics"] == 1
    else:
        assert counts["fragment"] == 0
        assert counts["solution"] == 0
        assert counts["statistics"] == 0


def test_reset_batch_completion_clears_exercise_completion_without_deleting_statistics(client):
    exercise_id = _seed_exercise()
    response = client.post(
        "/api/v1/exercises/reset-batch",
        json={"exercise_ids": [exercise_id], "level": "completion"},
    )
    assert response.status_code == 204

    db = SessionLocal()
    try:
        assert db.query(Exercise).filter(Exercise.id == exercise_id).one().completed is False
        statistics = db.query(Statistics).filter(Statistics.exercise_id == str(exercise_id)).one()
        assert statistics.started_at is None
        assert statistics.completed_at is None
        assert statistics.timer_total == 0
    finally:
        db.close()


def test_reset_batch_remove_deletes_exercise_and_dependents(client):
    exercise_id = _seed_exercise()
    response = client.post(
        "/api/v1/exercises/reset-batch",
        json={"exercise_ids": [exercise_id], "level": "exercise"},
    )
    assert response.status_code == 204
    assert _counts(exercise_id) == {key: 0 for key in _counts(exercise_id)}
