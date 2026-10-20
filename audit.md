# Molecular Merge and Match: improvement review

A review of the current `main` branch (v1.5.1): backend (FastAPI, SQLAlchemy, SQLite), frontend (React, Vite), Electron shell, packaging and CI. Every point below was checked against the code; file and line references are to the state of the repo at the time of writing.

Each point has three parts:

- **What**: the problem, with file and line.
- **Why**: the concrete impact.
- **Prompt**: a self-contained instruction you can paste into an AI coding tool. Each prompt names the files, the constraints and how to verify the change, so it can be run on its own in a fresh session.

Run the prompts one at a time, on a branch, and run the test suites after each (`cd backend && python -m pytest`, `cd frontend && npm run test:run && npm run typecheck && npm run lint`).

## Deployment targets

The app is meant to ship in one of two forms, and some points only matter for one of them:

- **Desktop**: the Electron app (Windows, macOS, Linux packages). The backend runs on the student's own machine, one user per install, data in the OS user-data folder.
- **Web**: the Docker images (`cd-frontend.yml`, `cd-backend.yml`) behind a domain. One backend serves every visitor.

The **Target** column in the table below says which form each point applies to. "Both" points are still worth doing for either; a few have different severity per target, noted in the point itself. Section 0 lists what is missing before a web deployment is viable at all; skip it if only the desktop app ships.

## Priority overview

| # | Point | Area | Target | Severity |
|---|---|---|---|---|
| 0.1 | No user accounts: all visitors share one dataset | Architecture | Web | Blocker |
| 0.2 | Hosting set-up (Pages deploy has no backend, HTTPS, volumes, backups) | Deployment | Web | High |
| 1.1 | SVG sanitiser bypass (stored XSS) | Security | Both (worse on web) | High |
| 1.2 | World-writable backend binary and data | Security | Desktop | High |
| 1.3 | Developer database shipped in local builds | Security / privacy | Desktop | High |
| 1.4 | Electron windows can open remote sites with the preload | Security | Desktop | Medium |
| 1.5 | Cross-site requests to the API (CSRF, DNS rebinding) | Security | Both (different fix) | Medium |
| 1.6 | No upload size limits | Security | Both (high on web) | Medium |
| 1.7 | Runtime dependency vulnerabilities (npm audit) | Security | Both | Medium |
| 1.8 | Smaller security items (ReDoS, path check, leaks, CSP, Docker) | Security | Both (Docker/nginx: web) | Low to medium |
| 2.1 | Logbook saves fail silently past 64 KB | Data loss | Both | High |
| 2.2 | Migration drops statistics columns | Data loss | Both | High |
| 2.3 | Logbook reset undone by stale cache | Data loss | Both | High |
| 2.4 | Stale responses overwrite the current exercise | Bug | Both (more likely on web) | Medium |
| 2.5 | Smaller bugs (undo re-entry, stale closure, settings race, 500s) | Bug | Both | Medium |
| 3.1 | Whole page re-renders 4 times a second | Performance | Both | High |
| 3.2 | Exercise refetched (and timer restarted) on solvent change | Fetches | Both | High |
| 3.3 | N+1 queries on the exercise summaries list | Database | Both (high on web) | High |
| 3.4 | Missing indexes, GET handlers that write, repeated row loads | Database | Both | Medium |
| 3.5 | Full list GET after every mutation | Fetches | Both (high on web) | Medium |
| 3.6 | Full logbook PUT on every change | Fetches | Both (high on web) | Medium |
| 3.7 | Summaries refetched after small mutations | Fetches | Both | Medium |
| 3.8 | Startup and exercise-open waterfalls | Fetches | Both (high on web) | Medium |
| 3.9 | Duplicate fetches in the statistics and settings panels | Fetches | Both | Medium |
| 3.10 | Spectrum SVGs re-downloaded on display toggles | Fetches | Both | Medium |
| 3.11 | Whole-table scans on every write | Database | Both | Low |
| 4.1 | `MolecularBookkeepingPage.tsx` god component | Structure | Both | High |
| 4.2 | Sixteen copy-pasted settings handlers | Redundancy | Both | High |
| 4.3 | `StatisticsPanel.tsx` structure | Structure | Both | Medium |
| 4.4 | One API client instead of ~30 fetch wrappers | Redundancy | Both | Medium |
| 4.5 | Molecule rendering duplicated in ~8 places | Redundancy | Both | Medium |
| 4.6 | Two spectrum viewers | Redundancy | Both | Medium |
| 4.7 | Modals and panel shells copied ~11 times | Redundancy | Both | Low |
| 4.8 | `window` CustomEvents as a hidden event bus | Structure | Both | Low |
| 4.9 | Backend `db/session.py`: hand-rolled migrations | Structure | Both | Medium |
| 4.10 | Backend `api/exercises.py`: everything in one file | Structure | Both | Medium |
| 4.11 | Backend duplicated logic (statistics keys, tags, settings) | Redundancy | Both | Medium |
| 4.12 | Dead code (frontend and backend) | Redundancy | Both | Low |
| 4.13 | CSS clean-up | Redundancy | Both | Low |
| 4.14 | TypeScript `any` and hook dependency warnings | Quality | Both | Low |
| 5.1 | RDKit script loaded twice | Build | Both | Medium |
| 5.2 | `api://` rewrite breaks web builds; nmrglue test bench in production | Build | Web (rewrite), both (test bench) | High on web |
| 5.3 | Dependency trimming | Build | Both | Low |
| 6.1 | Electron backend lifecycle and shortcuts | Electron | Desktop | Medium |
| 6.2 | Over-broad Linux sandbox permissions | Electron | Desktop (Linux) | Medium |
| 6.3 | CI/CD workflows | CI | Desktop (release workflows), both (ci.yml) | Medium |
| 6.4 | Repo hygiene | Hygiene | Both | Low |

Suggested order:

- **Desktop only:** sections 1 and 2 (skipping web-only items), then 3.1 to 3.3, then the refactors in section 4.
- **Web:** 0.1 and 0.2 first (without them the site is not usable by more than one person), then 5.2, 1.1, 1.5, 1.6, section 2, then section 3 (on the web every extra request costs real network latency, so the fetch points move up).

---

## 0. Before deploying as a web app

Skip this section if only the desktop app ships.

### 0.1 No user accounts: all visitors share one dataset

**What.** The backend has no authentication and no notion of a user. There is no `user_id` anywhere in `backend/app`; progress (`Statistics`, `StatisticsReviewEvent`), `LogbookState`, `WorkingSolution` and `Fragment` are global tables keyed only by exercise, and `UserSettings` is a single global row plus named presets. Every endpoint, including delete, the bulk reset (`POST /exercises/reset-batch`) and exercise import, is open to anyone who can reach the API.

**Why.** This is fine for the desktop app (one install, one student). On a public domain, every student would see and overwrite each other's fragments, solutions, timers, logbooks and settings, and any visitor could delete every exercise. None of the other points matter for the web version until this is solved.

There are two realistic levels:

