from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.api.router import api_router
from app.core.config import settings
from app.db.session import init_db


class RequireRequestedWithMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        api_prefix = settings.api_v1_prefix
        is_api_request = request.url.path == api_prefix or request.url.path.startswith(
            f"{api_prefix}/"
        )
        if (
            is_api_request
            and request.method != "GET"
            and request.headers.get("X-Requested-With") != "MMM"
        ):
            return JSONResponse(
                status_code=403,
                content={"detail": "Missing or invalid X-Requested-With header"},
            )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish the DB foundation (creates SQLite file + tables in dev).
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(RequireRequestedWithMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"] ,
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    Path("data/uploads").mkdir(parents=True, exist_ok=True)
    Path("data/examples").mkdir(parents=True, exist_ok=True)
    Path("data/references").mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")
    app.mount("/examples", StaticFiles(directory="data/examples"), name="examples")
    app.mount("/references", StaticFiles(directory="data/references"), name="references")

    return app


app = create_app()
