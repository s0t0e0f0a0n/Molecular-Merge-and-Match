from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["info"])


@router.get("/info")
def info() -> dict:
    return {
        "name": settings.app_name,
        "api_prefix": settings.api_v1_prefix,
        "status": "development",
    }