- **Minimum (no login):** give each browser an anonymous id (a random UUID in an HttpOnly cookie), scope all per-student tables by it, and restrict exercise create/import/delete and global resets to a teacher role protected by a secret (an admin token or a single teacher login). Progress then lives per browser; clearing cookies loses it.
- **Full:** real accounts (for a university, the institution's SSO via OIDC/SAML is usually the right choice, so students do not need another password), with student and teacher roles.

**Prompt.**
```text
This app (FastAPI backend in backend/app, React frontend in frontend/src) has no users: Statistics, StatisticsReviewEvent, LogbookState, WorkingSolution, Fragment and UserSettings in backend/app/db/models.py are global. It must be deployable as a multi-user web app while the Electron desktop build keeps working as a single-user app.

First, write a short plan (do not code yet) and wait for my approval. The plan must cover:
1. An owner_id column on every per-student table listed above (exercises, tags, solvents and predefined fragments stay shared), with indexes and the unique constraints changed to (owner_id, exercise_id) where relevant, plus the migration for existing data (assign existing rows to a fixed "local" owner).
2. A FastAPI dependency get_owner_id that: in desktop mode (env APP_MODE=desktop, set by main.js when it spawns the backend) always returns "local"; in web mode reads an anonymous id from a signed HttpOnly, Secure, SameSite=Lax cookie, issuing one if missing.
3. A teacher role for web mode protecting exercise create/import/update/delete, tag/solvent admin and global resets (start with a single ADMIN_TOKEN env var checked via a header or a login endpoint that sets a separate cookie; note how this could later be replaced by institutional SSO via OIDC).
4. Every query in backend/app/api filtered by owner_id, listed per endpoint.
5. Frontend changes (fetches must send credentials; teacher-only UI hidden when not a teacher).
6. Tests proving two different owners cannot see or change each other's data and a non-teacher gets 403 on admin endpoints.
After approval, implement it in small steps with the test suite passing after each.
```

### 0.2 Hosting set-up

**What.**
- `.github/workflows/deploy-frontend-gh-pages.yml` publishes only `frontend/dist` to GitHub Pages. Production builds rewrite every `/api/v1/...` call to `api://backend/...` (`frontend/src/main.tsx:14-30`, see 5.2), and there is no backend on Pages either way, so that deployment cannot load any data.
- The Docker set-up (`docker-compose.yml`, `frontend/nginx.conf`) serves plain HTTP on port 80 with no TLS.
- SQLite and uploaded spectra live in `backend/data`, bind-mounted from `./backend/data` in `docker-compose.yml:13`. That is fine for one server, but there are no backups, and SQLite does not allow running more than one backend replica.
- `settings.cors_origins` (`backend/app/core/config.py:28-31`) only lists `http://localhost:5173` and `http://127.0.0.1:5173`. With nginx serving frontend and API from the same domain that is fine, but a split set-up (frontend on Pages, API on another domain) would need the real origin and credentials-aware CORS.

**Why.** Without this, the web version either does not work (Pages) or runs without HTTPS and without backups of student data.

**Prompt.**
```text
Prepare the Docker deployment of this repo for a public domain (single server):
1. Remove .github/workflows/deploy-frontend-gh-pages.yml (Pages has no backend, so the app cannot work there), or tell me if you see a configuration where it can work.
2. Add HTTPS: put a Caddy service in docker-compose.yml (or a docker-compose.prod.yml) in front of the frontend nginx, with the domain taken from an env var, automatic Let's Encrypt certificates and HTTP->HTTPS redirect. Only Caddy publishes ports (80, 443); frontend and backend are internal.
3. Make the backend read CORS origins, the allowed hosts for TrustedHostMiddleware, and APP_MODE from environment variables (backend/app/core/config.py), with sensible defaults for local dev.
4. Keep SQLite and the uploads on a named volume, run uvicorn with a single worker (document why: SQLite), and add a nightly backup job (a small service using sqlite3 .backup plus a tar of uploads, keeping the last 14 days).
5. Write a docs/deployment-web.md explaining the env vars, first-time set-up, backup restore, and how to update to a new image version from ghcr.io.
Do not change the Electron build.
```

---

## 1. Security

### 1.1 SVG sanitiser bypass (stored XSS)

**What.** Spectrum SVGs are "sanitised" with two regexes in `backend/app/api/exercises.py:64-67`. The event-handler regex requires whitespace before `on…`, so `<svg/onload=alert(1)>` passes. `javascript:` links and `<foreignObject><iframe srcdoc=…>` also pass. Additional spectra (`exercises.py:162-176`, written by `_write_base64_file` at `:448-461`) are not sanitised at all. The frontend injects these SVGs with `dangerouslySetInnerHTML` (`frontend/src/features/viewingSpectra/SpectraPrototype.tsx:313`, `AdditionalSpectraPopup.tsx:297`) and there is no Content Security Policy.

**Why.** Exercises are shared as ZIP packs. A malicious pack runs script in the app, which can call every API endpoint: delete exercises, wipe progress, change settings. Regex-based HTML sanitising cannot be made safe; an allow-list parser can.

**Prompt.**
```text
Fix stored XSS through spectrum SVGs in this repo.

Backend: in backend/app/api/exercises.py, replace the regex-based sanitiser (_SVG_SCRIPT_RE, _SVG_EVENT_ATTR_RE around lines 64-67 and their use around 152-159) with an allow-list sanitiser in a new module backend/app/core/svg_sanitize.py. Parse with defusedxml (add it to backend/requirements.txt, pinned), keep only standard SVG presentation elements and attributes, and drop <script>, <foreignObject>, <iframe>, every on* attribute, and any href/xlink:href that is not "#..." or "data:image/png|jpeg". Apply it to ALL SVGs written to disk, including additional spectra written via _write_base64_file (around lines 162-176 and 448-461), and to the import-update path. Reject (HTTP 400) files that fail to parse.

Frontend: add DOMPurify (pinned) and sanitise with { USE_PROFILES: { svg: true, svgFilters: true } } immediately before every dangerouslySetInnerHTML that renders spectrum SVG: src/features/viewingSpectra/SpectraPrototype.tsx (~line 313) and src/features/viewingSpectra/AdditionalSpectraPopup.tsx (~line 297).

Add backend tests in backend/tests that post SVGs containing <svg/onload=...>, <a href="javascript:...">, <foreignObject>, and an additional-spectrum SVG with <script>, and assert the stored file contains none of them while a normal spectrum SVG still renders the same paths. Run pytest, npm run test:run and npm run typecheck.
```

### 1.2 World-writable backend binary and data

**What.** `main.js:144` runs `fs.chmodSync(backendPath, 511)`. Decimal 511 is `0o777`, not 755 as the log message at `:145` ("Successfully set 755 execution permissions") claims. Data directories also get 511 (`main.js:80`, whose comment says "Was 0o755") and seed files 438, which is `0o666` (`:89`, `:123`).

**Why.** Any local account can replace `molecular-backend`, which the user then runs, and read or modify `app.db`. It also breaks the code signature on macOS.

**Prompt.**
```text
In main.js (repo root), fix the file permissions set during setup:
- line ~144: fs.chmodSync(backendPath, 511) must become 0o755 (and fix the Dutch comment on that line and the misleading "755" log message on the next line; write both in English).
- line ~80 (data directories): use 0o700.
- lines ~89 and ~123 (seed files): use 0o600.
Use octal literals (0o...) everywhere, not decimals. Keep the existing Snap/Flatpak skip logic unchanged. Do not change anything else in main.js.
```

### 1.3 Developer database shipped in local builds

**What.** `package.json:39-45` (`extraResources`) copies `backend/data/**/*` with no exclusions. `build.sh`, `build_mac.sh` and `build.bat` therefore pack the local `backend/data/app.db` and `uploads/` into the installer, and `setupUserData` (`main.js:73-93`) copies them into every new user's profile. CI builds are clean only because those files are gitignored.

**Why.** Anyone building locally ships their own progress, test exercises and uploaded files to every user.

**Prompt.**
```text
In the root package.json, the electron-builder "extraResources" entry that copies "backend/data" to "data" (around lines 39-45) currently uses filter ["**/*"]. Change the filter so it excludes app.db, test.db, any *.db-journal / *.db-wal / *.db-shm files and the uploads/ directory, while still including the seed files. Then list what backend/data contains and confirm which files would still be packaged. Do not change any other build settings.
```

### 1.4 Electron windows can open remote sites with the preload

**What.** `main.js:233-280` sets no `setWindowOpenHandler` and no `will-navigate` guard. `frontend/src/info/InfoPanel.tsx:56` renders external links with `target="_blank"`, which in Electron opens a new `BrowserWindow` that loads the remote site and inherits the preload, so `window.electronAPI` is exposed to that site. Dropping a file or link onto the window also navigates it away from the app.

**Why.** A remote page gets access to the app's IPC bridge, and the app can be navigated away from by accident.

**Prompt.**
```text
In main.js, for both the main window and nmrWindow:
1. Add webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; }). Import shell from electron.
2. Add webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); }) so the app window can never navigate to a remote page or a dropped file.
Keep contextIsolation, sandbox and nodeIntegration settings as they are. Then build the frontend (cd frontend && npm run build) and explain how to manually test that clicking an external link in the Info panel opens the system browser.
```

### 1.5 Cross-site requests to the API (CSRF, DNS rebinding)

**What.** The API has no authentication and no Host check (`backend/app/main.py:21-28`). CORS stops a website reading responses but not sending "simple" requests. Body-less POSTs such as `/exercises/reset?exercise_id=`, `/statistics/stop|pause|resume`, `/spacedrep/{id}/skip`, `/settings/presets/{name}/apply`, `/fragments/{id}/restore` and the multipart `/nmr-preview/upload` can be triggered from any web page the user visits.

- **Desktop:** the backend listens on 127.0.0.1. Dev uses fixed port 8000, and the packaged build's random port can be scanned. Without a Host check, DNS rebinding gives a malicious site full read access too.
- **Web:** DNS rebinding does not apply, but once 0.1 adds a session cookie, any other site can make the student's browser send requests with that cookie (classic CSRF). The custom-header check below covers that; SameSite=Lax cookies help but do not cover every case.

**Why.** Any website could wipe a student's progress or change their settings.

**Prompt.**
```text
Harden the FastAPI backend against cross-site requests, for both the Electron desktop build and the web deployment.
1. In backend/app/main.py add starlette's TrustedHostMiddleware. Read allowed hosts from an env var (ALLOWED_HOSTS, comma-separated). Default for desktop/dev: ["127.0.0.1", "localhost", "backend"] (check what Host header the Electron api:// protocol handler in main.js sends and include it); for the web deployment it is the public domain.
2. Require a custom header on every non-GET request under /api/v1: add a small middleware that returns 403 unless the request has "X-Requested-With: MMM". A custom header forces a CORS preflight, which the current CORS config will reject from foreign origins.
3. Frontend: make every API request send that header. If src/api/client.ts exists (see point 4.4 of document.md) add it there; otherwise patch the fetch wrapper in src/main.tsx and the raw fetch calls in src/hooks/useFragments.ts, useWorkingSolution.ts, usePredefinedFragments.ts, useLinkedFragmentWarnings.ts, src/features/solution/WorkingSolutionPanel.tsx, src/features/linking/WorkingFragmentsStrip.tsx and src/features/exercises/exerciseImportUtils.ts.
4. Update backend tests' TestClient to send the header by default and add one test asserting a POST without it gets 403.
Run pytest and the frontend tests.
```

### 1.6 No upload size limits

**What.** `svg_text` (`exercises.py:140`) and `file_base64` (`:164`, decoded at `:454`) have no `max_length`, and base64 is decoded fully into memory. PNG/JPG suffixes are never checked against the file's magic bytes. `upload_nmr_dataset` (`backend/app/api/nmr_preview.py:522-564`) accepts any number of files of any size.

**Why.** A single broken or malicious import can exhaust memory or fill the disk.

**Prompt.**
```text
Add upload limits to the backend.
- backend/app/api/exercises.py: add Field(max_length=...) to svg_text (5 MB of text) and file_base64 (10 MB of base64) in the Pydantic models (~lines 140 and 164). In _write_base64_file (~line 448) verify that decoded PNG data starts with b"\x89PNG" and JPEG with b"\xff\xd8\xff", otherwise raise HTTP 400.
- backend/app/api/nmr_preview.py upload_nmr_dataset (~lines 522-564): cap the number of files (e.g. 200) and the total bytes (e.g. 100 MB), streaming and aborting with HTTP 413 when exceeded, and clean up the temporary directory on failure.
Put the limits as named constants at the top of each module. Add pytest cases for oversize and wrong-magic-bytes inputs.
```

### 1.7 Runtime dependency vulnerabilities (npm audit)

**What.** `npm install` reports 38 vulnerabilities (3 critical, 23 high). That number is misleading:

- **29 are dev-only** (vitest, vite, shx, polyfill plugins) and never reach users.
- **9 high ship in the app**, all through Ketcher 3.12: `draft-js`, `immutable`, `lodash` (`_.template` code injection), `fast-uri`, `minimatch`/`brace-expansion` via `replace`. Upgrading `ketcher-core`/`ketcher-react`/`ketcher-standalone` to 3.16 or later fixes them (3.15 drops `draft-js` and `replace`; only 3.16 moves to a patched `lodash`). `fast-uri` (via `ajv`) can also be fixed by a plain `npm audit fix` without a Ketcher bump.
- The root `package.json` (electron-builder 26.14.0) has 15 more, build-time only.

**Why.** Real runtime risk lives in a handful of packages with a simple fix. The tempting `npm audit fix --force` is harmful: it upgraded Vite 5 to 8 and Vitest 2 to 5 and broke `npm run dev` (Vite 8 no longer runs the esbuild polyfill plugin Ketcher needs: "Error during dependency optimization: Not implemented").

**Prompt.**
```text
In frontend/, fix only the runtime npm advisories without semver-major upgrades of the toolchain.
1. Run `npm audit --omit=dev` and record the result.
2. Upgrade ketcher-core, ketcher-react and ketcher-standalone together to the latest 3.x (at least 3.16), then run `npm audit fix` (NEVER --force). Do not change vite, vitest, @vitejs/plugin-react or the polyfill plugins.
3. Verify: `npm run dev` starts with no "dependency optimization" errors, the molecule editor opens and draws, `npm run test:run`, `npm run typecheck` and `npm run build` pass, and `npm audit --omit=dev` reports 0 high/critical.
4. Add a step to .github/workflows/ci.yml in the frontend job, after npm ci: `npm audit --omit=dev --audit-level=high`.
5. In the backend job, add `pip install pip-audit && pip-audit -r requirements.txt`.
Report the before and after audit counts.
```

### 1.8 Smaller security items

**What.**
- `backend/app/api/predefined_fragments.py:37`: `re.compile(search)` on a query parameter, so a crafted pattern can hang the server (ReDoS).
- `backend/app/api/nmr_preview.py:83-91` (`_safe_upload_path`): the upload path check uses `PurePosixPath`, so a Windows name like `D:/x/y` escapes the temp directory.
- `nmr_preview.py:489, 496, 554, 564`: absolute dataset paths (`:496`, `:554`) and exception text (`:489`, `:564`) returned to the client.
- No Content-Security-Policy in `frontend/index.html` or `frontend/nmrglueGUI.html`.
- Docker (web only): both images run as root, `docker-compose.yml:9-10` publishes the unauthenticated backend on all interfaces even though nginx already proxies `/api/`, `/docs` is exposed, and `frontend/nginx.conf` has no security headers and the default 1 MB body limit (NMR uploads get HTTP 413).
- `InfoPanel.tsx` uses `rehype-raw`. Today it only renders bundled Markdown, so it is safe, but it becomes an XSS hole the moment it renders backend text.

**Why.** Each is small, but together they are cheap defence in depth.

**Prompt.**
```text
Apply these small security fixes, one commit-sized change each, and run the test suites after:
1. backend/app/api/predefined_fragments.py ~line 37: replace re.compile(search, re.IGNORECASE) with a case-insensitive substring match (or re.escape(search)). Add a test with search="(a+)+$".
2. backend/app/api/nmr_preview.py ~lines 83-91 (_safe_upload_path): after building each destination path, assert destination.resolve().is_relative_to(temporary_parent.resolve()) and reject any path part containing ":". Add a test with filename "D:/x/y" and "../x".
3. nmr_preview.py ~lines 489, 496, 554 and 564: return the dataset name only and a generic error message; log the full exception with logging.exception.
4. frontend/index.html and frontend/nmrglueGUI.html: add a Content-Security-Policy meta tag: default-src 'self'; connect-src 'self' api:; img-src 'self' api: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'. Test that Ketcher and RDKit still load in `npm run dev` and in the Electron build; if Ketcher needs 'unsafe-eval', add it and say so.
5. backend/Dockerfile: create and switch to a non-root user. docker-compose.yml: remove the backend "ports" mapping (nginx proxies /api) or bind it to 127.0.0.1. backend/app/main.py: set docs_url=None and openapi_url=None unless an env var like ENABLE_DOCS=1 is set.
6. frontend/nginx.conf: add client_max_body_size 100m; and headers X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer.
```

---

## 2. Data loss and correctness bugs

### 2.1 Logbook saves fail silently past 64 KB

**What.** `frontend/src/api/logbook.ts:37` sends the whole logbook with `keepalive: true`. Chromium (and therefore Electron) rejects keepalive requests with bodies over 64 KB with a `TypeError`. Entries contain full molfiles, so a normal session crosses that after a few dozen edits. The failure only goes to `console.error` (`HistoryContext.tsx:189`).

**Why.** After that point, nothing the student does is saved to the logbook, with no visible error.

**Prompt.**
```text
In frontend/src/api/logbook.ts (~line 37), saveLogbook uses fetch(..., { keepalive: true }) with the whole logbook as body. Chromium rejects keepalive bodies over 64 KiB, so saves silently fail for large logbooks.
- Remove keepalive from the normal save.
- There is no unload/beforeunload flush in src today. If you add one, use keepalive there only when the serialised body is under 60 000 bytes, otherwise send without keepalive.
- In src/context/HistoryContext.tsx (~line 189), when a save fails, surface it to the user (reuse whatever toast/error UI the app already has; if there is none, set an error state that a small banner can show) instead of only console.error.
Add a Vitest test that saveLogbook with a body larger than 64 KiB does not set keepalive.
```

### 2.2 Migration drops statistics columns

**What.** `backend/app/db/session.py:637-674` rebuilds the `statistics` table (`RENAME` then `CREATE TABLE`) with a column list that no longer includes `cheats_off`, `paused_at` or `pause_total`, which were added earlier in the same function. Only `SR_status` is re-added afterwards (`:676`). The branch is also an `elif` on the `mastery_index` check, so the type check only runs when that column exists.

**Why.** Anyone upgrading from an old database that takes this branch gets "no such column" errors on every statistics query.

**Prompt.**
```text
In backend/app/db/session.py around lines 637-680 there is a migration that renames statistics to statistics_legacy and recreates it with an explicit column list. That list is missing columns added earlier in the same migration function (cheats_off, paused_at, pause_total, and possibly others).
1. Compare the CREATE TABLE column list with the Statistics model in backend/app/db/models.py and add every missing column with the same type and default.
2. Make sure the INSERT ... SELECT copies those columns from statistics_legacy when they exist.
3. Change the branch from elif to an independent if so the cheats_used type check always runs.
4. Add a pytest that creates an SQLite DB with the legacy schema (cheats_used not VARCHAR(15)), runs the migration, and asserts all model columns exist and data was preserved.
```

### 2.3 Logbook reset undone by a stale cache

**What.** `frontend/src/context/HistoryContext.tsx:135-140, 172-192` caches each exercise's logbook for the session (`loadedRef`, `allHistories`). The reset handler (`MolecularBookkeepingPage.tsx:595-622`, guard at `:598`) clears only the currently selected exercise. The `progression` reset level deletes the `LogbookState` row on the server (`backend/app/api/reset.py:39-40`). If exercise B was visited earlier and then reset at that level from Statistics > Reset (by set, tag or all), going back to B skips the load (already "loaded") and the save effect PUTs the stale cached entries back to the server. The `logbook`, `workspace` and `completion` levels only set `LogbookState.archived` (`reset.py:33-38`), which nothing reads, so `GET /logbook` still returns the old entries for those levels as well.

**Why.** A `progression` reset is undone for exercises visited earlier in the session, and the `logbook`, `workspace` and `completion` levels never clear the logbook at all.

**Prompt.**
```text
In frontend/src/context/HistoryContext.tsx and src/features/layout/MolecularBookkeepingPage.tsx (~line 586-621, the 'exercise-reset' listeners):
1. When an exercise-reset event arrives, remove the cached logbook for EVERY id in event.detail.exerciseIds (both the plain id and the "exercise-<id>" key form) from loadedRef.current and allHistories, not only the selected exercise.
2. Merge the two 'exercise-reset' listeners in MolecularBookkeepingPage into one.
3. Add a per-key dirty flag in HistoryContext so that switching exercises or loading a logbook never triggers a save by itself; only real changes do.
4. In backend/app/api/reset.py (~lines 33-38), make the logbook-clearing levels actually clear the stored entries (or make GET /logbook ignore archived rows), so the server state matches what the reset promises.
Add a Vitest test: visit A, visit B, reset A via the event, return to A, and assert no PUT with the old entries is sent and the loaded history is empty. Add a pytest that a logbook-level reset-batch makes GET /logbook return no entries.
```

### 2.4 Stale responses overwrite the current exercise

**What.** `frontend/src/hooks/useFragments.ts:17-29` and `useWorkingSolution.ts:14-29` fetch without an `AbortController` or request id, and without `.catch`. `SpectraPrototype.tsx:458-481` fetches spectra the same way, with no `res.ok` check. When switching exercises quickly, the previous exercise's response can land last and overwrite the new one. Old fragments also stay on screen until the new ones arrive.

**Why.** The student can see (and act on) another exercise's fragments or spectrum.

**Prompt.**
```text
Add stale-response protection to these fetches in frontend/src:
- hooks/useFragments.ts (refetch, ~lines 17-29)
- hooks/useWorkingSolution.ts (~lines 14-29)
- features/viewingSpectra/SpectraPrototype.tsx (SVG fetch effect, ~lines 458-481)
(features/viewingSpectra/AdditionalSpectraPopup.tsx already guards stale results with a cancelled flag; leave it as is unless you switch it to AbortController for consistency.)
For each: create an AbortController in the effect, pass its signal, abort in the cleanup, ignore AbortError, and catch other errors into an error state. Clear the previous data when the exercise id changes. Skip fetching entirely when the key is 'exercise-none' (no exercise selected). Add res.ok checks to the spectrum fetches. Follow the pattern already used correctly in hooks/useLinkedFragmentWarnings.ts. Add a Vitest test that switches exercise id mid-request and asserts the old response is ignored.
```

### 2.5 Smaller bugs

**What.**
- `HistoryContext.tsx:437-461`: `undo`/`redo` lack the `applyingHistoryRef` guard that `jumpTo` has. Two fast Ctrl+Z presses reverse the same entry twice.
- `MolecularBookkeepingPage.tsx:643-677`: `handleDeleteExercises` reads `exerciseSummaries` but it is not in the dependency array, so it picks a replacement from a stale list. Deletes also run one at a time.
- `MolecularBookkeepingPage.tsx:868-870`: each settings toggle applies the full server response. Two fast toggles can land out of order and flip the second one back.
- `backend/app/api/statistics.py:559`: `POST /statistics/difficulty` calls `int(exercise_id)` on a string key once the matched row has `completed_at` set, so a non-numeric key that matches a completed row (for example `exercise-5` when row `5` is completed) returns HTTP 500. The frontend always sends a numeric id, so this is only reachable from other clients. (`:365` is safe: its callers pass a typed integer.)
- `backend/app/api/exercises.py:906-909`: an invalid formula on import-update raises 500, while create returns 400. Import-update axis fields (`:392-395`) skip the `AxisScale` validation.
- `backend/app/main.py:35-37`: static mounts use relative `"data/uploads"` while uploads are written under `settings.sqlite_path`'s parent (`exercises.py:416, 423`). Without `APP_DATA_DIR` both resolve against the working directory and agree, but when `APP_DATA_DIR` points anywhere other than `<cwd>/data`, every spectrum 404s. Electron currently sets the working directory so the two match.

**Prompt.**
```text
Fix these bugs, each with a regression test:
1. frontend/src/context/HistoryContext.tsx ~lines 437-461: guard undo and redo with the same applyingHistoryRef re-entry guard used by jumpTo.
2. frontend/src/features/layout/MolecularBookkeepingPage.tsx handleDeleteExercises (~643-677): add exerciseSummaries to the dependency array (or read it from a ref) and delete via Promise.allSettled instead of a serial for-await loop. Do the same in src/api/reset.ts (~lines 7-12).
3. MolecularBookkeepingPage.tsx ~lines 868-870: after a single-setting PUT, do not apply the full server settings object, or apply it only if it is the response to the latest request (track a request counter in a ref).
4. backend/app/api/statistics.py ~line 559: guard int(exercise_id) the same way _is_reference_exercise does, returning 400/404 instead of 500.
5. backend/app/api/exercises.py import-update (~906-909): reuse the same formula parsing helper and error handling as create (~1263-1269) so invalid formulas return 400; validate the import-update axis fields with AxisScale.
6. backend/app/main.py ~lines 35-37: mount static directories from the configured data directory (the parent of settings.sqlite_path), not relative paths.
```

---

## 3. Unnecessary fetches, re-renders and database queries

There are no `window.location.reload()` calls or key-based remounts; the "reloads" in this app are refetch-everything patterns and a page-wide re-render loop.

### 3.1 Whole page re-renders 4 times a second

**What.** `useExerciseTimingState` (`frontend/src/features/statistics/TimingPanel.tsx:74-76`) updates `timerNow` every 250 ms and is called inside `MolecularBookkeepingPage` (`:319`). No component uses `React.memo`, so every tick re-renders the full 2,664-line page: both spectrum viewers (which re-run a regex over the whole SVG, `SpectraPrototype.tsx:499`), the fragment list, the exercise menu, settings, and statistics charts when open.

**Why.** Constant CPU use and battery drain whenever the exercise timer is running (the interval is skipped while paused, stopped or completed, `TimingPanel.tsx:68`), and sluggish interaction on slower student laptops.

**Prompt.**
```text
In frontend/src, the exercise timer causes the whole MolecularBookkeepingPage to re-render every 250 ms.
1. In features/statistics/TimingPanel.tsx, remove the timerNow state and setInterval from useExerciseTimingState (~lines 70-80). Keep only the pause/resume handlers and derived flags there.
2. Move the ticking into the leaf component that displays the time (ExerciseTimerDisplay, rendered around line 2233 of features/layout/MolecularBookkeepingPage.tsx): it owns useState(Date.now()) and an interval of 1000 ms (the display shows whole seconds), and computes elapsed time from the statistics props.
3. In SpectraPrototype.tsx, wrap the displaySvg computation (~line 499) in useMemo keyed on the raw SVG and the display flags.
Verify with React DevTools Profiler (describe the before/after) and run npm run test:run; update any tests that relied on timerNow from the hook.
```

### 3.2 Exercise refetched (and timer restarted) on solvent change

**What.** After `updateSolventPreference`, `MolecularBookkeepingPage.tsx:941-943` calls `selectExerciseById(selectedExerciseId)`. That clears the current exercise (spectra unmount and remount, warnings reset), makes two serial requests, and `GET /exercises/{id}` calls `mark_exercise_selected` on the backend (`exercises.py:1023`, `statistics.py:283-299`), which finalises and restarts the timer even if the student had paused.

**Why.** Changing a display preference flickers the whole workspace and corrupts timing statistics.

**Prompt.**
```text
In frontend/src/features/layout/MolecularBookkeepingPage.tsx (~lines 941-943), changing the solvent preference calls selectExerciseById(selectedExerciseId), which clears and refetches the whole exercise and, via GET /api/v1/exercises/{id}, restarts the server-side timer (backend/app/api/exercises.py get_exercise -> mark_exercise_selected).
Fix it so a solvent preference change does not reselect the exercise:
- Either re-derive the solvent display text on the client from the updated solvent list, or
- add a refreshExerciseDetail() to src/context/ExerciseDataContext.tsx that refetches the detail WITHOUT clearing selectedExercise and calls a side-effect-free endpoint (add a query param such as ?track=false to the backend get_exercise so it skips mark_exercise_selected).
Do not change the behaviour when the user actually selects an exercise. Add a backend test that GET with track=false does not modify statistics, and a frontend test that changing the solvent preference does not unmount the spectrum viewer.
```

### 3.3 N+1 queries on the exercise summaries list

**What.** `/exercises/summaries` (the main list) calls `_to_summary_response` per row (`backend/app/api/exercises.py:745-772`, called from about `:859-866`). Each call opens its own `get_db()` session and runs up to three tag queries (none when the exercise has no tag tokens); for tokenised tags the `TagsUsed` hidden lookup is redundant because `resolve_tag_tokens(omit_hidden=True)` already drops hidden tags (`core/tag_tokens.py:41-50`), though it still filters tags stored as plain names. A bare `except Exception` (`:772`) hides failures. `list_exercises` (`:1026-1037`) is also N+1 and is used only by a test.

**Why.** List load time grows linearly with the number of exercises (up to 3 queries and 1 session per exercise), and errors are swallowed.

**Prompt.**
```text
Optimise the exercise summaries endpoint in backend/app/api/exercises.py.
1. _to_summary_response (~lines 745-772) opens a new get_db() session per row and runs up to 3 tag queries per row. Change it to take a preloaded dict of TagsUsed rows (load the whole table once per request in the endpoint at ~lines 859-866; it is small) and resolve tag tokens in memory, applying the hidden filter in memory too (resolve_tag_tokens with omit_hidden=True already drops hidden tokenised tags, see app/core/tag_tokens.py, but tags stored as plain names still need the check). Remove the inner session.
2. Remove the bare except Exception; let real errors surface.
3. The GET list_exercises endpoint (~1026-1037) is not used by the frontend (only by tests/test_exercises_api.py). Delete it and its test, or if you keep it, add selectinload(Exercise.alt_nuclei) and the same bulk tag resolution.
4. Define one _EXERCISE_DETAIL_OPTIONS tuple of selectinload options and use it everywhere an exercise is loaded for a response, including the reload after creation (~1402-1408).
Add a test that counts SQL statements (SQLAlchemy event listener on before_cursor_execute) for /exercises/summaries with 20 exercises and asserts it is constant, not proportional to N.
```

### 3.4 Missing indexes, GET handlers that write, repeated row loads

**What.**
- `Statistics.exercise_id` and `Fragment.exercise_id` (`backend/app/db/models.py:285, 197`) have no index, and statistics has no unique constraint, so concurrent requests can create duplicate statistics rows. A correlated `UPDATE … SELECT FROM statistics` runs on every startup (`session.py:736-744`).
- `get_exercise` (a GET) writes via `mark_exercise_selected` in a second session (`exercises.py:1023`). `validate_*` commits, then `mark_exercise_completed` opens another session and commits again (`:1086-1088`, `:1135-1137`), so a failure in between leaves an exercise completed with unfinished statistics.
- `mark_exercise_selected` loads the same Exercise three times (`statistics.py:283-301`); the third check is always true. Pause, resume and increment load it twice.
- `reset-batch` runs 4 to 7 statements per id in a loop, depending on the level (`api/reset.py:31-62`).

**Why.** Slower queries as data grows, possible duplicate rows, and non-atomic state changes.

**Prompt.**
```text
Backend database fixes in backend/app:
1. db/models.py: add index=True to Fragment.exercise_id (~line 197). For Statistics.exercise_id (~line 285) add a unique index, after first writing a migration that normalises stored keys to the canonical form from core/statistics_keys.py and merges any duplicates. Then simplify _find_statistics_row to a single IN query.
2. Gate the startup UPDATE ... SELECT FROM statistics in db/session.py (~lines 736-744) so it runs once (a one-off migration), not on every start.
3. api/statistics.py: change mark_exercise_selected, mark_exercise_completed, pause/resume/increment helpers to accept the caller's db session and an already-loaded Exercise, instead of opening their own session and reloading the row (~lines 283-301). Remove the always-true _exercise_is_incomplete check after the early return.
4. api/exercises.py: call those helpers inside the caller's session before its single commit (get_exercise ~1023, validate endpoints ~1086-1088 and ~1135-1137), so completion and statistics update atomically.
5. api/reset.py (~lines 31-62): build the full key list once and run each delete/update once with IN, instead of per id.
Run pytest; add a test that a failure during mark_exercise_completed rolls back the validation.
```

### 3.5 Full list GET after every mutation

**What.** Every create, update, delete, restore and set-solution in `useFragments.ts:40, 54, 63, 72` and `useWorkingSolution.ts:38` is followed by a full GET of the list. `jumpTo` over N fragment or solution history entries makes up to about 2N serial requests (`HistoryContext.tsx:463-494`); link and unlink entries need none.

**Why.** Double the network traffic and visible lag on every edit, and very slow history jumps.

**Prompt.**
```text
In frontend/src/hooks/useFragments.ts and useWorkingSolution.ts, every mutation is followed by a full refetch. Change them to update local state from the mutation response:
- create: append the returned (already parsed) fragment
- update: replace the matching fragment by id
- delete: filter it out
- restore: insert the returned fragment
- set working solution: set state from the request/response
Keep refetch() for exercise switches and resets only. Check that src/context/HistoryContext.tsx jumpTo (~lines 463-494) still works and now makes about N requests instead of 2N. Update the existing tests and add one asserting no GET follows a create.
```

### 3.6 Full logbook PUT on every change

**What.** `HistoryContext.tsx:172-192` re-serialises and uploads the entire history 70 ms after any change. It also fires right after a load (`setAllHistories` re-arms it, echoing back what was just fetched), and its dependencies include the whole `allHistories` map, so a change to any exercise re-arms the save.

**Why.** Constant large uploads, and (with point 2.1) the reason saves start failing.

**Prompt.**
```text
In frontend/src/context/HistoryContext.tsx (~lines 172-192), the logbook save effect PUTs the entire history 70 ms after any change, including right after loading.
1. Track the last-saved serialised value (or a dirty flag) per exercise key and skip the save when nothing changed.
2. Depend only on the current exercise's history, not the whole allHistories map.
3. Raise the debounce to 500 ms and flush pending saves on exercise switch and on window unload.
If you implement point 2.3 of document.md (dirty flag) first, reuse that flag. Add a test that loading a logbook triggers no PUT and that two quick changes trigger one PUT.
```

### 3.7 Summaries refetched after small mutations

**What.** `loadExerciseSummaries` (`MolecularBookkeepingPage.tsx:543-554, 624-630`) runs on every `exercise-statistics-updated` event (CAS validation at page `:1763`, solution validation at `WorkingSolutionPanel.tsx:406`, timer resume at `TimingPanel.tsx:149`). A reset dispatches both `exercise-reset` and `exercise-statistics-updated` (`StatisticsPanel.tsx:1329-1330`); at the `exercise` level, when the selected exercise is among the reset ids, the `exercise-reset` handler (page `:597-598`) fetches summaries a second time, and other levels reselect the exercise. Skipping an exercise (`ExerciseMenu.tsx:178`) refetches summaries, tags and solvents. Every background refresh also toggles the loading flag, so the menu shows "Loading…" (`ExerciseMenu.tsx:393, 455, 478`).

**Why.** Redundant full-list requests and a flickering exercise menu.

**Prompt.**
```text
In frontend/src/features/layout/MolecularBookkeepingPage.tsx (~lines 545-559 and 624-635), loadExerciseSummaries is called after many small mutations.
1. Add a "silent" option so background refreshes do not set loadingExerciseSummaries (ExerciseMenu shows "Loading..." at ~lines 393, 455, 478 only on the first load).
2. Make a reset dispatch a single event (src/features/statistics/StatisticsPanel.tsx ~1329-1330 currently dispatches two).
3. For skip (src/features/exercises/ExerciseMenu.tsx ~line 178) refresh only summaries, not tags and solvents.
4. Where the backend response already contains the updated statistics for one exercise, patch that summary in state instead of refetching the list.
5. Remove the 'exercise-completed' listener (~line 548); nothing dispatches it.
```

### 3.8 Startup and exercise-open waterfalls

**What.** Startup is settings, then summaries, then detail, then statistics: four serial round trips (`fetchUserSettings()` at `MolecularBookkeepingPage.tsx:893`; the summaries effect at `:505` waits for `settingsLoaded`). Before any exercise is selected, fragments and working solution are fetched for `exercise_id=exercise-none` (`:264-265`). Opening an exercise fetches detail then statistics serially (`ExerciseDataContext.tsx:93-97`), plus separate `/dbe` (page `:1197`), logbook, fragments, working solution and up to two or three conditional warnings requests (`useLinkedFragmentWarnings.ts:60, 125`, `WorkingSolutionPanel.tsx:198`). A plain `Promise.all` is not safe because statistics depend on the side effect of `GET /exercises/{id}`.

**Why.** Slower startup and exercise switching, and wasted requests.

**Prompt.**
```text
Reduce request waterfalls in frontend/src:
1. MolecularBookkeepingPage.tsx (~lines 505 and 893): start fetchExerciseSummaries() in parallel with fetchUserSettings(); await settings only where it decides between spaced-repetition mode and the URL exercise id.
2. hooks/useFragments.ts and hooks/useWorkingSolution.ts: return early (no fetch) when no exercise is selected (key 'exercise-none').
3. Backend: make GET /api/v1/exercises/{id} (backend/app/api/exercises.py) include the exercise's statistics and saved DBE in the response (ExerciseDetail.statistics is already declared in src/api/exercises.ts ~line 108 but never filled). Then remove the separate statistics fetch in src/context/ExerciseDataContext.tsx (~lines 93-97) and the /dbe fetch (~line 1197 of the page).
Update tests on both sides.
```

### 3.9 Duplicate fetches in the statistics and settings panels

**What.** `fetchAllLogbooks()` (every exercise's full log, the heaviest payload) is called separately by `LogbookDistributionGraph` (`StatisticsPanel.tsx:390`) and `TimeOfDayDistributionGraph` (`:933`), on every switch to their tab (they sit on different tabs, so never mount together) and whenever the `exerciseSummaries` reference changes. Tags are fetched by the page (`MolecularBookkeepingPage.tsx:481`), `ProgressionTab` (`:1248`), `ResetTab` (`:1303`) and `TagsTab` (`SettingsPanel.tsx:222`, which also lacks a `.catch`), although the page already holds `activeTags`.

**Why.** The same large payload downloaded repeatedly while browsing statistics.

**Prompt.**
```text
In frontend/src/features/statistics/StatisticsPanel.tsx:
1. Fetch all logbooks once when the panel opens (in StatisticsPanel itself) and pass them as props to LogbookDistributionGraph (~line 390) and TimeOfDayDistributionGraph (~line 933). Remove exerciseSummaries from those effects' dependencies.
2. Pass the page's activeTags down instead of calling fetchTags() in ProgressionTab (~1248) and ResetTab (~1303); same for TagsTab in src/features/settings/SettingsPanel.tsx (~222), and add error handling there.
3. Wrap the bucket builders (buildLogbookDistribution and similar) in useMemo.
Update StatisticsPanel tests to provide the data via props.
```

### 3.10 Spectrum SVGs re-downloaded on display toggles

**What.** `SpectraPrototype.tsx:458-482` fetches and processes the SVG in one effect. Toggling solvent, exchange or integral display re-downloads the whole SVG just to re-run `applySvgDisplaySettings`.

**Why.** Unneeded downloads and a visible flicker on each toggle.

**Prompt.**
```text
In frontend/src/features/viewingSpectra/SpectraPrototype.tsx (~lines 458-482), split the spectrum effect in two: an effect that fetches the raw SVG text only when src changes (with AbortController and res.ok check), and a useMemo that applies applySvgDisplaySettings to the raw text when the display flags change. Toggling solvent/exchange/integral display must no longer trigger a network request; add a test for that.
```

### 3.11 Whole-table scans on every write

**What.** `recount_exercise_usage` (`backend/app/core/usage_counts.py:12-39`) loads every exercise, solvent and tag and runs a regex per solvent per exercise on every delete (`exercises.py:1202`) and every `exercise`-level reset-batch (`reset.py:63-65`). `encode_solvent_text` (`core/solvent_tokens.py:116`, query at `:128`) loads the whole solvents table on every call, twice per exercise create (`exercises.py:1325-1326`) and twice per update (`:942-943`).

**Why.** Fine today, slow once a teacher imports a few hundred exercises.

**Prompt.**
```text
In backend/app/core/usage_counts.py and the delete/reset-batch endpoints, replace the full recount_exercise_usage call on delete with the existing apply_tag_count_delta / apply_solvent_count_delta helpers (already used on create and update) for the removed exercise's tag and solvent ids. Keep recount_exercise_usage as a maintenance function only. In core/solvent_tokens.py encode_solvent_text (~line 116), accept an optional preloaded solvents list so exercise create and update load the table once. Add a test that counts stay correct after create, update and delete.
```

---

## 4. Structure and redundancy

### 4.1 `MolecularBookkeepingPage.tsx` god component

**What.** 2,664 lines with 46 `useState`, 48 `useCallback` and 15 `useEffect`; the JSX alone runs from line 1780 to 2664. It mixes peak formatting helpers (62-249), about 20 settings flags (283-305, 805-1140), summaries/tags/solvents loading (474-640), deletion (643), DBE input (1176-1258), fragment ordering (1290-1400), the merge and stereo workflow (1411-1705), CAS validation (1741-1790), the cheat hotkey (1140) and the header. `molBlockWithoutMapNumbers` (1456) is recreated on every render.

**Why.** Every change risks side effects elsewhere, the file is hard to review, and any state change re-renders everything (see 3.1).

**Prompt.**
```text
Refactor frontend/src/features/layout/MolecularBookkeepingPage.tsx (2664 lines) into focused hooks and components WITHOUT changing behaviour. Do it in separate steps, running npm run test:run, npm run typecheck and npm run lint after each step:
1. Move pure helpers (peak formatting, ~lines 62-249) to src/utils/peakDisplay.ts, and molBlockWithoutMapNumbers (~line 1456) to module level in a utils file.
2. Extract useUserSettings() (see point 4.2 of document.md).
3. Extract useExerciseCatalogue(): exercise summaries, tags, solvents, delete, and the window event listeners (~lines 474-677).
4. Extract useFormulaDbe(exerciseId) (~lines 1176-1258).
5. Extract useFragmentMerge(): merge state, stereo dialog, finalizeFragmentMerge, handleSolutionAtomClick (~lines 1411-1705).
6. Extract useCasValidation() (~lines 1741-1790).
7. Extract an <AppHeader> component for the header buttons and inline icons (~line 1838 onward); move the inline cog SVG to src/components/PanelIcons.tsx with camelCase SVG props (strokeWidth, not stroke-width).
Keep the existing tests in frontend/tests/features/layout/MolecularBookkeepingPage.test.tsx passing unchanged where possible; if a test must change, explain why. Target: the page file under ~600 lines.
```

### 4.2 Sixteen copy-pasted settings handlers

**What.** `MolecularBookkeepingPage.tsx` contains 16 handlers (15 of them at `:994-1138`, plus `handleChangeLinkInheritMode` at about `:952`) that each do `setX(v); setSelectedPreset('User'); persistUserSettings({key: v})`. `persistUserSettings` (841-890) copies overrides field by field over 18 lines, and its dependency array lists 10 state values it never reads (ESLint warning at 876), so every toggle recreates every handler.

**Why.** About 200 lines that could be 20, and needless re-renders of `SettingsPanel`.

**Prompt.**
```text
In frontend/src/features/layout/MolecularBookkeepingPage.tsx, replace the ~16 individual settings state variables and handlers (~lines 283-305 and 805-1140) with a hook src/hooks/useUserSettings.ts that holds one settings object and exposes updateSetting<K extends keyof Settings>(key: K, value: Settings[K]). updateSetting sets the value, sets selectedPreset to 'User', and persists { [key]: value } (plus exercise_id when a cheat setting changes, as today). Rewrite persistUserSettings as a spread of the overrides with a correct, minimal dependency array. Update SettingsPanel props to take settings and updateSetting instead of ~16 separate props. Behaviour must not change; run tests, typecheck and lint, and fix the exhaustive-deps warning at ~line 876.
```

### 4.3 `StatisticsPanel.tsx` structure

**What.** 1,621 lines holding about 20 chart components and their data builders. Tab selection is a 9-way nested ternary on one line (1614), tab ids are `'1'..'8'` out of order with stale comments (23-29), and a "Temp" tab (`TempTab`, 1124) ships in production.

**Why.** Hard to navigate, impossible to unit test the data builders, and a debug tab visible to students.

**Prompt.**
```text
Restructure frontend/src/features/statistics/StatisticsPanel.tsx without changing what users see (except removing the Temp tab):
1. Move each chart component to src/features/statistics/charts/<Name>.tsx.
2. Move pure data builders (buildTimeline, buildDueDistribution, buildLogbookDistribution, etc.) to src/features/statistics/statisticsData.ts and add unit tests for them.
3. Move ResetTab to its own file.
4. Replace the nested ternary (~line 1614) with a TABS array of { id, label, Component } using descriptive string ids, and remove the stale comments (~23-29).
5. Remove TempTab (~line 1124) or render it only when import.meta.env.DEV.
Run tests, typecheck and lint.
```

### 4.4 One API client instead of ~30 fetch wrappers

**What.** About 30 hand-written wrappers in `src/api/*.ts` repeat the `ok` check and error parsing. Raw `fetch` calls with their own base URLs live in `hooks/useFragments.ts:11`, `useWorkingSolution.ts:8`, `usePredefinedFragments.ts:10`, `useLinkedFragmentWarnings.ts:6`, `WorkingSolutionPanel.tsx:198` (duplicating the warnings call), `WorkingFragmentsStrip.tsx:252` and `exerciseImportUtils.ts:414-459`. The Electron `api://` rewrite is done three different ways: a global `window.fetch` monkey-patch in `main.tsx:15-31`, `api/exercises.ts:176-188`, and `nmrglueGUI.tsx:197, 226`.

**Why.** Inconsistent error handling, three places to update for any API change (such as the CSRF header in 1.5), and a global monkey-patch that affects every library.

**Prompt.**
```text
Create frontend/src/api/client.ts with one function apiFetch<T>(path: string, init?: RequestInit): Promise<T> that:
- resolves the base URL once (api://backend when window.location.protocol === 'file:', otherwise relative), replacing the window.fetch monkey-patch in src/main.tsx (~lines 15-31) and the ad-hoc rewrites in src/api/exercises.ts (~176-188) and src/nmrglueGUI.tsx (~197, 226);
- sets JSON headers when a body is given;
- throws an Error with the server's detail message when !res.ok;
- returns parsed JSON (or undefined for 204).
Then route every API call through it: all functions in src/api/*.ts, the raw fetches in src/hooks/useFragments.ts, useWorkingSolution.ts, usePredefinedFragments.ts, useLinkedFragmentWarnings.ts, src/features/solution/WorkingSolutionPanel.tsx (~198, reuse the existing warnings function), src/features/linking/WorkingFragmentsStrip.tsx (~252), and move postExercise/postExerciseImportUpdate from src/features/exercises/exerciseImportUtils.ts (~414-459) into src/api/exercises.ts. Keep AbortSignal support. Verify in both npm run dev and an Electron build (file: protocol). Run tests, typecheck, lint.
```

### 4.5 Molecule rendering duplicated in about 8 places

**What.** The `rdkit.get_mol` then `get_svg` / `get_svg_with_highlights` then `delete()` sequence is repeated in `components/FragmentList.tsx:81-97`, `components/ExpandedMoleculeView.tsx:41-57` (a near-verbatim copy), `features/solution/WorkingSolutionPanel.tsx:290-318`, `components/StereoChoiceDialog.tsx:46`, `features/molecule/PredefinedFragmentMenu.tsx:23-39`, `features/settings/SettingsPanel.tsx:178`, `components/RDKitViewer.tsx` (three times) and `components/KetcherEditor.tsx:189`. Only some of them free the molecule in `finally` (`SettingsPanel`, `RDKitViewer`, `KetcherEditor`, two of the `WorkingSolutionPanel` sites); `FragmentList`, `ExpandedMoleculeView`, `StereoChoiceDialog`, `PredefinedFragmentMenu` and `WorkingSolutionPanel.tsx:290-318` do not, so the WASM object leaks there when RDKit throws. `blockEvent(e: any)` is also copied in `FragmentList.tsx:109` and `WorkingSolutionPanel.tsx:331`.

**Why.** Memory leaks in WASM where `finally` is missing, and every rendering fix has to be made in every copy.

**Prompt.**
```text
In frontend/src, create a hook src/hooks/useMoleculeSvg.ts: useMoleculeSvg(molOrSmiles, { width, height, highlightAtoms? }) returning { svg, viewBox, atomPositions? }, using the RDKit context, memoised on its inputs, and always calling mol.delete() in a finally block. Also create src/components/AtomPickOverlay.tsx for the shared atom-click overlay and move the duplicated blockEvent helper into it (typed, no any).
Replace the duplicated get_mol/get_svg/delete code in: components/FragmentList.tsx (~81-97, ~109), components/ExpandedMoleculeView.tsx (~41-57), features/solution/WorkingSolutionPanel.tsx (~290-318, ~331), components/StereoChoiceDialog.tsx (~46), features/molecule/PredefinedFragmentMenu.tsx (~23-39), features/settings/SettingsPanel.tsx (~178), components/RDKitViewer.tsx and components/KetcherEditor.tsx (~189). The rendered output must stay identical. Run tests, typecheck, lint.
```

### 4.6 Two spectrum viewers

**What.** `AdditionalSpectraPopup.tsx` has its own fit/scroll/zoom toolbar (48-250) and its own fetch and clean-up regex chain (75-86), duplicating `SpectrumCanvas` (`SpectraPrototype.tsx:197`) and its fetch (458-482). `SpectraPrototype.tsx` is the production viewer despite its name.

**Why.** Two code paths to fix for every spectrum bug (including the XSS in 1.1).

**Prompt.**
```text
In frontend/src/features/viewingSpectra:
1. Rename SpectraPrototype.tsx to SpectrumViewer.tsx and update imports (it is the production viewer, imported by MolecularBookkeepingPage.tsx).
2. Add loadSpectrumSvg(url, signal) to src/features/viewingSpectra/svgFontOverride.ts (or a new src/features/viewingSpectra/spectrumSvg.ts) containing the shared fetch, res.ok check, clean-up regex chain and DOMPurify sanitising.
3. Make AdditionalSpectraPopup.tsx reuse SpectrumCanvas and loadSpectrumSvg, deleting its own toolbar (~lines 48-250) and fetch chain (~75-86). Keep its tabs and the Fit/Scroll modes (Scroll starts at 120% zoom, useState(1.2)).
Run tests, typecheck, lint, and describe how to check the popup manually.
```

### 4.7 Modals and panel shells copied about 11 times

**What.** `SettingsPanel.tsx:451-475`, `InfoPanel.tsx:60-85` and `StatisticsPanel.tsx:1585-1610` copy the same backdrop, tab bar and close button. The `statistics-reset-confirmation` markup of the "Reset data?" dialog (`StatisticsPanel.tsx:1364`) is copied for the unrelated "SR finished / no exercises available" dialog in `ExerciseMenu.tsx:643`. About 11 files hand-roll a modal; only `ExpandedMoleculeView` handles Escape.

**Why.** Inconsistent keyboard and accessibility behaviour, and duplicated markup.

**Prompt.**
```text
In frontend/src/components, create <Modal> (portal, backdrop click and Escape to close, role="dialog", aria-modal, focus moved into the dialog), <TabbedPanel tabs onClose> built on it, and <ConfirmDialog title message onConfirm onCancel>. Replace the hand-rolled shells in SettingsPanel.tsx (~451-475), info/InfoPanel.tsx (~60-85), statistics/StatisticsPanel.tsx (~1585-1610), and the two dialogs that share the statistics-reset-confirmation markup: "Reset data?" in StatisticsPanel.tsx (~1364) and the spaced-repetition "finished" dialog in exercises/ExerciseMenu.tsx (~643). Then search for other createPortal / role="dialog" usages and migrate them where it is a straight swap. Visual output should stay the same. Run tests, typecheck, lint.
```

### 4.8 `window` CustomEvents as a hidden event bus

**What.** `exercise-reset` and `exercise-statistics-updated` are dispatched on `window` and listened to across `StatisticsPanel`, `TimingPanel`, `WorkingSolutionPanel` and the page, with two separate listeners for the same event in one component (`MolecularBookkeepingPage.tsx:586-592, 595-621`).

**Why.** Data flow is invisible to TypeScript and to readers, and causes the double fetches in 3.7.

**Prompt.**
```text
Replace the window CustomEvents 'exercise-reset' and 'exercise-statistics-updated' in frontend/src with explicit functions exposed from context: add refreshSummaries() and notifyExerciseReset(ids) to the useExerciseCatalogue hook (point 4.1 of document.md) or to src/context/ExerciseDataContext.tsx, and call them directly from StatisticsPanel, TimingPanel and WorkingSolutionPanel. Remove all window.dispatchEvent/addEventListener uses of these events. Run tests, typecheck, lint.
```

### 4.9 Backend `db/session.py`: hand-rolled migrations

**What.** `backend/app/db/session.py` is 913 lines: about 85 lines of settings presets (31-116), 280 lines of seeders (148-401), 410 lines of migrations (405-812) and spaced-repetition business logic (829-882) imported by `api/settings.py:8`. The migrations (16 `PRAGMA` checks, 75 `ALTER TABLE` statements and 89 `commit()` calls) run on every startup with no version tracking and commit one statement at a time, so a crash leaves the schema half-migrated (and 2.2 shows how easily they break).

**Why.** Schema changes are fragile, untestable in isolation, and slow startup.

**Prompt.**
```text
Restructure backend/app/db/session.py (913 lines) without changing the resulting schema:
1. Move settings presets (~31-116) to backend/app/core/settings_presets.py.
2. Move seeders (~148-401) to backend/app/db/seed.py.
3. Move spaced-repetition logic (~829-882) to backend/app/services/spaced_repetition.py and update imports (api/settings.py line ~8).
4. Gate the hand-written migrations (~405-812) on PRAGMA user_version: assign each existing block a version number, run only blocks above the stored version inside one transaction, then set user_version. Existing databases at any past version must still upgrade correctly.
5. Leave session.py with engine/session creation only.
Add a test that runs migrations from an empty DB and from a DB created with the oldest schema you can reconstruct, and compares the final schema with Base.metadata. (Moving to Alembic with render_as_batch=True is the longer-term option; mention what it would take but do not do it in this change.)
```

### 4.10 Backend `api/exercises.py`: everything in one file

**What.** 1,424 lines containing about 300 lines of Pydantic schemas (120-413), the NMR ACS text parser (463-669), CAS hashing (673-707) and file storage (415-461), plus route handlers. It imports private helpers (`_ensure_statistics_row`, `_find_statistics_row`, `_record_spaced_repetition_review`) from another router module (20-27). SVG and additional-spectrum writes are duplicated between create (1279-1282, 1380-1398) and import-update (946-980), and the "delete old files" loop between import-update (992-999) and delete (1204-1211).

**Why.** Business logic is coupled to HTTP routing and hard to test or reuse.

**Prompt.**
```text
Split backend/app/api/exercises.py (1424 lines) without changing any API behaviour:
- schemas (~120-413) -> backend/app/schemas/exercise.py
- NMR ACS text parsing (~463-669) -> backend/app/core/nmr_parsing.py (add unit tests for it)
- CAS hashing helpers (~673-707) -> backend/app/core/cas.py; merge _normalize_hashed_value and _normalize_optional_text (identical) and inline the no-op _prepare_solution_cas_fields
- file storage (~415-461) plus the duplicated SVG/additional-spectrum write blocks (~946-980, ~1279-1282, ~1380-1398) and the post-commit old-file cleanup loops (~992-999, ~1204-1211) -> backend/app/core/storage.py
- move _ensure_statistics_row, _find_statistics_row, _record_spaced_repetition_review out of api/statistics.py into backend/app/services/statistics.py as public functions, and import them from there in both routers.
The router file should keep only route handlers. Run ruff check . and pytest after each move.
```

### 4.11 Backend duplicated logic

**What.**
- Statistics-key matching (`str(id)` and `"exercise-<id>"`) is re-implemented in four places: `statistics.py:99-104`, `statistics.py:138-142`, `reset.py:32`, `exercises.py:1187`, despite `core/statistics_keys.py`. `spacedrep.py:96-104` does use `statistics_exercise_id_keys()` but re-implements the row lookup of `_find_statistics_row`.
- `TagOut` construction is copy-pasted five times in `api/tags.py` (35-47, 56-68, 95-107, 123-135, 147-159), and three PUT handlers are near-identical.
- Settings fields are listed by hand four times in `api/settings.py` (27-46, 49-66, 144-164, 218-243), with dead `getattr` fallbacks; `_build_response` opens a second session (130).
- `api/warnings.py:130-134` re-implements `exceeds_formula` (53-70), and the `try/except` at 113-121 is redundant because `validate_formula_dbe` only ever raises `HTTPException`.

**Why.** Each copy is a place where behaviour can drift.

**Prompt.**
```text
Remove duplication in backend/app/api:
1. Use statistics_exercise_id_keys() from app/core/statistics_keys.py in statistics.py (~99-104, ~138-142), spacedrep.py (~96-104, replace the hand-written lookup with _find_statistics_row or its service equivalent), reset.py (~32) and exercises.py (~1187). Move calculate_spaced_repetition_interval into app/core if needed to avoid a circular import.
2. tags.py: add a field_validator on TagOut turning tag_count None into 0, return TagOut.model_validate(row) everywhere (~5 places), and merge the three near-identical PUT handlers around a shared get-or-404 helper.
3. settings.py: build responses with UserSettingsResponse.model_validate(row) (with an alias for show_CAS / show_CAS_input), apply updates with a loop over payload.model_dump(exclude_unset=True), and pass db into _build_response instead of opening a new session (~130).
4. warnings.py: use exceeds_formula instead of the inline copy (~130-134) and remove the pointless try/except (~113-121).
Run ruff and pytest; responses must be byte-identical (compare a few endpoint outputs before and after).
```

### 4.12 Dead code

**What.**
- Frontend components with no importers (verified with grep): `components/ApiStatus.tsx`, `components/Container.tsx`, `components/Header.tsx`. `components/Layout.tsx` is used once as an inline-style wrapper.
- The theme feature is dead: `selectedTheme` state, a disabled select (`SettingsPanel.tsx:587-594`), commented-out `handleThemeChange` (`MolecularBookkeepingPage.tsx:985-992`) and unused `.light-theme`/`.dark-theme` CSS (`index.css:365-374`).
- `MoleculeWorkspace.tsx:30`: `useState('ketcher')` with no setter.
- Types exported but never imported elsewhere: `ApiH1Peak`, `ApiAltNucleusPeak`, `CasAnswerValidationResponse` and `SolutionValidationResponse` in `api/exercises.ts` (still used inside that file, so only the `export` is unnecessary), and others elsewhere.
- Backend functions never called: `increment_incorrect_count` (`statistics.py:395`), `reset_exercise_difficulty` (`:414`), `_abs_path_to_url` (`exercises.py:428`). Unused model columns `Exercise.bookmark`, `available_at`, `stop_at` (`models.py:29, 78-87`). `ExerciseOut.h1_svg_url`/`c13_svg_url` duplicate `*_svg_path` and the frontend recomputes them anyway.
- `frontend/README.md:26` wrongly says `ExerciseCreationForm` and bulk import are not wired in; both are live.

**Why.** Less to read and maintain, and less to confuse new contributors.

**Prompt.**
```text
Delete dead code. Before deleting each item, grep the whole repo (src, tests, backend) to confirm it is unused, and list what you deleted:
Frontend: src/components/ApiStatus.tsx, Container.tsx, Header.tsx; fold src/components/Layout.tsx into App.tsx; remove the theme feature (selectedTheme state and the commented handleThemeChange in MolecularBookkeepingPage.tsx ~985-992, the disabled select in SettingsPanel.tsx ~587-594, .light-theme/.dark-theme in index.css ~365-374); replace useState('ketcher') in MoleculeWorkspace.tsx (~30) with a constant; drop the export from types only used in their own file (ApiH1Peak, ApiAltNucleusPeak, CasAnswerValidationResponse, SolutionValidationResponse in src/api/exercises.ts are used internally; do not delete them), and delete SpectrumPeak in useHighlighting.ts, WarningType and LogbookEntry only if nothing references them at all; move formatMissingAtoms and formulaToCounts from WorkingSolutionPanel.tsx to src/utils/.
Backend: remove increment_incorrect_count and reset_exercise_difficulty (api/statistics.py), _abs_path_to_url (api/exercises.py), and the h1_svg_url/c13_svg_url response fields if the frontend does not read them. Leave the unused DB columns (bookmark, available_at, stop_at) in place but add a note listing them for a future migration.
Docs: fix frontend/README.md (~line 26), which says ExerciseCreationForm and bulk import are not wired in; they are.
Run all tests, typecheck, lint and ruff.
```

### 4.13 CSS clean-up

**What.** `panelStyles.css:1389-1560` (about 170 lines of `.nmr-*`) is never used by the main app, and 21 of its 23 selectors are duplicated in `nmrglueGUI.css`. `panelStyles.css:1384` applies a global checkbox hover outline to every checkbox. Unused selectors: `.settings-tab-title`, `.statistics-average-time-timeline`, `.statistics-average-time-day`, `.statistics-logbook-bin`, `.statistics-logbook-distribution`, `.statistics-logbook-label`, `.nmr-phase-flip`, and `.nmr-pulse-decoupling-band` (in `nmrglueGUI.css`). Inline styles outnumber classes: `frontend/src` has 462 `style={{` blocks against 404 `className=` uses, led by `ExerciseMenu` (68), the page (49) and `StatisticsPanel` (37). The CSS classes themselves are in good shape: of 252 distinct classes, only the 10 listed here and in 4.12 are unused.

**Why.** Dead weight and global leakage. Static inline styles cannot be themed, overridden or reused, so the same look is re-typed in many places, and every inline object is recreated on each render (which adds up with 3.1).

**Prompt.**
```text
Clean up frontend CSS:
1. Delete the .nmr-* block from src/panelStyles.css (~lines 1389-1560); nmrglueGUI.css already has 21 of its 23 rules (all but .nmr-preview-content and .nmr-phase-flip) and the nmrglue entry does not import panelStyles.css. Check nmrglueGUI.tsx still looks the same.
2. Scope the global input[type="checkbox"]:hover rule (~line 1384) to the panels that need it.
3. Remove unused selectors after confirming with grep (including dynamically built class names): .settings-tab-title, .statistics-average-time-timeline, .statistics-average-time-day, .statistics-logbook-bin, .statistics-logbook-distribution, .statistics-logbook-label, .nmr-phase-flip, .nmr-pulse-decoupling-band.
4. Move static inline styles into CSS classes, one file per step, starting with src/features/exercises/ExerciseMenu.tsx (the filter sidebar at ~600-640 first), then src/features/layout/MolecularBookkeepingPage.tsx and src/features/statistics/StatisticsPanel.tsx. Reuse existing classes where one already matches; keep inline only styles computed at runtime (positions, widths, colours from data). Report the before and after count of style={{ per file.
No visual changes intended; describe what to check manually.
```

### 4.14 TypeScript `any` and hook dependency warnings

**What.** ESLint reports 17 `no-explicit-any`, 15 `react-refresh` and 5 `exhaustive-deps` warnings. The largest share, 8 of the 17 `any` warnings, is in `KetcherEditor.tsx:112-209` (Ketcher cast five times). `WorkingSolutionPanel.tsx:72` types `rdkit: any`. `FragmentList.tsx:37, 42` and `WorkingFragmentsStrip.tsx:154` use `(f as any).annotation`. Real dependency warnings: `KetcherEditor.tsx:157`, `MoleculeEditorPopup.tsx:70`, `SettingsPanel.tsx:443`.

**Why.** Missing hook dependencies are a common source of stale-state bugs (as in 2.5).

**Prompt.**
```text
In frontend/, run `npx eslint src` and fix all no-explicit-any and react-hooks/exhaustive-deps warnings:
- KetcherEditor.tsx (~112-209): define a narrow local interface for the parts of the Ketcher API used (editor.struct(), editor.zoom(n), changeEvent.add/remove) instead of casting to any.
- WorkingSolutionPanel.tsx (~72): type rdkit as RDKitModule.
- Add annotation?: string to BackendFragment in src/hooks/useFragments.ts and remove (f as any).annotation in FragmentList.tsx (~37, 42) and WorkingFragmentsStrip.tsx (~154).
- Fix the exhaustive-deps warnings in KetcherEditor.tsx (~157), MoleculeEditorPopup.tsx (~70), SettingsPanel.tsx (~443) properly (not with eslint-disable).
Then change the CI lint step to fail on warnings (eslint --max-warnings 0). Run tests and typecheck.
```

---

## 5. Build and dependencies

### 5.1 RDKit script loaded twice

**What.** `frontend/index.html:15-24` injects `RDKit_minimal.js`, and `src/context/RDKitContext.tsx:25-45` appends it again (with the only `eslint-disable` in `src`, line 48). `window.RDKIT_BINARY_URL` (`index.html:12`) is never read.

**Why.** The 125 KB loader script is downloaded and executed twice, which slows startup. Only `RDKitContext.tsx:29` calls `initRDKitModule`, so the 6.6 MB WASM itself is initialised once.

**Prompt.**
```text
RDKit_minimal.js is loaded twice: by an inline script in frontend/index.html (~lines 12-24) and by src/context/RDKitContext.tsx (~25-45). Remove the injection and the unused window.RDKIT_BINARY_URL from index.html, keep RDKitContext as the single loader, and remove the eslint-disable at ~line 48 by fixing the underlying warning. Check also whether the Ketcher globals script in index.html (~8-10) is still needed given vite.config.ts already defines global and process.env.PUBLIC_URL/MODE (not process itself); remove it only if Ketcher still works. Verify in npm run dev and npm run build && npm run preview that molecules render and the network tab shows RDKit_minimal.wasm fetched once.
```

### 5.2 nmrglue test bench in production, `api://` rewrite in web builds

**What.** `main.tsx:15-31` rewrites `/api/v1` requests to `api://backend/...` in every production build, without checking that it runs in Electron. Browsers cannot fetch `api://`, so the production Docker/nginx image cannot load any data. This is a web blocker on its own, independent of 0.1. Separately, `vite.config.ts` lists `nmrglueGUI.html` as a build input, and `main.tsx:8-13` opens it on F8 in every non-`file:` build.

**Why.** The web build is broken as shipped today, and a developer tool ships to students.

**Prompt.**
```text
1. In frontend/src/main.tsx (~lines 15-31), the fetch override that rewrites /api/v1 and /uploads to api://backend runs in every production build. Make it apply only when window.location.protocol === 'file:' (Electron). If src/api/client.ts from point 4.4 of document.md exists, delete the override instead. Verify with `docker compose up --build` that http://localhost loads exercises.
2. Only include nmrglueGUI.html as a Rollup input when mode === 'development' (vite.config.ts), and only register the F8 hotkey in main.tsx (~8-13) when import.meta.env.DEV. Keep the Electron F8 behaviour in main.js unchanged unless it depends on the built nmrglueGUI.html; if it does, tell me before changing it.
```

### 5.3 Dependency trimming

**What.** `vite-plugin-node-polyfills` is in `devDependencies` but not used in `vite.config.ts`. `jszip` is only used by `ExerciseZipImport.tsx:2` but is in the main bundle. The `postinstall` script uses `shx`, a devDependency, so `npm ci --omit=dev` fails. `@vitejs/plugin-react` is on `^4.3.1` (4.7.0 in the lockfile), which supports Vite 4 to 7 but not Vite 8, so an upgrade to Vite 8 needs both bumped together (and replacing the esbuild `NodeGlobalsPolyfillPlugin`).

**Why.** Smaller bundle and clearer upgrade path.

**Prompt.**
```text
In frontend/:
1. Remove vite-plugin-node-polyfills from devDependencies (confirm it is not imported anywhere).
2. In src/features/exercises/ExerciseZipImport.tsx, load jszip with `const { default: JSZip } = await import('jszip')` when a file is dropped, so it leaves the main chunk. Compare `npm run build` chunk sizes before and after.
3. Replace the shx usage in the postinstall script with a small Node one-liner (fs.mkdirSync + fs.copyFileSync) so it does not depend on a devDependency.
4. Do NOT upgrade vite in this change. Instead add a short "Upgrading Vite" note to frontend/README.md: Vite 8 requires @vitejs/plugin-react 5+ (4.x supports up to Vite 7), and Vite 8 (Rolldown) no longer supports optimizeDeps.esbuildOptions plugins, so NodeGlobalsPolyfillPlugin must be replaced first.
Run npm ci, tests, typecheck, build.
```

---

## 6. Electron, CI and repo hygiene

### 6.1 Electron backend lifecycle and shortcuts

**What.**
- `main.js:387-398`: `will-quit` fires `taskkill` asynchronously and does not wait, so on Windows the backend can be orphaned, holding `app.db`. The Python watchdog (`backend/main_electron.py:11-31`) compares `os.getppid()`, which on Windows keeps returning the original PID after the parent dies.
- `main.js:378`: F8 (Command+F8 on macOS, `:377`) is registered with `globalShortcut`, which steals the key system-wide (other apps, IDE debuggers) while the app runs.
- `main.js:186-197, 367-376`: no listener for the backend's `exit` event. If it crashes, API calls retry for 30 s then return 502 with no message. The fallback to port 8000 can collide with another process.

**Why.** Orphan processes lock the database on next start; silent failures look like a frozen app.

**Prompt.**
```text
Improve backend lifecycle handling in main.js (repo root) and backend/main_electron.py:
1. Kill the backend in app.on('before-quit'): call event.preventDefault() the first time, terminate the child (taskkill /T /F on Windows, SIGTERM elsewhere), wait for the child's 'exit' event (with a 5 s timeout), then call app.quit() again.
2. In backend/main_electron.py, replace the os.getppid() comparison with a check that the original parent PID is still alive (psutil.pid_exists, add psutil pinned to requirements if needed), so the watchdog works on Windows.
3. Listen for the backend child's 'exit' event; if it exits with a non-zero code before it is ready, show dialog.showErrorBox with the last lines of its stderr and quit.
4. Replace globalShortcut.register for F8 (~line 378) with a window-scoped shortcut via webContents.on('before-input-event') or an application menu accelerator, and remove globalShortcut.unregisterAll if no longer needed.
5. Do not fall back to a fixed port 8000 (~371); if no free port is found, show an error.
Explain how to test each change manually on macOS and Windows.
```

### 6.2 Over-broad Linux sandbox permissions

**What.** Flatpak `finishArgs` (`package.json:101-110`) grant `--filesystem=host`, `--socket=system-bus` and `--socket=pulseaudio`. The Snap path in `main.js:37-39` appends `no-sandbox`, disabling the Chromium sandbox, and the snapcraft plugs (`package.json:92`) lack `browser-support`. Neither Flatpak nor Snap is in `linux.target` (AppImage, deb, rpm, pacman) or built by CI, so this affects only packages built by hand.

**Why.** The app gets access to the user's entire file system and system bus for no functional reason.

**Prompt.**
```text
In the root package.json flatpak finishArgs (~lines 95-110), replace --filesystem=host with --filesystem=xdg-documents (or rely on the file chooser portal), and remove --socket=system-bus and --socket=pulseaudio. In main.js (~lines 37-39), remove the no-sandbox switch for Snap and use the snap browser-support plug instead in the snapcraft config. List any feature that might need a broader permission (file import/export paths) and how to test it in each package format.
```

### 6.3 CI/CD workflows

**What.**
- `.github/workflows/cd-electron-ALT.yml` is about 90% identical to `cd-electron.yml` and has drifted: its macOS step hard-codes `rdkit==2025.9.3` and plain `uvicorn==0.30.6`, so the Intel Mac build ships a different backend.
- `cd-electron.yml:7, 97`: `workflow_dispatch` plus `-p always` publishes a release from any branch, with the version from `package.json` because the tag step is skipped.
- `cd-electron.yml:76, 82`: `npm install` instead of `npm ci`, no npm/pip cache, unpinned `pyinstaller`.
- Actions pinned by mutable tags, including third-party `softprops/action-gh-release@v2`, which receives a PAT (`secrets.VERIFY_ACTIONS_RELEASE`) although `permissions: contents: write` is enough. `ci.yml` has no `permissions:` block.
- `cd-electron.yml:94` sets `CSC_IDENTITY_AUTO_DISCOVERY: false`, so builds are unsigned (users see Gatekeeper and SmartScreen warnings).

**Why.** Non-reproducible releases, accidental publishes, and a supply-chain risk on the release token.

**Prompt.**
```text
Clean up the GitHub Actions workflows in .github/workflows:
1. Delete cd-electron-ALT.yml and add the Intel macOS runner (macos-15-intel or the current equivalent) to the matrix in cd-electron.yml, installing the backend with `pip install -r requirements.txt` on every platform (no hard-coded rdkit/uvicorn versions).
2. In cd-electron.yml, publish only for tag pushes: use `-p never` unless startsWith(github.ref, 'refs/tags/v'). Fix the stale comment referring to matrix.arch (~line 95).
3. Use npm ci instead of npm install (~lines 76 and 82), add cache: npm and cache: pip to the setup actions, and pin pyinstaller to a specific version.
4. Replace the PAT secrets.VERIFY_ACTIONS_RELEASE / GH_TOKEN with GITHUB_TOKEN where permissions: contents: write already covers it, and pin third-party actions (softprops/action-gh-release) to a full commit SHA with the version in a comment.
5. Add `permissions: contents: read` to ci.yml.
Do not add code signing in this change; list the secrets it would need (Apple Developer ID + notarisation, Windows certificate) as a follow-up.
Show the final diff of the workflows and explain how to dry-run them.
```

### 6.4 Repo hygiene

**What.**
- `structure.txt` is stale (missing several newer files); generate it or delete it.
- `build-assets/icon_old.svg`, `icon_yellow-blue.svg`, `icon_yellow-blue-outline.svg` are unused but packed into the app by `"build-assets/*"` (`package.json:29`).
- `README.md` (753 lines) and `docs/README-tech.md` (709 lines) largely duplicate each other.
- `main.js:105-107` lists seed files commented "doesn't exist anymore?".
- No `.dockerignore`: `COPY . .` copies the host's macOS `node_modules` over the container's (breaking `docker compose up --build` on a Mac) and the 398 MB `venv/` and local `app.db` into the backend image.
- `local_dev.bat:37` installs from `req-local-dev.txt`, which is gitignored and absent. `backend/pytest.ini` is committed but still listed in `.gitignore`, so local edits to it are easy to lose track of.
- `local_dev.sh` only works on Linux (`gnome-terminal`, `fuser`) and has Dutch comments (also `main.js:36, 144`); it says "10 seconds" but sleeps 4.
- The build logic is triplicated across `build.sh`, `build_mac.sh` and `build.bat`, which already differ; `build.bat` has no error checks.

**Why.** Confusing for new contributors and the source of "works on my machine" problems.

**Prompt.**
```text
Repo hygiene in /, one small change each:
1. Add frontend/.dockerignore (node_modules, dist, coverage) and backend/.dockerignore (venv, __pycache__, .pytest_cache, data/app.db, data/test.db, data/uploads). Verify `docker compose up --build` works on macOS.
2. Delete structure.txt (or replace it with a short "Project layout" section in README.md).
3. Delete unused icons build-assets/icon_old.svg, icon_yellow-blue.svg, icon_yellow-blue-outline.svg after grepping for references; narrow the "build-assets/*" entry in package.json files to the icons actually used.
4. Remove the obsolete seed file entries in main.js (~lines 105-107) after checking which files exist in backend/data.
5. Remove backend/pytest.ini from .gitignore (it is already tracked); fix local_dev.bat (~line 37) to install requirements-dev.txt instead of the missing req-local-dev.txt.
6. Translate the Dutch comments in main.js and local_dev.sh to English, fix the "10 seconds" comment, and make local_dev.sh work on macOS too (open two Terminal tabs via osascript, or simply run backend in the background and frontend in the foreground; use lsof -ti:8000 instead of fuser).
7. Merge build.sh and build_mac.sh into one script that detects the OS, and add errorlevel checks to build.bat.
8. Make README.md the user-facing doc (install, run) and docs/README-tech.md the developer doc; remove duplicated sections from one of them and link between them.
```
