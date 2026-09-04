from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.models import UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/settings", tags=["settings"])


class UserSettingsResponse(BaseModel):
    link_inherit_mode: str

    model_config = {"from_attributes": True}


class UpdateUserSettingsRequest(BaseModel):
    link_inherit_mode: str


def get_or_create_settings() -> UserSettings:
    with get_db() as db:
        settings = db.query(UserSettings).first()

        if settings is None:
            settings = UserSettings(link_inherit_mode="none")
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return settings


@router.get("/", response_model=UserSettingsResponse)
def get_settings() -> UserSettingsResponse:
    settings = get_or_create_settings()
    return UserSettingsResponse.model_validate(settings)


@router.put("/", response_model=UserSettingsResponse)
def update_settings(payload: UpdateUserSettingsRequest) -> UserSettingsResponse:
    allowed = {"none", "transfer", "copy"}

    if payload.link_inherit_mode not in allowed:
        raise HTTPException(status_code=400, detail="Invalid link inherit mode")

    with get_db() as db:
        settings = db.query(UserSettings).first()

        if settings is None:
            settings = UserSettings(link_inherit_mode=payload.link_inherit_mode)
            db.add(settings)
        else:
            settings.link_inherit_mode = payload.link_inherit_mode

        db.commit()
        db.refresh(settings)

        return UserSettingsResponse.model_validate(settings)
