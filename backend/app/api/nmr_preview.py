from __future__ import annotations

from datetime import datetime
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
    title: str
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
    phase_source: str = "automatic"
    baseline_corrected: bool = False
    ppm_min: float
    ppm_max: float
    solvent: str
    acquisition_date: str
    temperature: str
    scans: int | None = None
    pulseprogram: str
    receiver_gain: str
    acquisition_time: str
    pulse_width: str
    relaxation_delay: str
    pulse_program_steps: list[dict[str, str | float]]
    pulse_program_source: str
    phase_cycles: dict[str, list[int]]
    pulse_program_loop: str
    decoupling_program: str
    decoupling_during_acquisition: bool = False
    acquisition_channel: str = "f1"


class NmrProcessingIn(BaseModel):
    zero_fill: int = Field(default=32768, ge=32768, le=524288)
    window: str = Field(default="none", pattern="^(none|em|gm)$")
    lb: float = Field(default=0.0, ge=-100.0, le=100.0)
    g1: float = Field(default=0.0, ge=-100.0, le=100.0)
    g2: float = Field(default=0.0, ge=-100.0, le=100.0)
    g3: float = Field(default=0.0, ge=-10.0, le=10.0)
    p0: float = Field(default=0.0, ge=-360.0, le=360.0)
    p1: float = Field(default=0.0, ge=-720.0, le=720.0)
    baseline: bool = False
    ppm_min: float | None = None
    ppm_max: float | None = None
    max_points: int = Field(default=32768, ge=200, le=32768)


class NmrUploadOut(BaseModel):
    dataset: str
    file_count: int
    nucleus: str | None = None
    recommended_lb: float | None = None


def _active_dataset_path() -> Path:
    if (TEMP_DATASET_DIR / "fid").is_file() and (TEMP_DATASET_DIR / "acqus").is_file():
        return TEMP_DATASET_DIR
    raise HTTPException(status_code=404, detail="No dataset available. Upload a Bruker folder first.")


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


def _processed_axis(procs: dict, size: int):
    import numpy as np

    required = ("OFFSET", "SW_p", "SF")
    if not all(key in procs for key in required):
        return None
    spectral_width_ppm = float(procs["SW_p"]) / float(procs["SF"])
    return float(procs["OFFSET"]) - np.arange(size) * spectral_width_ppm / size


def _acquisition_axis(metadata: dict, size: int):
    import numpy as np

    acqus = metadata.get("acqus", {})
    sf = float(acqus.get("SFO1") or 1.0)
    center = float(acqus.get("O1") or 0.0) / sf
    width = float(acqus.get("SW_h") or 0.0) / sf
    if not width:
        return None
    return center + width / 2.0 - np.arange(size) * width / size


def _dataset_title(dataset_path: Path, metadata: dict) -> str:
    title_path = dataset_path / "pdata" / "1" / "title"
    if title_path.is_file():
        title = title_path.read_text(errors="replace").strip().replace("\n", " ")
        if title:
            return title
    acqus = metadata.get("acqus", {})
    return str(acqus.get("SAMPLEID") or acqus.get("SOLVENT") or dataset_path.name)


