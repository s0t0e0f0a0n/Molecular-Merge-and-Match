from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.config import data_dir
from app.core.svg_sanitize import sanitize_svg

router = APIRouter(prefix="/nmrium-svg-exports", tags=["nmrium-svg-exports"])
SVG_TEMP_ROOT = data_dir / "NMRiumtemp"


class TemporarySpectrumSvg(BaseModel):
    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    nucleus: str = Field(min_length=1, max_length=64)
    svg_text: str = Field(min_length=1, max_length=5_000_000)

    @field_validator("svg_text")
    @classmethod
    def validate_svg(cls, value: str) -> str:
        return sanitize_svg(value)


class TemporarySpectrumSvgBatch(BaseModel):
    draft_id: UUID
    spectra: list[TemporarySpectrumSvg] = Field(min_length=1, max_length=20)


class TemporarySpectrumSvgOut(BaseModel):
    id: str
    name: str
    nucleus: str
    file_name: str
    url: str


@router.post("/temp", response_model=list[TemporarySpectrumSvgOut])
def store_temporary_spectrum_svgs(
    body: TemporarySpectrumSvgBatch,
) -> list[TemporarySpectrumSvgOut]:
    SVG_TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    saved: list[TemporarySpectrumSvgOut] = []
    try:
        for index, spectrum in enumerate(body.spectra, start=1):
            file_name = f"{body.draft_id}_{index:03d}.svg"
            target = SVG_TEMP_ROOT / file_name
            temporary = target.with_suffix(".svg.tmp")
            temporary.write_text(spectrum.svg_text, encoding="utf-8")
            temporary.replace(target)
            saved.append(
                TemporarySpectrumSvgOut(
                    id=spectrum.id,
                    name=spectrum.name,
                    nucleus=spectrum.nucleus,
                    file_name=file_name,
                    url=f"/nmrium-temp/{file_name}",
                )
            )
        keep = {item.file_name for item in saved}
        for previous_file in SVG_TEMP_ROOT.glob(f"{body.draft_id}_*.svg"):
            if previous_file.name not in keep:
                previous_file.unlink(missing_ok=True)
    except OSError as exc:
        for file in SVG_TEMP_ROOT.glob(f"{body.draft_id}_*.svg.tmp"):
            file.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to store the temporary NMRium SVG exports.",
        ) from exc
    return saved
