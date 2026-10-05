import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from app.api.spacedrep import calculate_spaced_repetition_interval
from app.api.statistics import (
    _record_spaced_repetition_review,
    mark_exercise_completed,
    mark_exercise_paused,
    mark_exercise_resumed,
)
from app.db.models import (
    Exercise,
    LogbookState,
    Statistics,
    StatisticsReviewEvent,
    UserSettings,
)
from app.db.session import (
    SessionLocal,
    _migrate_add_missing_columns,
    _reopen_overdue_exercises_for_sr,
    engine,
)


def _spaced_repetition_test_exercise(
    due_time: datetime | None = None,
) -> Exercise:
    return Exercise(
        name="Spaced repetition test",
        h1_svg_path="/sr-h1.svg",
        h1_axis_start=0,
        h1_axis_end=1,
        c13_svg_path="/sr-c13.svg",
        c13_axis_start=0,
        c13_axis_end=1,
        h1_nmr_text="h1",
        c13_nmr_text="c13",
        due_time=due_time,
    )


def test_spaced_repetition_status_moves_from_new_to_learning():
    db = SessionLocal()
    try:
        statistics = Statistics(exercise_id="sr-learning")
        db.add(statistics)
        db.flush()

        assert statistics.SR_status == "new"
        _record_spaced_repetition_review(
            db,
            statistics,
            _spaced_repetition_test_exercise(),
            is_correct=True,
        )
        assert statistics.SR_status == "learning"
        db.commit()

        event = (
            db.query(StatisticsReviewEvent)
            .filter_by(exercise_id="sr-learning")
            .one()
        )
        assert event.status_at_review == "learning"
        assert event.is_correct is True
        assert event.is_baseline is False
    finally:
        db.close()


def test_incorrect_review_enters_relearning_only_after_difficulty_increments():
    db = SessionLocal()
    try:
        without_difficulty = Statistics(
            exercise_id="sr-new-incorrect", difficulty="E0", SR_status="new"
        )
        with_difficulty = Statistics(
            exercise_id="sr-relearning-incorrect",
            difficulty="M1",
            SR_status="learning",
        )
        db.add_all([without_difficulty, with_difficulty])
        db.flush()

        _record_spaced_repetition_review(
            db,
            without_difficulty,
            _spaced_repetition_test_exercise(),
            is_correct=False,
        )
        _record_spaced_repetition_review(
            db,
            with_difficulty,
            _spaced_repetition_test_exercise(),
            is_correct=False,
        )

        assert without_difficulty.SR_status == "new"
        assert with_difficulty.SR_status == "relearning"
    finally:
        db.rollback()
        db.close()


@pytest.mark.parametrize(
    ("interval_days", "expected_status"),
    [(44, "young"), (45, "mature"), (90, "mature")],
)
def test_correct_review_uses_previous_scheduled_interval(
    interval_days: int, expected_status: str
):
    previous_completed_at = datetime(2026, 1, 1, 10)
    due_time = previous_completed_at + timedelta(days=interval_days)
    db = SessionLocal()
    try:
        statistics = Statistics(
            exercise_id=f"sr-interval-{interval_days}",
            difficulty="D2",
            SR_status="learning",
            completed_at=None,
        )
        db.add(statistics)
        db.flush()
        db.add(
            StatisticsReviewEvent(
                exercise_id=statistics.exercise_id,
                reviewed_at=previous_completed_at,
                status_at_review="learning",
                is_correct=True,
                is_baseline=True,
            )
        )
        db.flush()

        _record_spaced_repetition_review(
            db,
            statistics,
            _spaced_repetition_test_exercise(due_time=due_time),
            is_correct=True,
        )

        assert statistics.SR_status == expected_status
    finally:
        db.rollback()
        db.close()


