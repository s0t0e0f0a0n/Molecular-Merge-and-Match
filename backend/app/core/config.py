import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Look for the path provided by Electron. If not found, fallback to local relative path.
if "APP_DATA_DIR" in os.environ:
    data_dir = Path(os.environ["APP_DATA_DIR"])
else:
    data_dir = Path("./data")

# Ensure the data directory exists so SQLite doesn't crash on startup
data_dir.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """
    Application configuration.
    """

    app_name: str = "Molecular Bookkeeping API"
    api_v1_prefix: str = "/api/v1"

    # Local-first database using SQLite.
    sqlite_path: str = str(data_dir / "app.db").replace("\\", "/")

    # vite defaults to 5173
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @property
    def database_url(self) -> str:
        # SQLAlchemy SQLite URL
        return f"sqlite:///{self.sqlite_path}"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
