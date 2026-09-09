from __future__ import annotations

from pathlib import Path, PurePosixPath
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app.core.config import data_dir

router = APIRouter(prefix="/nmr-preview", tags=["nmr-preview"])
TEMP_DATASET_DIR = data_dir / "nmr_temp"


class NmrPreviewOut(BaseModel):
    dataset: str
    nucleus: str
    spectrometer_frequency_mhz: float | None = None
    points: int
    sampled_points: int
    dwell_time_us: float | None = None
    time_us: list[float]
    fid_real: list[float]
    fid_imaginary: list[float]
    spectrum_ppm: list[float]
    spectrum_real: list[float]
    spectrum_imaginary: list[float]
    automatic_p0: float = 0.0
    automatic_p1: float = 0.0


class NmrProcessingIn(BaseModel):
    zero_fill: int = Field(default=32768, ge=32768, le=524288)
    window: str = Field(default="none", pattern="^(none|em|gm)$")
    lb: float = Field(default=0.0, ge=-100.0, le=100.0)
    g1: float = Field(default=0.0, ge=-100.0, le=100.0)
    g2: float = Field(default=0.0, ge=-100.0, le=100.0)
    g3: float = Field(default=0.0, ge=-10.0, le=10.0)
    max_points: int = Field(default=2400, ge=200, le=8000)


class NmrUploadOut(BaseModel):
    dataset: str
    file_count: int


def _active_dataset_path() -> Path:
    if (TEMP_DATASET_DIR / "fid").is_file() and (TEMP_DATASET_DIR / "acqus").is_file():
        return TEMP_DATASET_DIR
    return Path(__file__).resolve().parents[1] / "core" / "27"


def _safe_upload_path(filename: str) -> Path:
    normalized = filename.replace("\\", "/")
    relative_path = PurePosixPath(normalized)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise HTTPException(status_code=400, detail="Invalid Bruker folder path.")
    parts = [part for part in relative_path.parts if part not in ("", ".")]
    if not parts:
        raise HTTPException(status_code=400, detail="Uploaded file has no relative path.")
    return Path(*parts)


def _normalize_dataset_root(upload_root: Path) -> None:
    if (upload_root / "fid").is_file() and (upload_root / "acqus").is_file():
        return
    candidates = [path.parent for path in upload_root.rglob("fid") if path.is_file()]
    dataset_root = next((path for path in candidates if (path / "acqus").is_file()), None)
    if dataset_root is None or dataset_root == upload_root:
        return
    for child in dataset_root.iterdir():
        child.replace(upload_root / child.name)
    shutil.rmtree(dataset_root)


def _sample(values, maximum: int) -> list[float]:
    import numpy as np

    array = np.asarray(values, dtype=float).reshape(-1)
    if array.size <= maximum:
        return array.tolist()
    indexes = np.linspace(0, array.size - 1, maximum, dtype=int)
    return array[indexes].tolist()