def _acquisition_metadata(metadata: dict) -> dict[str, str | int | None]:
    acqus = metadata.get("acqus", {})
    date_value = acqus.get("DATE_START", acqus.get("DATE"))
    try:
        acquisition_date = datetime.fromtimestamp(float(date_value)).astimezone().isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError, OverflowError):
        acquisition_date = "Unknown"
    temperature = acqus.get("TE_MAGNET") or acqus.get("shimCoilTempK")
    if temperature is None:
        temperature_text = "Unknown"
    else:
        temperature_text = f"{float(temperature):.2f} K"
    spectral_width = acqus.get("SW_h")
    points = acqus.get("TD")
    try:
        acquisition_time = float(acqus.get("AQ") or (float(points) / (2.0 * float(spectral_width))))
        acquisition_time_text = f"{acquisition_time:.4g} s"
    except (TypeError, ValueError, ZeroDivisionError):
        acquisition_time_text = "Unknown"
    pulse_values = acqus.get("P") or []
    pulse_width = acqus.get("PW")
    if pulse_width in (None, 0) and len(pulse_values) > 1:
        pulse_width = pulse_values[1] * 1e-6
    try:
        pulse_width_text = f"{float(pulse_width) * 1e6:.4g} us"
    except (TypeError, ValueError):
        pulse_width_text = "Unknown"
    relaxation = acqus.get("D1")
    if relaxation is None:
        delay_values = acqus.get("D") or []
        # Bruker stores D1 as the second element of the JCAMP D array (D[1]).
        relaxation = delay_values[1] if len(delay_values) > 1 else (delay_values[0] if delay_values else None)
    try:
        relaxation_text = f"{float(relaxation):.4g} s"
    except (TypeError, ValueError):
        relaxation_text = "Unknown"
    receiver_gain = acqus.get("RG")
    try:
        receiver_gain_text = f"{float(receiver_gain):.4g}"
    except (TypeError, ValueError):
        receiver_gain_text = "Unknown"
    return {
        "solvent": str(acqus.get("SOLVENT") or "Unknown"),
        "acquisition_date": acquisition_date,
        "temperature": temperature_text,
        "scans": int(acqus["NS"]) if acqus.get("NS") is not None else None,
        "pulseprogram": str(acqus.get("PULPROG") or "Unknown").lower(),
        "receiver_gain": receiver_gain_text,
        "acquisition_time": acquisition_time_text,
        "pulse_width": pulse_width_text,
        "relaxation_delay": relaxation_text,
    }


def _pulse_program_steps(dataset_path: Path, metadata: dict) -> list[dict[str, str | float]]:
    pulse_path = dataset_path / "pulseprogram"
    if not pulse_path.is_file():
        pulse_path = dataset_path / "pulseprogram.precomp"
    if not pulse_path.is_file():
        return []
    acqus = metadata.get("acqus", {})
    delays = acqus.get("D") or []
    pulses = acqus.get("P") or []
    constants = acqus.get("CNST") or []
    spectral_width = float(acqus.get("SW_h") or 1.0)
    values = {
        "d1": float(delays[1]) if len(delays) > 1 else 0.0,
        "d11": float(delays[11]) if len(delays) > 11 else 0.03,
        # Bruker constant names are one-based: cnst2 -> CNST[2], cnst11 -> CNST[11].
        "d20": 1.0 / (float(constants[2]) * float(constants[11])) if len(constants) > 11 and constants[2] and constants[11] else 0.0,
        "p0": float(pulses[0]) * 1e-6 if pulses else 0.0,
        "p1": float(pulses[1]) * 1e-6 if len(pulses) > 1 else 0.0,
        "p2": float(pulses[2]) * 1e-6 if len(pulses) > 2 else 0.0,
    }
    values["delta"] = values["p1"] * 4.0 / 3.141592653589793
    steps: list[dict[str, str | float]] = []
    f2_level = 0.0
    f2_power = 0.0
    import re
    pulse_text = pulse_path.read_text(errors="replace")
    if re.search(r"delta\s*=\s*d1\s*-\s*100m", pulse_text, re.IGNORECASE):
        values["delta"] = max(values["d1"] - 0.1, 0.0)

    def duration_from_token(token: str) -> float:
        token = token.strip().lower().rstrip(",")
        if token in values:
            return values[token]
        match = re.fullmatch(r"(\d+(?:\.\d+)?)([mun])", token)
        if not match:
            return 0.0
        scale = {"m": 1e-3, "u": 1e-6, "n": 1e-9}[match.group(2)]
        return float(match.group(1)) * scale

    for raw_line in pulse_text.splitlines():
        line = raw_line.strip().lower().replace('"', "")
        if not line or line.startswith((";", "#", "$", "define", "1 ze", "exit")):
            continue
        tokens = line.split()
        first_token = tokens[0]
        duration = duration_from_token(first_token)
        if duration <= 0 and first_token.startswith("go"):
            duration = max(1.0 / spectral_width, 1e-6)
        if duration <= 0:
            continue

        label = first_token
        channel = "sequence"
        f1_level = 0.0
        step_f2_level = f2_level
        if first_token == "d1":
            label = "DELTA (relaxation)"
        elif first_token == "d11":
            label = "d11 (reset)"
        elif first_token == "delta":
            label = "DELTA (relaxation)"
        elif first_token in {"p0", "p1", "p2"}:
            label = f"flip-angle pulse ({first_token})" if first_token == "p0" else f"{first_token} pulse"
            channel, f1_level = "f1", 1.0
        elif first_token.startswith("go"):
            label, channel = "acquisition (go=2)", "acquisition"
        elif first_token in {"10u", "4u", "100m"}:
            label = first_token
        else:
            continue

        if "pl13:f2" in line:
            f2_power = 0.4
        elif "pl12:f2" in line:
            f2_power = 1.0
        elif "do:f2" in line:
            f2_level = 0.0
        elif "cpd2:f2" in line:
            f2_level = f2_power or 1.0
        step_f2_level = f2_level

        steps.append({
            "label": label,
            "channel": channel,
            "duration_us": max(duration * 1e6, 0.1),
            "f1_level": f1_level,
            "f2_level": f2_level,
        })
        if len(steps) >= 24:
            break
    return steps


