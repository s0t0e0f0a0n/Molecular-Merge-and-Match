from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.models import UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/settings", tags=["settings"])

_DEFAULT_CHEATS = "000000000000"
_ACTIVE_SETTINGS_NAME = "User"
_ALLOWED_LINK_INHERIT_MODES = {"none", "transfer", "copy"}
_ALLOWED_THEMES = {"Light"}


def _normalize_cheats(raw: str | int | None) -> str:
    bits = "" if raw is None else "".join(ch for ch in str(raw).strip() if ch in {"0", "1"})
    if not bits:
        return _DEFAULT_CHEATS
    if len(bits) < len(_DEFAULT_CHEATS):
        return bits.ljust(len(_DEFAULT_CHEATS), "0")
    return bits[: len(_DEFAULT_CHEATS)]


def _serialize_settings(settings: UserSettings) -> dict[str, object]:
    return {
        "link_inherit_mode": settings.link_inherit_mode,
        "theme": getattr(settings, "theme", "Light") or "Light",
        "cheats": _normalize_cheats(settings.cheats),
        "show_CAS": bool(getattr(settings, "show_CAS", getattr(settings, "show_CAS_input", True))),
        "show_timer": bool(getattr(settings, "show_timer", True)),
        "show_warnings": bool(getattr(settings, "show_warnings", True)),
        "show_solvent": bool(getattr(settings, "show_solvent", True)),
        "show_exchange": bool(getattr(settings, "show_exchange", True)),
        "show_missing": bool(getattr(settings, "show_missing", True)),
        "show_creation": bool(getattr(settings, "show_creation", True)),
    }


def _apply_settings_values(target: UserSettings, source: UserSettings) -> None:
    target.link_inherit_mode = source.link_inherit_mode
    target.theme = getattr(source, "theme", "Light") or "Light"
    target.cheats = _normalize_cheats(source.cheats)
    target.show_CAS_input = bool(getattr(source, "show_CAS_input", True))
    target.show_timer = bool(getattr(source, "show_timer", True))
    target.show_warnings = bool(getattr(source, "show_warnings", True))
    target.show_solvent = bool(getattr(source, "show_solvent", True))
    target.show_exchange = bool(getattr(source, "show_exchange", True))
    target.show_missing = bool(getattr(source, "show_missing", True))
    target.show_creation = bool(getattr(source, "show_creation", True))


class UserSettingsResponse(BaseModel):
    link_inherit_mode: str
    theme: str
    cheats: str
    show_CAS: bool
    show_timer: bool
    show_warnings: bool
    show_solvent: bool
    show_exchange: bool
    show_missing: bool
    show_creation: bool
    active_preset: str
    available_presets: list[str]

    model_config = {"from_attributes": True}


class UpdateUserSettingsRequest(BaseModel):
    link_inherit_mode: str | None = None
    theme: str | None = None
    cheats: str | None = None
    show_CAS: bool | None = None
    show_timer: bool | None = None
    show_warnings: bool | None = None
    show_solvent: bool | None = None
    show_exchange: bool | None = None
    show_missing: bool | None = None
    show_creation: bool | None = None


def _build_response(settings: UserSettings, active_preset: str = _ACTIVE_SETTINGS_NAME) -> UserSettingsResponse:
    with get_db() as db:
        preset_names = [
            name
            for (name,) in db.query(UserSettings.name)
            .filter(UserSettings.name.isnot(None))
            .order_by(UserSettings.id.asc())
            .all()
            if name
        ]

    serialized = _serialize_settings(settings)
    if _ACTIVE_SETTINGS_NAME not in preset_names:
        preset_names.append(_ACTIVE_SETTINGS_NAME)

    return UserSettingsResponse(
        link_inherit_mode=str(serialized["link_inherit_mode"]),
        theme=str(serialized["theme"]),
        cheats=str(serialized["cheats"]),
        show_CAS=bool(serialized["show_CAS"]),
        show_timer=bool(serialized["show_timer"]),
        show_warnings=bool(serialized["show_warnings"]),
        show_solvent=bool(serialized["show_solvent"]),
        show_exchange=bool(serialized["show_exchange"]),
        show_missing=bool(serialized["show_missing"]),
        show_creation=bool(serialized["show_creation"]),
        active_preset=active_preset,
        available_presets=preset_names,
    )


def get_or_create_settings() -> UserSettings:
    with get_db() as db:
        settings = db.query(UserSettings).filter(UserSettings.name == _ACTIVE_SETTINGS_NAME).first()

        if settings is None:
            settings = UserSettings(
                name=_ACTIVE_SETTINGS_NAME,
                link_inherit_mode="none",
                theme="Light",
                cheats=_DEFAULT_CHEATS,
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return settings


@router.get("/", response_model=UserSettingsResponse)
def get_settings() -> UserSettingsResponse:
    settings = get_or_create_settings()
    return _build_response(settings, active_preset=_ACTIVE_SETTINGS_NAME)


@router.put("/", response_model=UserSettingsResponse)
def update_settings(payload: UpdateUserSettingsRequest) -> UserSettingsResponse:
    if payload.link_inherit_mode is not None and payload.link_inherit_mode not in _ALLOWED_LINK_INHERIT_MODES:
        raise HTTPException(status_code=400, detail="Invalid link inherit mode")
    if payload.theme is not None and payload.theme not in _ALLOWED_THEMES:
        raise HTTPException(status_code=400, detail="Invalid theme")

    with get_db() as db:
        settings = db.query(UserSettings).filter(UserSettings.name == _ACTIVE_SETTINGS_NAME).first()

        if settings is None:
            settings = UserSettings(
                name=_ACTIVE_SETTINGS_NAME,
                link_inherit_mode=payload.link_inherit_mode or "none",
                theme=payload.theme or "Light",
                cheats=_DEFAULT_CHEATS,
            )
            db.add(settings)

        if payload.link_inherit_mode is not None:
            settings.link_inherit_mode = payload.link_inherit_mode
        if payload.theme is not None:
            settings.theme = payload.theme
        if payload.cheats is not None:
            settings.cheats = _normalize_cheats(payload.cheats)
        if payload.show_CAS is not None:
            settings.show_CAS_input = bool(payload.show_CAS)
        if payload.show_timer is not None:
            settings.show_timer = bool(payload.show_timer)
        if payload.show_warnings is not None:
            settings.show_warnings = bool(payload.show_warnings)
        if payload.show_solvent is not None:
            settings.show_solvent = bool(payload.show_solvent)
        if payload.show_exchange is not None:
            settings.show_exchange = bool(payload.show_exchange)
        if payload.show_missing is not None:
            settings.show_missing = bool(payload.show_missing)
        if payload.show_creation is not None:
            settings.show_creation = bool(payload.show_creation)

        db.commit()
        db.refresh(settings)

        return _build_response(settings, active_preset=_ACTIVE_SETTINGS_NAME)


@router.post("/presets/{preset_name}/apply", response_model=UserSettingsResponse)
def apply_preset(preset_name: str) -> UserSettingsResponse:
    with get_db() as db:
        preset = db.query(UserSettings).filter(UserSettings.name == preset_name).first()
        if preset is None:
            raise HTTPException(status_code=404, detail="Preset not found")

        user_settings = db.query(UserSettings).filter(UserSettings.name == _ACTIVE_SETTINGS_NAME).first()

        if user_settings is None:
            user_settings = UserSettings(name=_ACTIVE_SETTINGS_NAME)
            db.add(user_settings)

        _apply_settings_values(user_settings, preset)

        db.commit()
        db.refresh(user_settings)

        return _build_response(user_settings, active_preset=preset_name)
