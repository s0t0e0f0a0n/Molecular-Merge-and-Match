from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish the DB foundation (creates SQLite file + tables in dev).
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"] ,
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    nmrium_temp_dir = Path(__file__).resolve().parents[1] / "data" / "NMRiumtemp"
    nmrium_temp_dir.mkdir(parents=True, exist_ok=True)
    Path("data/uploads").mkdir(parents=True, exist_ok=True)
    Path("data/examples").mkdir(parents=True, exist_ok=True)
    Path("data/references").mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")
    app.mount(
        "/nmrium-temp",
        StaticFiles(directory=str(nmrium_temp_dir)),
        name="nmrium-temp",
    )
    app.mount("/examples", StaticFiles(directory="data/examples"), name="examples")
    app.mount("/references", StaticFiles(directory="data/references"), name="references")

    return app


app = create_app()