def _pulse_program_details(dataset_path: Path, metadata: dict) -> dict:
    pulse_path = dataset_path / "pulseprogram"
    if not pulse_path.is_file():
        pulse_path = dataset_path / "pulseprogram.precomp"
    if not pulse_path.is_file():
        return {"pulse_program_source": "Unavailable", "phase_cycles": {}, "pulse_program_loop": "Unavailable", "decoupling_program": "Unknown", "decoupling_during_acquisition": False}
    text = pulse_path.read_text(errors="replace")
    acqus = metadata.get("acqus", {})
    phase_cycles: dict[str, list[int]] = {}
    import re

    for match in re.finditer(r"^\s*(ph\w+)\s*=\s*([0-9\s]+)$", text, re.MULTILINE | re.IGNORECASE):
        phase_cycles[match.group(1).lower()] = [int(value) for value in match.group(2).split()]
    loop_match = re.search(r"lo\s+to\s+\w+\s+times\s+(\w+)", text, re.IGNORECASE)
    scans = acqus.get("NS")
    scan_text = f"; entire pulse program repeated {int(scans)} scans" if scans is not None else ""
    if loop_match:
        loop_text = f"/ {loop_match.group(1)} loop{scan_text}"
    elif scans is not None:
        loop_text = f"entire pulse program repeated {int(scans)} scans"
    else:
        loop_text = "No explicit loop detected"
    decoupling = acqus.get("CPDPRG2") or acqus.get("CPDPRG") or "Unknown"
    if isinstance(decoupling, list):
        decoupling = next((str(value) for value in decoupling if value), "Unknown")
    pulse_name = str(acqus.get("PULPROG") or "").lower()
    if "zg0gd" in pulse_name or "zg0pg" in pulse_name or "jmod" in pulse_name or "zgpg" in pulse_name:
        decoupling_during_acquisition = True
    else:
        acquisition_index = text.lower().find("go=")
        start_index = text.lower().find("cpd2")
        pre_acquisition_text = text.lower()[max(start_index, 0):max(acquisition_index, 0)]
        decoupling_stopped_before_acquisition = "do:f2" in pre_acquisition_text
        decoupling_during_acquisition = start_index >= 0 and acquisition_index >= start_index and not decoupling_stopped_before_acquisition
    return {
        "pulse_program_source": pulse_path.name,
        "phase_cycles": phase_cycles,
        "pulse_program_loop": loop_text,
        "decoupling_program": str(decoupling),
        "decoupling_during_acquisition": decoupling_during_acquisition,
    }


