# Backend

FastAPI backend for Molecular Bookkeeping. Manages exercises, fragments, working solutions, and uploaded spectrum files.

## Run

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The SQLite database (`data/app.db`) and uploaded files (`data/uploads/`) are created automatically on first run. Neither is tracked in git.

Swagger docs: http://localhost:8000/docs

## Uploaded files

Spectrum SVGs and additional spectra are stored under `data/uploads/` and served at `/uploads/` as static files. The API returns URL paths (e.g. `/uploads/exercises/h1/abc.svg`), never filesystem paths.

| Subfolder | Contents |
|-----------|----------|
| `data/uploads/exercises/h1/` | 1H-NMR SVGs |
| `data/uploads/exercises/c13/` | 13C-NMR SVGs |
| `data/uploads/exercises/additional/` | Additional spectra (IR, MS, …) |

## One-off scripts

**`import_ir_spectra.py`** — matches exercises in the DB to their CSV problem numbers via formula + ppm-overlap scoring, then copies `{N}_IR.svg` files into `data/uploads/exercises/additional/` and registers them in `exercise_additional_spectra`. Run once after placing the Base Set SVGs in `data/uploads/`.

```bash
python import_ir_spectra.py
```

## Tests & linting

```bash
# activate venv first
ruff check .        # linter
python -m pytest    # test suite
```
