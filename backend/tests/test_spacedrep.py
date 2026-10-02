from datetime import datetime, timedelta

from app.api.spacedrep import calculate_spaced_repetition_interval
from app.db.models import Exercise, Statistics
from app.db.session import SessionLocal


def test_cheats_off_within_one_minute_of_completion_counts_as_cheating():
    completed_at = datetime(2026, 10, 2, 12, 1)
    result = calculate_spaced_repetition_interval(
        60,
        0,
        "000000000000",
        5,
        "E1",
        completed_at=completed_at,
        cheats_off=completed_at - timedelta(seconds=60),
    )

    assert result["debug_components"]["C_P"] == 0.0


def test_cheats_used_falls_back_to_first_bit():
    used = calculate_spaced_repetition_interval(60, 0, "100000000000", 5, "E1")
    unused = calculate_spaced_repetition_interval(60, 0, "011111111111", 5, "E1")

    assert used["debug_components"]["C_P"] == 0.0
    assert unused["debug_components"]["C_P"] == 1.0


def test_cheats_off_outside_one_minute_uses_first_bit():
    completed_at = datetime(2026, 10, 2, 12, 2)
    result = calculate_spaced_repetition_interval(
        60,
        0,
        "000000000000",
        5,
        "E1",
        completed_at=completed_at,
        cheats_off=completed_at - timedelta(seconds=61),
    )

    assert result["debug_components"]["C_P"] == 1.0


def test_skip_sets_only_selected_exercise_due_time_six_hours_ahead(client):
    db = SessionLocal()
    try:
        selected = Exercise(
            name="Selected exercise",
            in_SR=1,
            h1_svg_path="/selected-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/selected-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        unrelated = Exercise(
            name="Unrelated exercise",
            h1_svg_path="/unrelated-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/unrelated-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        db.add_all([selected, unrelated])
        db.flush()
        db.add_all([
            Statistics(exercise_id=str(selected.id)),
            Statistics(exercise_id=str(unrelated.id)),
        ])
        unrelated.due_time = datetime(2026, 10, 3, 12)
        db.commit()
        selected_id, unrelated_id = selected.id, unrelated.id
    finally:
        db.close()

    request_started = datetime.now()
    response = client.post(f"/api/v1/spacedrep/{selected_id}/skip")
    request_finished = datetime.now()

    assert response.status_code == 200
    returned_due_time = datetime.fromisoformat(response.json()["due_time"])
    assert request_started + timedelta(hours=6) <= returned_due_time
    assert returned_due_time <= request_finished + timedelta(hours=6)

    db = SessionLocal()
    try:
        selected_exercise = db.query(Exercise).filter_by(id=selected_id).one()
        unrelated_exercise = db.query(Exercise).filter_by(id=unrelated_id).one()
        assert selected_exercise.due_time == returned_due_time
        assert unrelated_exercise.due_time == datetime(2026, 10, 3, 12)
    finally:
        db.close()


def test_skip_does_not_schedule_exercise_outside_spaced_repetition(client):
    original_due_time = datetime.now() + timedelta(days=3)
    db = SessionLocal()
    try:
        exercise = Exercise(
            name="Normal-mode exercise",
            in_SR=0,
            due_time=original_due_time,
            h1_svg_path="/normal-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/normal-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        db.add(exercise)
        db.commit()
        exercise_id = exercise.id
    finally:
        db.close()

    response = client.post(f"/api/v1/spacedrep/{exercise_id}/skip")

    assert response.status_code == 200
    assert datetime.fromisoformat(response.json()["due_time"]) == original_due_time

    db = SessionLocal()
    try:
        exercise = db.query(Exercise).filter_by(id=exercise_id).one()
        assert exercise.due_time == original_due_time
        assert db.query(Statistics).filter_by(exercise_id=str(exercise_id)).count() == 0
    finally:
        db.close()


def test_skip_preserves_mastery_due_time_for_completed_exercise(client):
    completed_at = datetime.now() - timedelta(hours=1)
    db = SessionLocal()
    try:
        exercise = Exercise(
            name="Completed exercise",
            completed=True,
            in_SR=1,
            h1_svg_path="/completed-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/completed-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        db.add(exercise)
        db.flush()
        db.add(Statistics(
            exercise_id=str(exercise.id),
            completed_at=completed_at,
            timer_total=120,
            incorrect_count=0,
            cheats_used="000000000000",
            difficulty="M2",
            confidence=4,
        ))
        exercise.due_time = completed_at + timedelta(days=5)
        db.commit()
        exercise_id = exercise.id
    finally:
        db.close()

    expected = calculate_spaced_repetition_interval(
        timer_total=120,
        incorrect_count=0,
        cheats_used="000000000000",
        confidence=4,
        difficulty="M2",
        completed_at=completed_at,
    )
    response = client.post(f"/api/v1/spacedrep/{exercise_id}/skip")

    assert response.status_code == 200
    expected_due_time = completed_at + timedelta(days=expected["next_review_days"])
    assert datetime.fromisoformat(response.json()["due_time"]) == expected_due_time

    db = SessionLocal()
    try:
        statistics = db.query(Statistics).filter_by(exercise_id=str(exercise_id)).one()
        exercise = db.query(Exercise).filter_by(id=exercise_id).one()
        assert exercise.due_time == expected_due_time
        assert statistics.mastery_index == expected["mastery_index"]
    finally:
        db.close()