def _automatic_phase(data, proc_base):
    import numpy as np
    from scipy.optimize import minimize
    from scipy.signal import find_peaks

    spectrum = np.asarray(data).reshape(-1)
    magnitude = np.abs(spectrum)
    peak_indexes, _ = find_peaks(magnitude, distance=20, prominence=magnitude.max() * 0.002)
    if peak_indexes.size == 0:
        peak_indexes = np.array([int(np.argmax(magnitude))])
    peak_indexes = peak_indexes[np.argsort(magnitude[peak_indexes])[-30:]]
    windows = [np.arange(max(0, index - 4), min(spectrum.size, index + 5)) for index in peak_indexes]
    indexes = np.unique(np.concatenate(windows))

    def score(phases):
        phased = proc_base.ps(spectrum, p0=float(phases[0]), p1=float(phases[1]))
        signal = np.abs(phased[indexes]) ** 2
        return float(np.sum(np.imag(phased[indexes]) ** 2) / (np.sum(signal) or 1.0))

    candidates = []
    for initial in ((0.0, 0.0), (90.0, 0.0), (-90.0, 0.0), (0.0, 180.0)):
        result = minimize(score, initial, method="Powell", bounds=((-180, 180), (-720, 720)))
        candidates.append(result)
    best = min(candidates, key=lambda result: result.fun)
    phases = (
        float(((best.x[0] + 180.0) % 360.0) - 180.0),
        float(((best.x[1] + 180.0) % 360.0) - 180.0),
    )
    return proc_base.ps(spectrum, p0=phases[0], p1=phases[1]), phases


def _phase_spectrum(spectrum, nucleus: str, proc_base, proc_autophase):
    if nucleus.upper().startswith("1H"):
        phased, phases = proc_autophase.autops(
            spectrum,
            "peak_minima",
            return_phases=True,
            peak_width=100,
            disp=False,
        )
        return phased, (float(phases[0]), float(phases[1])), "automatic peak-minima"
    phased, phases = _automatic_phase(spectrum, proc_base)
    return phased, phases, "automatic multi-peak"


def _phase_quality(spectrum, proc_base, phases) -> float:
    import numpy as np
    from scipy.signal import find_peaks

    magnitude = np.abs(spectrum)
    peaks, _ = find_peaks(magnitude, distance=20, prominence=magnitude.max() * 0.002)
    if peaks.size == 0:
        peaks = np.array([int(np.argmax(magnitude))])
    peaks = peaks[np.argsort(magnitude[peaks])[-30:]]
    phased = proc_base.ps(spectrum, p0=phases[0], p1=phases[1])
    return float(np.sum(np.imag(phased[peaks]) ** 2) / (np.sum(np.abs(phased[peaks]) ** 2) or 1.0))


def _sample(values, maximum: int) -> list[float]:
    import numpy as np

    array = np.asarray(values, dtype=float).reshape(-1)
    if array.size <= maximum:
        return array.tolist()
    indexes = np.linspace(0, array.size - 1, maximum, dtype=int)
    return array[indexes].tolist()


