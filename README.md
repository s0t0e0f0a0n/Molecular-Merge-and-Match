# Molecular Merge and Match: Molecular Bookkeeping for Structural Analysis

An interactive NMR-based structure elucidation tool for university-level organic chemistry students. Students select molecular fragments, match them to peaks in 1H-NMR and 13C-NMR spectra, combine fragments into a complete molecule, and validate their answer against a teacher-defined solution.

Built for the Software Engineering course at Leiden University (2026).

## Tech Stack

| Layer        | Technology                                                   |
|--------------|--------------------------------------------------------------|
| Frontend     | React 18, TypeScript, Vite                                   |
| Backend      | Python 3.12, FastAPI, SQLAlchemy                             |
| Database     | SQLite (local, file-based)                                   |
| Chemistry    | Ketcher (molecule drawing), RDKit (analysis & rendering)     |
| Testing      | Vitest + React Testing Library (frontend), Pytest (backend)  |
| Linting      | ESLint v9 + TypeScript-ESLint (frontend), Ruff (backend)     |
| Deployment   | Docker + nginx (full-stack), GitHub Pages (frontend preview) |
| CI/CD        | GitHub Actions                                               |
| Packaging    | Electron-builder                                             |

## Project Structure

```
2026-18-Molecular_Bookkeeping_for_structural_analysis/
├── .github/
│   └── workflows/
│       ├── cd-backend.yml           # CD: build & publish backend Docker image (triggers on backend/** changes)
│       ├── cd-electron.yml          # CD: build & publish app installers (triggers on version tags or manually in github actions)
│       ├── cd-frontend.yml          # CD: build & publish frontend Docker image (triggers on frontend/** changes)
│       ├── ci.yml                   # CI: lint + typecheck + tests on every PR and relevant push to main
│       └── deploy-frontend-gh-pages.yml  # Deploy static frontend to GitHub Pages
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application factory, CORS setup, startup events
│   │   ├── api/
│   │   │   ├── exercises.py         # GET /api/v1/exercises/ and POST /api/v1/exercises
│   │   │   ├── fragments.py         # CRUD API for working fragments per exercise
│   │   │   ├── health.py            # GET /api/v1/health
│   │   │   ├── info.py              # GET /api/v1/info
│   │   │   ├── logbook.py           # GET/PUT/DELETE for logbook state
│   │   │   ├── predefined_fragments.py # CRUD API for predefined fragment library
│   │   │   ├── reset.py             # POST to delete fragments, working solution, logbook with current exercise id.
│   │   │   ├── router.py            # Aggregates all v1 routers under /api/v1
│   │   │   ├── settings.py          # GET/PUT for changing user settings (the link inheritance behaviour)
│   │   │   ├── warnings.py			 # GET /api/v1/warnings
│   │   │   └── working_solution.py  # GET/PUT/DELETE for the working solution per exercise
│   │   ├── core/
│   │   │   └── config.py            # Pydantic-based settings from environment variables
│   │   └── db/
│   │       ├── base.py              # SQLAlchemy DeclarativeBase
│   │       ├── models.py            # ORM models (Fragment, WorkingSolution, PredefinedFragment, Exercise)
│   │       └── session.py           # Engine, session factory, init_db()
│   ├── data/
│   │   ├── examples/				 # Example spectra (SVG)
│   │   ├── uploads/
│   │   │   └── exercises/
│   │   │       ├── additional/      # Additional spectra (IR, MS, …)
│   │   │       ├── c13/             # 13C-NMR SVGs
│   │   │       └── h1/              # 1H-NMR SVGs
│   │   ├── app.db                   # SQLite database (created at runtime)
│   │   ├── examples_seed.json       # Seed containing example exercises which are imported when the database is created.
│   │   └── predefined_fragments_seed.json # Seed data for predefined fragment library
│   ├── tests/
│   │   ├── conftest.py              # TestClient fixture
│   │   ├── test_exercises_api.py    # Exercises endpoint tests
│   │   ├── test_fragments_api.py    # Tests regarding to fragments, logbook and EP/BVA tests
│   │   ├── test_health.py           # Health endpoint tests
│   │   ├── test_logbook_api.py      # Logbook testing
│   │   ├── test_predefined_fragments_api.py # Predefined fragment tests
│   │   ├── test_reset_api.py        # test resetting a single exercise
│   │   ├── test_seeded_cas_answers.py # test to confirm that validation through cas hash works
│   │   └── test_warnings.py         # Tests on how SMILES are converted to atom count and DBE
│   ├── Dockerfile                   # Container image for the backend
│   ├── main_electron.py             # Build entry point for Python sidecar executable
│   ├── pyproject.toml               # Ruff linter configuration
│   ├── README.md                    # Backend readme
│   ├── requirements.txt             # Python runtime dependencies
│   └── requirements-dev.txt         # Dev/test dependencies (pytest, ruff)
│
├── build-assets/
│   ├── icon.icns
│   └── icon.png					 # Icon for Electron app (min. 256x256px, .png or .ico)
│
├── docs/
│   └── architecture-decisions.md	 # Technical decision records
│   └── installation-guide.md        # How to install the application on Windows, MACOS and Linux
│   └── packaging.md                 # Walkthrough guide for building the app with Electron-builder
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Root component
│   │   ├── index.css                # General style file
│   │   ├── main.tsx                 # React entry point
│   │   ├── vite-env.d.ts            # TypeScript declarations for Vite-specific features
│   │   ├── api/
│   │   │   ├── exercises.ts         # Centralized fetch helper for /api/v1/exercises (CRUD + validation + reset)
│   │   │   ├── logbook.ts           # Handles fetching, saving, and deleting logbook data through the API
│   │   │   └── settings.ts          # Centrelized GET/PUT helper for /api/v1
│   │   ├── components/
│   │   │   ├── ApiStatus.tsx        # Backend connectivity indicator
│   │   │   ├── Container.tsx        # Content container
│   │   │   ├── ExpandedMoleculeView.tsx # Popup window to enlarge the molecule during merging
│   │   │   ├── FragmentList.tsx     # Shared fragment list with atom merge overlays
│   │   │   ├── fragmentTypes.ts     # Shared fragment type definitions
│   │   │   ├── FullscreenButton.tsx # Button to toggle fullscreen
│   │   │   ├── Header.tsx           # Top navigation bar
│   │   │   ├── KetcherEditor.tsx    # Ketcher drawing editor integration
│   │   │   ├── Layout.tsx           # Page layout wrapper (header + content)
│   │   │   ├── RDKitViewer.tsx      # RDKit molecule viewer with descriptor computation
│   │   │   └── StereoChoiceDialog.tsx # Cis/trans configuration dialog after merge
│   │   ├── context/
│   │   │   ├── ExerciseDataContext.tsx	# React context provider for data of the selected exercise
│   │   │   ├── HistoryContext.tsx  	# React context provider for the logbook
│   │   │   ├── RDKitContext.tsx        # React context provider for RDKit WASM instance
│   │   │   └── WarningContext.tsx      # React context provider for data of the warnings
│   │   ├── features/
│   │   │   ├── exercises/
│   │   │   │   ├── ExerciseCreationForm.tsx       # Form for creating exercises
│   │   │   │   ├── ExerciseImportUtils.ts		   # Parsing of the data, both from ZIP and manual input
│   │   │   │   └── ExerciseZipImport.tsx          # ZIP-based bulk exercise import (CSV manifest + spectra)
│   │   │   ├── history/
│   │   │   │   └── LogbookPanel.tsx			   # Collapsible logbook panel
│   │   │   ├── layout/
│   │   │   │   ├── LoadingExerciseOverlay.tsx     # Loading screen, when loading an exercise
│   │   │   │   └── MolecularBookkeepingPage.tsx   # Main dashboard layout, merge orchestration. 
│   │   │   ├── linking/
│   │   │   │   ├── LinkInheritOptionsPopup.tsx	   # Popup to change link inheritance settings
│   │   │   │   ├── PeakTableColumn.tsx            # Peak list component
│   │   │   │   └── WorkingFragmentsStrip.tsx      # Bottom fragment strip with merge/link controls
│   │   │   ├── molecule/
│   │   │   │   ├── MoleculeEditorPopup.tsx        # Draggable floating editor popup
│   │   │   │   ├── MoleculeWorkspace.tsx          # Toggle between Ketcher editor and RDKit viewer
│   │   │   │   └── PredefinedFragmentMenu.tsx     # Dropdown overlay for browsing/adding predefined fragments
│   │   │   ├── solution/
│   │   │   │   └── WorkingSolutionPanel.tsx       # Working solution display with merge atom overlays
│   │   │   ├── viewingSpectra/
│   │   │   │   ├── AdditionalSpectraPopup.tsx     # Modal popup with tabs for additional spectra (IR, MS, …)
│   │   │   │   └── SpectraPrototype.tsx           # Interactive 1H/13C-NMR spectrum display
│   │   │   └── warning/
│   │   │       ├── atom_count.svg				   # warning icon to be displayed when there are to many atoms or DBE
│   │   │       ├── double_assignment.svg		   # warning icon to be displayed when more than one fragment is linked to a peak
│   │   │       └── WarningPanel.tsx			   # Warnings are shown is this box
│   │   ├── hooks/
│   │   │   ├── useFragments.ts      # CRUD hook for working fragments
│   │   │   ├── useLinkedFragmentWarnings.ts # fragment and linking information is send to the backend here and warning information is send to the warning context
│   │   │   ├── useLinking.ts        # Peak-to-fragment linking state machine
│   │   │   ├── usePredefinedFragments.ts # Fetches predefined fragment library from backend
│   │   │   └── useWorkingSolution.ts # Hook for working solution API
│   │   ├── test/
│   │   │   └── setup.ts             # Vitest setup (SVG mocks)
│   │   ├── types/
│   │   │   ├── molecule.ts          # MolGraph, MergeState, NewStereoBond type definitions
│   │   │   └── peak.ts 			 # PeakDef type definition
│   │   └── utils/
│   │       ├── formatChemistryText.tsx # Formatting text above spectra, uses subscript for numbers and allows for italic using /it{} and numbers without subscript using /notsub{}
│   │       ├── mergeFragments.ts    # Atom-to-atom merge algorithm for MolGraphs
│   │       ├── molParser.ts         # V2000 MOL block parser/serializer
│   │       ├── stereoDetection.ts   # Cis/trans stereo bond detection and toggling
│   │       └── svgMergePointLocator.ts # Locates atom positions in RDKit SVGs
│   ├── tests/
│   │   ├── components/
│   │   │   ├── KetcherEditor.smoke.test.tsx
│   │   │   └── KetcherEditor.test.tsx
│   │   ├── context/
│   │   │   └── HistoryContext.test.tsx
│   │   ├── features/
│   │   │   ├── exercises/
│   │   │   │   └── ExerciseCreationForm.test.tsx
│   │   │   ├── layout/
│   │   │   │   ├── LoadingExerciseOverlay.test.tsx
│   │   │   │   ├── MockExercises.ts
│   │   │   │   └── MolecularBookkeepingPage.test.tsx
│   │   │   ├── molecule/
│   │   │   │   ├── MoleculeEditorPopup.test.tsx
│   │   │   │   └── MoleculeWorkspace.test.tsx
│   │   │   ├── solution/
│   │   │   │   └── WorkingSolutionPanel.test.tsx
│   │   │   └── viewingSpectra/ 
│   │   │       └── SpectrumTitle.test.tsx
│   │   └── utils/
│   │       ├── formatChemistryText.test.tsx
│   │       ├── mergeFragments.test.ts
│   │       ├── molParser.test.ts
│   │       ├── stereoDetection.test.ts
│   │       └── svgMergePointLocator.test.ts
│   ├── Dockerfile                   # Multi-stage image: Node build → nginx serve
│   ├── eslint.config.js             # ESLint v9 flat config (TypeScript + React rules)
│   ├── index.html         	         # html which is used during the built
│   ├── nginx.conf                   # nginx: SPA fallback + /api/ reverse-proxy to backend
│   ├── package.json
│   ├── package-lock.json			
│   ├── README.md					 # Frontend README
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts               # Build config + dev proxy + Node polyfills for Ketcher
│
├── .gitignore
├── docker-compose.yml               # One-command full-stack startup
├── LICENSE           				 # MIT License
├── main.js                          # Main entry point of Electron
├── package.json                     # Specifies Electron build configuration
├── preload.js                       # Preload script
└── README.md
```