def test_review_history_groups_daily_status_counts_and_omits_baselines(client):
    review_date = datetime(2026, 10, 4, 9)
    db = SessionLocal()
    try:
        db.add_all(
            [
                StatisticsReviewEvent(
                    exercise_id="review-a",
                    reviewed_at=review_date,
                    status_at_review="learning",
                    is_correct=True,
                ),
                StatisticsReviewEvent(
                    exercise_id="review-b",
                    reviewed_at=review_date.replace(hour=11),
                    status_at_review="relearning",
                    is_correct=False,
                ),
                StatisticsReviewEvent(
                    exercise_id="review-c",
                    reviewed_at=review_date.replace(hour=12),
                    status_at_review="mature",
                    is_correct=True,
                    is_baseline=True,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/v1/statistics/review-history")

    assert response.status_code == 200
    assert response.json() == [
        {
            "date": "2026-10-04",
            "new": 0,
            "learning": 1,
            "relearning": 1,
            "young": 0,
            "mature": 0,
            "total": 2,
        }
    ]


def test_review_event_status_column_migration_preserves_existing_values():
    db = SessionLocal()
    try:
        db.add(
            StatisticsReviewEvent(
                exercise_id="migration-check",
                reviewed_at=datetime(2026, 10, 4, 9),
                status_at_review="relearning",
                is_correct=False,
            )
        )
        db.commit()
    finally:
        db.close()

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE statistics_review_events "
                "RENAME COLUMN status_at_review TO SR_status"
            )
        )

    _migrate_add_missing_columns()

    db = SessionLocal()
    try:
        event = (
            db.query(StatisticsReviewEvent)
            .filter_by(exercise_id="migration-check")
            .one()
        )
        assert event.status_at_review == "relearning"
        columns = {
            row[1]
            for row in db.connection().execute(
                text("PRAGMA table_info(statistics_review_events)")
            )
        }
        assert "status_at_review" in columns
        assert "SR_status" not in columns
    finally:
        db.close()


def test_reopening_overdue_review_preserves_previous_completion_for_interval():
    due_time = datetime.now() - timedelta(days=1)
    previous_completed_at = due_time - timedelta(days=45)
    db = SessionLocal()
    try:
        exercise = _spaced_repetition_test_exercise(due_time=due_time)
        exercise.in_SR = 1
        exercise.completed = True
        db.add(exercise)
        db.flush()
        settings = db.query(UserSettings).filter_by(name="User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.SR_mode = True
        db.add_all(
            [
                Statistics(
                    exercise_id=str(exercise.id),
                    difficulty="E1",
                    SR_status="young",
                    completed_at=previous_completed_at,
                ),
            ]
        )
        db.commit()
        exercise_id = exercise.id
    finally:
        db.close()

    _reopen_overdue_exercises_for_sr()

    db = SessionLocal()
    try:
        statistics = db.query(Statistics).filter_by(exercise_id=str(exercise_id)).one()
        exercise = db.query(Exercise).filter_by(id=exercise_id).one()
        baseline = (
            db.query(StatisticsReviewEvent)
            .filter_by(exercise_id=str(exercise_id), is_baseline=True)
            .one()
        )
        assert statistics.completed_at is None
        assert exercise.completed is False
        assert baseline.reviewed_at == previous_completed_at

        _record_spaced_repetition_review(
            db, statistics, exercise, is_correct=True
        )
        assert statistics.SR_status == "mature"
    finally:
        db.rollback()
        db.close()


def test_completion_stores_active_cheats(client):
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.cheats = "10011110000"
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(42)

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "42").one()
        assert row.cheats_used == "10011110000"
    finally:
        db.close()

    response = client.get("/api/v1/statistics/", params={"exercise_id": "42"})
    assert response.status_code == 200
    assert response.json()["cheats_used"] == "10011110000"


def test_disabling_cheats_records_timestamp_in_statistics(client):
    disabled_at = datetime.now()
    db = SessionLocal()
    try:
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.cheats = "100000000000"
        db.add_all([Statistics(exercise_id="48"), Statistics(exercise_id="49")])
        db.commit()
    finally:
        db.close()

    response = client.put(
        "/api/v1/settings/",
        json={"cheats": "000000000000", "exercise_id": 48},
    )
    assert response.status_code == 200

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "48").one()
        assert row.cheats_off is not None
        assert row.cheats_off >= disabled_at
        other_row = db.query(Statistics).filter(Statistics.exercise_id == "49").one()
        assert other_row.cheats_off is None
    finally:
        db.close()

    response = client.get("/api/v1/statistics/", params={"exercise_id": "48"})
    assert response.status_code == 200
    assert response.json()["cheats_off"] is not None