def _process_nmr(processing: NmrProcessingIn) -> NmrPreviewOut:
    try:
        import nmrglue as ng
        from nmrglue.process import proc_autophase
        import numpy as np
    except ModuleNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail="The backend Python environment does not have nmrglue installed.",
        ) from error

    dataset_path = _active_dataset_path()
    try:
        metadata, fid = ng.fileio.bruker.read(str(dataset_path))
        fid = np.asarray(fid).reshape(-1)
        if fid.size == 0:
            raise ValueError("The Bruker FID contains no points.")

        # Remove the receiver's digital-filter delay before Fourier transformation.
        corrected_fid = ng.bruker.remove_digital_filter(metadata, fid)
        spectral_width_hz = float(metadata["acqus"]["SW_h"])
        if processing.window == "em":
            corrected_fid = ng.proc_base.em(corrected_fid, lb=processing.lb / spectral_width_hz)
        elif processing.window == "gm":
            corrected_fid = ng.proc_base.gm(
                corrected_fid,
                g1=processing.g1 / spectral_width_hz,
                g2=processing.g2 / spectral_width_hz,
                g3=processing.g3,
            )
        corrected_fid = ng.proc_base.zf_size(corrected_fid, processing.zero_fill)
        spectrum = ng.proc_base.fft(corrected_fid)
        spectrum, automatic_phases = proc_autophase.autops(
            spectrum,
            "peak_minima",
            return_phases=True,
            peak_width=100,
            disp=False,
        )
        automatic_p0, automatic_p1 = (float(automatic_phases[0]), float(automatic_phases[1]))
        universal_dictionary = ng.bruker.guess_udic(metadata, spectrum)
        unit_conversion = ng.fileiobase.uc_from_udic(universal_dictionary, dim=0)
        ppm = unit_conversion.ppm_scale()
        if ppm[0] < ppm[-1]:
            ppm = ppm[::-1]
        # Keep the displayed trace aligned with the high-to-low ppm axis.
        spectrum = spectrum[::-1]
        dwell_time_us = float(1_000_000 / spectral_width_hz)
        frequency_mhz = float(metadata["acqus"]["SFO1"])
        nucleus = str(metadata["acqus"]["NUC1"]).strip("<>")
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Could not read Bruker dataset: {error}") from error

    sampled_indexes = np.linspace(0, fid.size - 1, min(fid.size, processing.max_points), dtype=int)
    spectrum_indexes = np.linspace(0, spectrum.size - 1, min(spectrum.size, processing.max_points), dtype=int)
    return NmrPreviewOut(
        dataset=str(dataset_path),
        nucleus=nucleus,
        spectrometer_frequency_mhz=frequency_mhz,
        points=int(fid.size),
        sampled_points=int(sampled_indexes.size),
        dwell_time_us=dwell_time_us,
        time_us=(sampled_indexes * dwell_time_us).tolist(),
        fid_real=np.real(fid[sampled_indexes]).tolist(),
        fid_imaginary=np.imag(fid[sampled_indexes]).tolist(),
        spectrum_ppm=np.asarray(ppm)[spectrum_indexes].tolist(),
        spectrum_real=np.real(spectrum[spectrum_indexes]).tolist(),
        spectrum_imaginary=np.imag(spectrum[spectrum_indexes]).tolist(),
        automatic_p0=automatic_p0,
        automatic_p1=automatic_p1,
    )


@router.post("/upload", response_model=NmrUploadOut)
async def upload_nmr_dataset(files: list[UploadFile] = File(...)) -> NmrUploadOut:
    if not files:
        raise HTTPException(status_code=400, detail="Drop a Bruker folder containing files.")

    temporary_parent = Path(tempfile.mkdtemp(prefix="nmr_upload_", dir=data_dir))
    try:
        file_count = 0
        for upload in files:
            if not upload.filename:
                continue
            relative_path = _safe_upload_path(upload.filename)
            destination = temporary_parent / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as output:
                while chunk := await upload.read(1024 * 1024):
                    output.write(chunk)
            file_count += 1

        _normalize_dataset_root(temporary_parent)
        if not (temporary_parent / "fid").is_file() or not (temporary_parent / "acqus").is_file():
            raise HTTPException(status_code=400, detail="The folder must contain Bruker fid and acqus files.")

        old_dataset = TEMP_DATASET_DIR
        if old_dataset.exists():
            shutil.rmtree(old_dataset)
        temporary_parent.replace(old_dataset)
        return NmrUploadOut(dataset=str(old_dataset), file_count=file_count)
    except HTTPException:
        shutil.rmtree(temporary_parent, ignore_errors=True)
        raise
    except Exception as error:
        shutil.rmtree(temporary_parent, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Could not store Bruker folder: {error}") from error


@router.get("/", response_model=NmrPreviewOut)
def get_nmr_preview(max_points: int = Query(2400, ge=200, le=8000)) -> NmrPreviewOut:
    return _process_nmr(NmrProcessingIn(max_points=max_points))


@router.post("/", response_model=NmrPreviewOut)
def process_nmr_preview(processing: NmrProcessingIn) -> NmrPreviewOut:
    return _process_nmr(processing)