## Getting Started

### Option 1 — Docker (recommended, no local installs needed)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost             |
| Backend  | http://localhost:8000        |
| API docs | http://localhost:8000/docs   |

The SQLite database is persisted in `backend/data/` via a volume mount, so data survives container restarts.

---

### Option 2 — Local development

#### Prerequisites

- Python 3.12
- Node.js 20+

#### Backend

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend runs at **http://localhost:8000**. The SQLite database (`data/app.db`) is created automatically on first startup. Swagger docs: http://localhost:8000/docs.

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at **http://localhost:5173**. The Vite dev server proxies all `/api/*` requests to the backend automatically.

#### Verify everything works

Open http://localhost:5173 — the connectivity indicator in the header should show the backend as reachable.

## Running Tests & Linters

### Frontend

```bash
cd frontend
npm run lint          # ESLint (TypeScript + React rules)
npm run typecheck     # TypeScript type check without building
npm run test:run      # Vitest — single headless run
npm run test:coverage # Vitest with coverage report (output: frontend/coverage/)
npm run test          # Vitest in watch mode (development)
```

### Backend

```bash
cd backend
source venv/bin/activate   # activate venv first

ruff check .               # Ruff linter (import order, whitespace, unused imports)
python -m pytest           # Pytest (runs from backend/ so app imports resolve correctly)
```

