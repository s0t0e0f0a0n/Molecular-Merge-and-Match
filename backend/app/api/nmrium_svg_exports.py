from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/nmrium-svg-exports", tags=["nmrium-svg-exports"])
SVG_TEMP_ROOT = Path(__file__).resolve().parents[2] / "data" / "NMRiumtemp"
_EVENT_ATTRIBUTE_RE = re.compile(r"^on", re.IGNORECASE)


class TemporarySpectrumSvg(BaseModel):
    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    nucleus: str = Field(min_length=1, max_length=64)
    svg_text: str = Field(min_length=1, max_length=5_000_000)

    @field_validator("svg_text")
    @classmethod
    def validate_svg(cls, value: str) -> str:
        try:
            root = ET.fromstring(value)
        except ET.ParseError as exc:
            raise ValueError("SVG content is not valid XML.") from exc

        if root.tag != "svg" and not root.tag.endswith("}svg"):
            raise ValueError("SVG content must have an svg root element.")

        for element in root.iter():
            if element.tag.rsplit("}", 1)[-1].lower() in {"script", "foreignobject"}:
                raise ValueError("SVG content contains a disallowed element.")
            if any(_EVENT_ATTRIBUTE_RE.match(name) for name in element.attrib):
                raise ValueError("SVG content contains a disallowed event attribute.")
            for name, attribute_value in element.attrib.items():
                if name.rsplit("}", 1)[-1].lower() == "href" and not attribute_value.startswith("#"):
                    raise ValueError("SVG content contains an external reference.")
        return value


class TemporarySpectrumSvgBatch(BaseModel):
    draft_id: UUID
    spectra: list[TemporarySpectrumSvg] = Field(min_length=1, max_length=100)


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