def _envelope_indexes(values, maximum: int):
    import numpy as np

    values = np.asarray(values)
    size = values.size
    if size <= maximum:
        return np.arange(size, dtype=int)
    bucket_count = max(1, maximum // 2)
    indexes = []
    for start, end in zip(
        np.linspace(0, size, bucket_count, endpoint=False, dtype=int),
        np.linspace(0, size, bucket_count + 1, endpoint=True, dtype=int)[1:],
    ):
        bucket = values[start:end]
        indexes.extend((start + int(np.argmin(bucket)), start + int(np.argmax(bucket))))
    return np.unique(indexes)


def _process_nmr(processing: NmrProcessingIn) -> NmrPreviewOut:
    try:
        import nmrglue as ng
        from nmrglue.process import proc_autophase, proc_bl
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
        # zf_size only pads; it cannot truncate an acquisition when a user asks
        # for fewer points than the corrected FID already contains.
        transform_size = max(processing.zero_fill, int(corrected_fid.size))
        corrected_fid = ng.proc_base.zf_size(corrected_fid, transform_size)
        nucleus = str(metadata["acqus"]["NUC1"]).strip("<>")
        spectrum = ng.proc_base.fft(corrected_fid)
        procs = ng.bruker.read_procs_file(str(dataset_path / "pdata" / "1")).get("procs", {})
        stored_phases = (-float(procs.get("PHC0", 0.0)), -float(procs.get("PHC1", 0.0))) if procs else (0.0, 0.0)
        if procs and (abs(stored_phases[0]) > 1e-9 or abs(stored_phases[1]) > 1e-9):
            spectrum = ng.proc_base.ps(spectrum, p0=stored_phases[0], p1=stored_phases[1])
            automatic_phases = stored_phases
            phase_source = "Bruker procs"
        else:
            spectrum, automatic_phases, phase_source = _phase_spectrum(
                spectrum, nucleus, ng.proc_base, proc_autophase
            )
        automatic_p0, automatic_p1 = automatic_phases
        spectrum = ng.proc_base.ps(spectrum, p0=processing.p0, p1=processing.p1)
        if processing.baseline:
            real = proc_bl.baseline_corrector(np.real(spectrum), wd=max(20, spectrum.size // 1000))
            spectrum = real + 1j * np.imag(spectrum)
        default_ppm_max, default_ppm_min = (230.0, -10.0) if nucleus.upper().startswith("13C") else (16.0, -1.0)
        ppm = _processed_axis(procs, spectrum.size) if procs else None
        acquisition_ppm = _acquisition_axis(metadata, spectrum.size)
        if processing.ppm_min is None and processing.ppm_max is None and acquisition_ppm is not None:
            if ppm is None or ppm.min() > default_ppm_min or ppm.max() < default_ppm_max:
                ppm = acquisition_ppm
        if ppm is None:
            universal_dictionary = ng.bruker.guess_udic(metadata, spectrum)
            unit_conversion = ng.fileiobase.uc_from_udic(universal_dictionary, dim=0)
            ppm = unit_conversion.ppm_scale()
        if ppm[0] < ppm[-1]:
            ppm = ppm[::-1]
        # Keep the displayed trace aligned with the high-to-low ppm axis.
        spectrum = spectrum[::-1]
        dwell_time_us = float(1_000_000 / spectral_width_hz)
        frequency_mhz = float(metadata["acqus"]["SFO1"])
        ppm_max = processing.ppm_max if processing.ppm_max is not None else default_ppm_max
        ppm_min = processing.ppm_min if processing.ppm_min is not None else default_ppm_min
        spectrum_mask = (ppm <= ppm_max) & (ppm >= ppm_min)
        if np.any(spectrum_mask):
            ppm = ppm[spectrum_mask]
            spectrum = spectrum[spectrum_mask]
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Could not read Bruker dataset: {error}") from error

    sampled_indexes = np.linspace(0, fid.size - 1, min(fid.size, processing.max_points), dtype=int)
    spectrum_indexes = _envelope_indexes(np.real(spectrum), processing.max_points)
    acquisition_metadata = _acquisition_metadata(metadata)
    acquisition_channel = "f2" if nucleus.upper().startswith("1H") else "f1"
    return NmrPreviewOut(
        dataset=str(dataset_path),
        title=_dataset_title(dataset_path, metadata),
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
        phase_source=phase_source,
        baseline_corrected=processing.baseline,
        ppm_min=float(ppm_min),
        ppm_max=float(ppm_max),
        **acquisition_metadata,
        pulse_program_steps=_pulse_program_steps(dataset_path, metadata),
        **_pulse_program_details(dataset_path, metadata),
        acquisition_channel=acquisition_channel,
    )


@router.post("/upload", response_model=NmrUploadOut)
async def upload_nmr_dataset(files: list[UploadFile] = File(...)) -> NmrUploadOut:
    if not files:
        raise HTTPException(status_code=400, detail="Drop a Bruker folder containing files.")

    temporary_parent = Path(tempfile.mkdtemp(prefix="nmr_upload_", dir=data_dir))
    try:
        import nmrglue as ng

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
        metadata, _ = ng.fileio.bruker.read(str(old_dataset))
        procs = ng.bruker.read_procs_file(str(old_dataset / "pdata" / "1")).get("procs", {})
        return NmrUploadOut(
            dataset=str(old_dataset),
            file_count=file_count,
            nucleus=str(metadata["acqus"].get("NUC1", "")).strip("<>") or None,
            recommended_lb=float(procs["LB"]) if "LB" in procs else None,
        )
    except HTTPException:
        shutil.rmtree(temporary_parent, ignore_errors=True)
        raise
    except Exception as error:
        shutil.rmtree(temporary_parent, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Could not store Bruker folder: {error}") from error


@router.get("/", response_model=NmrPreviewOut)
def get_nmr_preview(max_points: int = Query(32768, ge=200, le=32768)) -> NmrPreviewOut:
    return _process_nmr(NmrProcessingIn(max_points=max_points))


@router.post("/", response_model=NmrPreviewOut)
def process_nmr_preview(processing: NmrProcessingIn) -> NmrPreviewOut:
    return _process_nmr(processing)