## Key Features (Current State)

| Feature | Status | Description |
|---------|--------|-------------|
| Ketcher molecule editor | Implemented | Draw molecular structures, export SMILES and MOL block; invalid structures (valence violations) are blocked from export; existing fragments can be re-opened for editing from the Working Fragments strip — peak links are preserved; chunk is prefetched at page load so the editor is ready instantly on first open (prevents edits being lost during the initial load delay) |
| RDKit molecule viewer | Implemented | Visualize molecules, compute descriptors (MW, LogP, InChI, HBA/HBD, ring count) |
| Spectrum display | Implemented | Interactive SVG-based 1H-NMR and 13C-NMR viewers with hover, click, zoom, scroll, and fullscreen popup |
| Peak-to-fragment linking | Implemented | Visualization using badges and hover highlight |
| Exercise menu | Implemented | Exercises are orderd in sollapsible sets in the menu and filters can be used to select exercises of a specific type |
| Health/info API | Implemented | Backend health check and server information endpoints |
| Predefined fragment library | Implemented | Backend API with seed data, frontend dropdown with search and RDKit thumbnails |
| Fragment merging (to solution) | Implemented | Atom-to-atom merge of a fragment into the working solution |
| Fragment merging (to fragment) | Implemented | Atom-to-atom merge of two fragments, result appears as a new fragment |
| Double bond configuration choice | Implemented | After merge, detects new stereogenic double bonds via a graph-level CIP-priority comparison (sphere-by-sphere expansion with multi-bond phantom atoms and ring-closure handling) and prompts the user to choose between the two possible geometric configurations (Option 1 / Option 2). Handles conjugated dienes by reusing shared slashes between adjacent stereo bonds. |
| Send to fragments (unsolution) | Implemented | Send the working solution back to the fragment list, with option to keep or clear the solution |
| Exercise/bundle/spectra API | Implemented | Create exercises, parse ACS NMR text, persist spectra files, store peaks |
| Exercise creation (teacher) | Implemented | Frontend form supports single and bulk CSV exercise creation; bulk import maps `{N}_<label>.svg` files to additional spectra automatically |
| ZIP exercise import | Implemented | Bulk import via `.zip` containing a CSV manifest plus spectra folders; export is not implemented |
| Additional spectra popup | Implemented | "Additional Spectra" button opens a modal with one tab per spectrum (IR, MS, …); supports Fit and Scroll (150% default zoom) view modes |
| Atom count and DBE warning (fragments) | Implemented | From all linked fragments the SMILES are send to the backend when an extra fragment is linked or a fragment is no longer linked, where the atoms are counted and compared the the atoms in the molecule formula, H's are ignored. The DBE is calculated and compared with the student entered DBE. If there are too many H's of DBEs then the warning appears |
| Atom count and DBE warning (solution) | Implemented | The SMILES is send to the backend on every change, where the atoms are counted and compared the the atoms in the molecule formula, H's are not ignored. The DBE is calculated and compared with the student entered DBE. If there are too many H's of DBEs then the warning appears |
| Double peak assignment waring | Implemented | If a peak is linked more than once, the warning appears |
| CAS answer validation | Implemented | Students can enter a CAS number; spaces are removed and the answer is validated via SHA-256 hash comparison |
| Structure answer validation | Implemented | SMILES are converted to InChI and this is hashed using SHA256 for an exact comparison with the correct answer hash in the database |
| Undo/redo logbook | Implemented | Per-exercise action history with editable entries, persisted to the backend (`/api/v1/logbook`) and restored on exercise load |
| Desktop packaging | Implemented | Packaged using electron-builder manually (`packaging.md`), or with the GitHub Actions workflow (`cd-electron.yml`), to create installers for Windows, MacOS & Linux |

