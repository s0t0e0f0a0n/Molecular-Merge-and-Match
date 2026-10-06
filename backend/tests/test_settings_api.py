from datetime import datetime, timedelta

from app.db.models import Exercise, Statistics, StatisticsReviewEvent, UserSettings
from app.db.session import SessionLocal


def test_settings_response_includes_spaced_repetition_mode(client):
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter_by(name="User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.SR_mode = True
        db.commit()
    finally:
        db.close()

    response = client.get("/api/v1/settings/")

    assert response.status_code == 200
    assert response.json()["SR_mode"] is True


def test_new_display_settings_can_be_saved_and_fetched(client):
    response = client.put(
        "/api/v1/settings/",
        json={
            "show_apt": True,
            "show_source": True,
            "show_tags": True,
            "show_formula": False,
            "show_integral_curves": False,
            "enable_delete": True,
            "SR_mode": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["show_apt"] is True
    assert response.json()["show_source"] is True
    assert response.json()["show_tags"] is True
    assert response.json()["show_formula"] is False
    assert response.json()["show_integral_curves"] is False
    assert response.json()["enable_delete"] is True
    assert response.json()["SR_mode"] is True

    fetched = client.get("/api/v1/settings/")
    assert fetched.status_code == 200
    assert fetched.json()["show_apt"] is True
    assert fetched.json()["show_source"] is True
    assert fetched.json()["show_tags"] is True
    assert fetched.json()["show_formula"] is False
    assert fetched.json()["show_integral_curves"] is False
    assert fetched.json()["enable_delete"] is True
    assert fetched.json()["SR_mode"] is True


def test_enabling_sr_mode_reopens_only_overdue_selected_exercises(client):
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter_by(name="User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.SR_mode = False

        overdue = Exercise(
            name="Overdue selected",
            in_SR=1,
            completed=True,
            due_time=datetime.now() - timedelta(days=1),
            h1_svg_path="/overdue-h1.svg",
            h1_axis_start=0,
            h1_axis_end=1,
            c13_svg_path="/overdue-c13.svg",
            c13_axis_start=0,
            c13_axis_end=1,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        overdue_unselected = Exercise(
            name="Overdue unselected",
            in_SR=0,
            completed=True,
            due_time=datetime.now() - timedelta(days=1),
            h1_svg_path="/unselected-h1.svg",
            h1_axis_start=0,
            h1_axis_end=1,
            c13_svg_path="/unselected-c13.svg",
            c13_axis_start=0,
            c13_axis_end=1,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        not_due = Exercise(
            name="Not due",
            in_SR=1,
            completed=True,
            due_time=datetime.now() + timedelta(days=1),
            h1_svg_path="/not-due-h1.svg",
            h1_axis_start=0,
            h1_axis_end=1,
            c13_svg_path="/not-due-c13.svg",
            c13_axis_start=0,
            c13_axis_end=1,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        )
        db.add_all([overdue, overdue_unselected, not_due])
        db.flush()

        completed_at = datetime.now() - timedelta(days=2)
        db.add_all(
            [
                Statistics(exercise_id=str(overdue.id), completed_at=completed_at),
                Statistics(
                    exercise_id=str(overdue_unselected.id),
                    completed_at=completed_at,
                ),
                Statistics(exercise_id=str(not_due.id), completed_at=completed_at),
            ]
        )
        db.commit()
        exercise_ids = (overdue.id, overdue_unselected.id, not_due.id)
    finally:
        db.close()

    response = client.put("/api/v1/settings/", json={"SR_mode": True})

    assert response.status_code == 200
    db = SessionLocal()
    try:
        reopened = db.query(Exercise).filter_by(id=exercise_ids[0]).one()
        unselected = db.query(Exercise).filter_by(id=exercise_ids[1]).one()
        not_due_exercise = db.query(Exercise).filter_by(id=exercise_ids[2]).one()
        reopened_statistics = db.query(Statistics).filter_by(
            exercise_id=str(exercise_ids[0])
        ).one()
        assert reopened.completed is False
        assert reopened_statistics.completed_at is None
        assert unselected.completed is True
        assert not_due_exercise.completed is True
        assert (
            db.query(StatisticsReviewEvent)
            .filter_by(
                exercise_id=str(exercise_ids[0]),
                reviewed_at=completed_at,
                is_baseline=True,
            )
            .count()
            == 1
        )
    finally:
        db.close()
