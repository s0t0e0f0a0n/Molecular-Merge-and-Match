import json
from datetime import datetime, timedelta

from app.api.statistics import mark_exercise_completed, mark_exercise_paused, mark_exercise_resumed
from app.db.models import Exercise, LogbookState, Statistics, UserSettings
from app.db.session import SessionLocal


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
