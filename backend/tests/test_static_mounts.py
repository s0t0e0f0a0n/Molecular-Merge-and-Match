from pathlib import Path

from starlette.routing import Mount

from app.core.config import settings
from app.main import create_app


def test_static_directories_follow_the_configured_database_directory(tmp_path, monkeypatch):
    database_path = tmp_path / "custom-data" / "app.db"
    monkeypatch.setattr(settings, "sqlite_path", str(database_path))

    app = create_app()
    mounts = {
        route.name: route
        for route in app.routes
        if isinstance(route, Mount)
    }

    for name in ("uploads", "examples", "references"):
        expected_directory = database_path.parent / name
        assert Path(mounts[name].app.directory) == expected_directory
        assert expected_directory.is_dir()