## CI/CD

### Continuous Integration — `ci.yml`

Triggered on every **pull request** targeting `main`, and on **push to `main`** when `backend/**`, `frontend/**`, or the workflow file itself changes (doc-only pushes are skipped). Two jobs run in parallel:

| Job      | Steps |
|----------|-------|
| Frontend | ESLint → `tsc --noEmit` → Vitest with coverage |
| Backend  | Ruff → Pytest |

Both jobs use dependency caching (npm and pip) to keep runs fast. A coverage artifact is uploaded after each frontend run.

#### Static analysis tools

| Tool | Scope | What it checks |
|------|-------|----------------|
| **ESLint v9** | Frontend TypeScript | React hooks rules, unused vars, explicit `any`, fast-refresh compatibility |
| **TypeScript** (`tsc --noEmit`) | Frontend | Full type correctness without producing build output |
| **Ruff** | Backend Python | Pycodestyle (E/W), Pyflakes (F), import order (I) |

### Continuous Delivery — `cd-backend.yml` / `cd-frontend.yml`

Two independent workflows, each triggered on **push to `main`** only when their own code changes:

| Workflow | Trigger paths | Publishes |
|---|---|---|
| `cd-backend.yml` | `backend/**` | `ghcr.io/<owner>/<repo>/backend:main` |
| `cd-frontend.yml` | `frontend/**` | `ghcr.io/<owner>/<repo>/frontend:main` |

