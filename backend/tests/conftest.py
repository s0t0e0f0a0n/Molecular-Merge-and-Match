import pytest
from fastapi.testclient import TestClient

from app.db.models import (
    Exercise,
    ExerciseAdditionalSpectrum,
    ExerciseC13Peak,
    ExerciseH1Peak,
    Fragment,
    LogbookState,
    PredefinedFragment,
    Statistics,
    WorkingSolution,
)
from app.db.session import SessionLocal, init_db
from app.main import app


@pytest.fixture(autouse=True)
def _ensure_tables_and_clean():
    """Ensure tables exist and clear test data before each test."""
    init_db()
    db = SessionLocal()
    try:
        db.query(ExerciseAdditionalSpectrum).delete()
        db.query(ExerciseH1Peak).delete()
        db.query(ExerciseC13Peak).delete()
        db.query(Exercise).delete()
        db.query(Fragment).delete()
        db.query(WorkingSolution).delete()
        db.query(LogbookState).delete()
        db.query(PredefinedFragment).delete()
        db.query(Statistics).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