def test_completion_stores_final_logbook_counts(client):
    entries = [
        {"kind": "create-fragment"},
        {"kind": "create-fragment"},
        {"kind": "link"},
        {"kind": "link"},
        {"kind": "unlink"},
        {"kind": "merge-fragments"},
        {"kind": "delete-fragment"},
    ]
    db = SessionLocal()
    try:
        db.add(LogbookState(exercise_id="exercise-43", entries_json=json.dumps(entries)))
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(43)

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "43").one()
        assert row.fragments_drawn == 1
        assert row.matches_done == 1
        assert row.merges_done == 1
    finally:
        db.close()


def test_completion_saves_mastery_index_and_next_review_time(client):
    db = SessionLocal()
    try:
        db.add(Exercise(
            id=44,
            name="Mastery test exercise",
            h1_svg_path="/mastery-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/mastery-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        ))
        settings = db.query(UserSettings).filter(UserSettings.name == "User").first()
        if settings is None:
            settings = UserSettings(name="User")
            db.add(settings)
        settings.cheats = "000000000000"
        db.add(Statistics(
            exercise_id="44",
            timer_total=120,
            incorrect_count=1,
            difficulty="M2",
            confidence=4,
        ))
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(44)

    db = SessionLocal()
    try:
        row = db.query(Statistics).filter(Statistics.exercise_id == "44").one()
        expected = calculate_spaced_repetition_interval(
            timer_total=120,
            incorrect_count=1,
            cheats_used="000000000000",
            confidence=4,
            difficulty="M2",
            completed_at=row.completed_at,
            cheats_off=row.cheats_off,
        )

        assert row.mastery_index == pytest.approx(expected["mastery_index"])
        exercise = db.query(Exercise).filter(Exercise.id == 44).one()
        assert exercise.due_time == row.completed_at + timedelta(
            days=expected["next_review_days"]
        )
    finally:
        db.close()


def test_completion_reuses_prefixed_statistics_row(client):
    db = SessionLocal()
    try:
        db.add(Exercise(
            id=54,
            name="Prefixed statistics exercise",
            h1_svg_path="/prefixed-h1.svg",
            h1_axis_start=10,
            h1_axis_end=0,
            c13_svg_path="/prefixed-c13.svg",
            c13_axis_start=200,
            c13_axis_end=0,
            h1_nmr_text="h1",
            c13_nmr_text="c13",
        ))
        db.add(Statistics(exercise_id="exercise-54", timer_total=91))
        db.commit()
    finally:
        db.close()

    mark_exercise_completed(54)

    db = SessionLocal()
    try:
        rows = db.query(Statistics).filter(
            Statistics.exercise_id.in_(("54", "exercise-54"))
        ).all()
        assert len(rows) == 1
        assert rows[0].exercise_id == "exercise-54"
        assert rows[0].timer_total == 91
        assert rows[0].completed_at is not None
        assert db.query(Exercise).filter_by(id=54).one().due_time is not None
    finally:
        db.close()


def test_timer_restarts_are_saved_with_the_timer_interval(client):
    mark_exercise_resumed(45)
    mark_exercise_paused(45)

    db = SessionLocal()
    try:
        statistics = db.query(Statistics).filter(Statistics.exercise_id == "45").one()
        logbook = db.query(LogbookState).filter(LogbookState.exercise_id == "exercise-45").one()
        intervals = json.loads(logbook.restarts)
        assert len(intervals) == 1
        assert datetime.fromisoformat(intervals[0]["start"]) == statistics.start_counting
        assert datetime.fromisoformat(intervals[0]["stop"]) == statistics.stop_counting
        assert statistics.pause_total == 1
    finally:
        db.close()


def test_pause_and_switch_each_increment_pause_total(client):
    mark_exercise_resumed(50)
    mark_exercise_paused(50)

    response = client.post("/api/v1/statistics/stop", params={"exercise_id": "50"})
    assert response.status_code == 200

    db = SessionLocal()
    try:
        statistics = db.query(Statistics).filter(Statistics.exercise_id == "50").one()
        assert statistics.pause_total == 2
    finally:
        db.close()


def test_stopping_timer_persists_short_elapsed_segment(client):
    started_at = datetime.now() - timedelta(seconds=4)
    db = SessionLocal()
    try:
        db.add(Statistics(exercise_id="47", start_counting=started_at, timer_total=0))
        db.add(
            LogbookState(
                exercise_id="exercise-47",
                restarts=json.dumps([{"start": started_at.isoformat(), "stop": None}]),
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.post("/api/v1/statistics/stop", params={"exercise_id": "47"})
    assert response.status_code == 200
    assert response.json()["timer_total"] >= 3
    assert response.json()["stop_counting"] is not None

    db = SessionLocal()
    try:
        logbook = db.query(LogbookState).filter(LogbookState.exercise_id == "exercise-47").one()
        intervals = json.loads(logbook.restarts)
        assert intervals[0]["stop"] is not None
    finally:
        db.close()


def test_logbook_entry_checkpoints_short_timer_segment(client):
    started_at = datetime.now() - timedelta(seconds=4)
    db = SessionLocal()
    try:
        db.add(Statistics(exercise_id="46", start_counting=started_at, timer_total=0))
        db.add(
            LogbookState(
                exercise_id="exercise-46",
                entries_json="[]",
                restarts=json.dumps([{"start": started_at.isoformat(), "stop": None}]),
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.put(
        "/api/v1/logbook/",
        params={"exercise_id": "exercise-46"},
        json={
            "entries_json": json.dumps([{"id": "new", "ts": int(datetime.now().timestamp() * 1000), "kind": "link"}]),
            "cursor": 1,
            "links_json": "[]",
        },
    )
    assert response.status_code == 200
    assert response.json()["timer_checkpointed"] is True

    db = SessionLocal()
    try:
        statistics = db.query(Statistics).filter(Statistics.exercise_id == "46").one()
        logbook = db.query(LogbookState).filter(LogbookState.exercise_id == "exercise-46").one()
        intervals = json.loads(logbook.restarts)
        assert statistics.timer_total >= 4
        assert statistics.stop_counting is None
        assert len(intervals) == 2
        assert intervals[0]["stop"] is not None
        assert intervals[1]["start"] == intervals[0]["stop"]
        assert intervals[1]["stop"] is None
    finally:
        db.close()


def test_difficulty_rating_overwrites_letter_and_increments_count(client):
    first = client.post(
        "/api/v1/statistics/difficulty",
        params={"exercise_id": "44"},
        json={"rating": "E"},
    )
    assert first.status_code == 200
    assert first.json()["difficulty"] == "E1"

    second = client.post(
        "/api/v1/statistics/difficulty",
        params={"exercise_id": "44"},
        json={"rating": "D"},
    )
    assert second.status_code == 200
    assert second.json()["difficulty"] == "D1"


def test_reference_exercise_does_not_create_statistics_row(client):
    db = SessionLocal()
    try:
        db.add(
            Exercise(
                exercise_set="References",
                h1_svg_path="/references/h1.svg",
                h1_axis_start=0,
                h1_axis_end=1,
                h1_nmr_text="reference",
                c13_svg_path="/references/c13.svg",
                c13_axis_start=0,
                c13_axis_end=1,
                c13_nmr_text="reference",
                completed=True,
            )
        )
        db.commit()
        exercise_id = db.query(Exercise).order_by(Exercise.id.desc()).first().id
    finally:
        db.close()

    response = client.get("/api/v1/statistics/", params={"exercise_id": str(exercise_id)})
    assert response.status_code == 200
    assert response.json()["completed_at"] is None

    db = SessionLocal()
    try:
        assert db.query(Statistics).filter(Statistics.exercise_id == str(exercise_id)).first() is None
    finally:
        db.close()