Each image is also tagged with the short commit SHA. Docker layer caching via GitHub Actions cache keeps rebuild times low. A README-only push triggers neither workflow.

To run the published images without a local build:

```bash
# pull pre-built images and start the stack
docker compose pull
docker compose up
```
### Deployment — `cd-electron.yml`

Github Releases, packaging workflow triggered on **pushing a version tag (e.g. `v1.0.0`)**:

| Workflow | Triggers on | Publishes |
|---|---|---|
| `cd-electron` | push tag `v*` | installers for Windows/macOS/Linux (`.exe`/`.dmg`/`.deb`) |

The installers are automatically published to the release assets corresponding to the tag.
To assist installing and running the application, an `installation-guide.md` is provided.

### Frontend preview — `deploy-frontend-gh-pages.yml`

Triggered on push to `main` when `frontend/**` changes. Builds the Vite app and publishes it to **GitHub Pages** as a live static preview (no backend).

## Architecture Overview

The application follows a client-server architecture running locally on the student's machine:

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript)                                │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Spectra      │  │ Molecule     │  │ Exercise &       │    │
│  │ Viewer       │  │ Workspace    │  │ Logbook UI       │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ RDKit (WASM) │  │ Ketcher      │                          │
│  │ Rendering    │  │ Editor       │                          │
│  └──────────────┘  └──────────────┘                          │
│                                                              │
│  React Contexts (Exercise, History, Warnings, RDKit)         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ REST API (/api/v1/*)
                           │ JSON over HTTP
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend (FastAPI + Python)                                   │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│  │ Exercises  │ │ Fragments  │ │ Validation │                │
│  │ API        │ │ API        │ │ API        │                │
│  └────────────┘ └────────────┘ └────────────┘                │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│  │ Logbook    │ │ Working    │ │ Warnings   │                │
│  │ API        │ │ Solution   │ │ API        │                │
│  └────────────┘ │ API        │ └────────────┘                │
│                 └────────────┘                               │
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │ SQLite Database + Exercise Asset Storage   │              │
│  └────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────┘

Desktop deployment:
┌────────────────────┐
│ Electron Shell     │
│ (Desktop App)      │
└────────────────────┘
```

The frontend is organized as a split-screen structure elucidation workspace. The left side of the interface is dedicated to spectral analysis, displaying stacked ¹H and ¹³C NMR spectra together with peak lists and spectral navigation controls. The right side contains the structure-building workspace, including the current solution, working fragments, and validation tools. A top bar provides access to exercise management functions, validation actions, and warning indicators which provide feedback during the structure elucidation process.

## API Endpoints

All endpoints are prefixed with `/api/v1`.


| Method | Path                                                | Description                                              |
| ------ | --------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/health`                                    | Returns `{"status": "ok"}`                               |
| GET    | `/api/v1/info`                                      | App name, API prefix, environment                        |
| GET    | `/api/v1/exercises/summaries`                       | List exercise summaries                                  |
| GET    | `/api/v1/exercises/{exercise_id}`                   | Get a single exercise                                    |
| GET    | `/api/v1/exercises/`                                | List exercises                                           |
| POST   | `/api/v1/exercises/`                                | Create an exercise                                       |
| POST   | `/api/v1/exercises/{exercise_id}/validate-cas`      | Validate a CAS answer for an exercise                    |
| POST   | `/api/v1/exercises/{exercise_id}/validate-solution` | Validate the constructed structure via SHA-256 hash      |
| GET    | `/api/v1/exercises/{exercise_id}/dbe`               | Get DBE value for an exercise                            |
| PUT    | `/api/v1/exercises/{exercise_id}/dbe`               | Update DBE value for an exercise                         |
| POST   | `/api/v1/exercises/reset`                           | Reset an exercise (`?exercise_id=`): clears fragments, working solution, and logbook|
| GET    | `/api/v1/fragments/`                                | List working fragments for an exercise (`?exercise_id=`) |
| POST   | `/api/v1/fragments/`                                | Create a working fragment                                |
| PUT    | `/api/v1/fragments/{fragment_id}`                   | Update a working fragment's structure (SMILES + MOL block)|
| DELETE | `/api/v1/fragments/{fragment_id}`                   | Soft-delete a working fragment                           |
| POST   | `/api/v1/fragments/{fragment_id}/restore`           | Restore a soft-deleted working fragment                  |
| PUT    | `/api/v1/fragments/{fragment_id}/annotation`        | Update a working fragment's annotation                   |
| GET    | `/api/v1/working-solution/`                         | Get working solution for an exercise (`?exercise_id=`)   |
| PUT    | `/api/v1/working-solution/`                         | Save/update working solution                             |
| DELETE | `/api/v1/working-solution/`                         | Clear working solution                                   |
| GET    | `/api/v1/logbook/`                                  | Get logbook state for an exercise (`?exercise_id=`)      |
| PUT    | `/api/v1/logbook/`                                  | Save/update logbook state                                |
| DELETE | `/api/v1/logbook/`                                  | Clear logbook state and hard-delete soft-deleted fragments|
| GET    | `/api/v1/predefined-fragments/`                     | List predefined fragments (supports `?search=` regex filter)|
| POST   | `/api/v1/predefined-fragments/`                     | Create a predefined fragment                             |
| DELETE | `/api/v1/predefined-fragments/{fragment_id}`        | Delete a predefined fragment                             |
| POST   | `/api/v1/warnings/`                                 | Compute warnings for a given fragment/linking payload    |
| GET    | `/api/v1/settings/`                                 | Get user settings (e.g. link-inheritance behaviour)      |
| PUT    | `/api/v1/settings/`                                 | Update user settings                                     |



## License

MIT
