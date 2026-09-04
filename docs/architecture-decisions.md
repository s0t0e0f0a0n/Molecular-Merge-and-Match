# Architecture Decisions

This document shows technical decisions made during the project and the reasoning behind them.

---

## 1. Web application with desktop packaging

**Decision:** Build the application as a web app (React frontend + FastAPI backend) and package it for desktop distribution using Tauri or Electron.

**Context:** The application must work offline on both Windows and macOS, with Linux as a nice-to-have. The client expressed a preference for browser-based if it works offline, and noted that cross-platform support is essential since students use a mix of operating systems.

**Reasoning:** A browser-based architecture gives us the widest compatibility and access to the richest ecosystem of UI libraries (important for spectrum visualization and chemical drawing). Packaging with Tauri or Electron allows the app to run as a standalone desktop application without requiring students to install Python or Node.js, while still functioning fully offline.

**Trade-offs:** Packaging adds complexity and increases the final application size. Electron in particular bundles a full Chromium instance. Tauri is lighter but uses the system webview, which may behave differently across platforms. This decision will be revisited once core functionality is stable.

---

## 2. FastAPI + Python backend

**Decision:** Use Python with FastAPI as the backend framework.

**Context:** The backend needs to handle exercise storage and retrieval, bundle import/export, SMILES processing, and constraint validation. The team has Python experience and the cheminformatics ecosystem (RDKit, OpenBabel) is Python-native.

**Reasoning:** FastAPI provides a lightweight, modern API framework with automatic documentation (Swagger UI) and strong typing via Pydantic. Python gives direct access to cheminformatics libraries needed for SMILES canonicalization, molecular formula parsing, and potentially structure rendering. The auto-generated API docs make it easy for frontend developers to see available endpoints.

**Trade-offs:** Python is slower than compiled languages, but performance is not a concern for this application's scale. Adding Python as a dependency for development requires each team member to set up a virtual environment.

---

## 3. React + TypeScript + Vite frontend

**Decision:** Use React with TypeScript, bundled by Vite.

**Context:** The frontend needs to support interactive spectrum viewing (zoom, scroll, click), fragment selection and linking, drag-and-drop or click-based combination of fragments, and real-time counter updates.

**Reasoning:** React's component model maps well to the application's UI structure (spectrum viewer, fragment panel, counter display, exercise list). TypeScript adds type safety which helps in a six-person team. Vite provides fast development builds and a built-in dev proxy to the backend, eliminating CORS issues during development.

**Trade-offs:** React has a learning curve for team members who have not used it before. TypeScript adds some overhead in writing types, but prevents a class of runtime errors.

---

## 4. SQLite for local storage

**Decision:** Use SQLite as the local database, accessed via SQLAlchemy.

**Context:** The application must work offline and store exercise data, fragment libraries, and potentially exercise completion status locally.

**Reasoning:** SQLite requires no separate database server, stores everything in a single file, and works on all target platforms. SQLAlchemy provides an ORM layer that makes it easy to define and evolve the data model without writing raw SQL. The database file lives in the application's data directory and is created automatically on first run.

**Trade-offs:** SQLite does not support concurrent writes well, but this is a single-user desktop application so that limitation is irrelevant. If cloud sync were ever needed (currently out of scope), a different storage solution would be required.

---

## 5. API versioning with /api/v1/ prefix

**Decision:** All backend endpoints are prefixed with `/api/v1/`.

**Context:** The frontend communicates with the backend via HTTP API calls. The Vite dev proxy forwards `/api/...` requests to the backend.

**Reasoning:** Versioning the API from the start means we can make breaking changes in a future `/api/v2/` without disrupting existing functionality. The prefix also cleanly separates API routes from any static file serving.

**Trade-offs:** Adds a small amount of URL verbosity. For a local-only application this is arguably unnecessary, but it costs nothing to set up and establishes good practice.

---

## 6. SMILES as the canonical answer representation

**Decision:** Use canonical SMILES strings as the definitive representation for molecular answers and fragment definitions.

**Context:** The application needs to compare student-constructed molecules against teacher-defined solutions. SMILES is a compact text-based molecular notation that the client already uses.

**Reasoning:** SMILES is widely supported by cheminformatics libraries (RDKit, OpenBabel) and can be converted to canonical form, meaning any valid representation of the same molecule maps to exactly one string. This enables reliable answer comparison via simple string equality. SMILES is also compact enough to store in a database field and transmit via API.

**Trade-offs:** Students are not familiar with SMILES syntax, so it cannot be the primary user-facing representation. The application must convert between SMILES and visual structure drawings. Some edge cases in canonicalization (stereochemistry, tautomers) may need attention depending on the complexity of exercises.

---

## 7. Ketcher for molecule drawing

**Decision:** Use the Ketcher Molecular Editor for the molecule drawing component.

**Context:** Students need a way to draw molecular structures as part of constructing their answer. Two main open-source options were evaluated: JSME (a lightweight Java-applet-turned-JavaScript editor) and Ketcher (a modern web editor by EPAM).

**Reasoning:** Ketcher integrates cleanly with React, provides a more modern UX, and supports exporting both SMILES and MOL blocks needed downstream. It also avoids global-variable script loading patterns (e.g. `window.JSApplet`) and keeps the editor implementation as a normal React component.

**Trade-offs:** Ketcher has a larger dependency footprint than JSME and can increase frontend bundle size. The editor is lazy-loaded to avoid paying the cost on initial page load.

---

## 8. RDKit.js (WebAssembly) for molecule analysis and rendering

**Decision:** Use the RDKit.js WebAssembly build (`@rdkit/rdkit`) in the frontend for molecule visualization and descriptor computation.

**Context:** After a molecule is drawn in the editor, the application needs to display it as a clean structural diagram and compute molecular descriptors (molecular weight, LogP, InChI, hydrogen bond donors/acceptors, ring count) for validation and feedback purposes.

**Reasoning:** RDKit is the industry-standard open-source cheminformatics toolkit, and its WebAssembly port (`@rdkit/rdkit`) runs entirely in the browser without needing a backend round-trip. This keeps the application responsive and supports offline use. The RDKit viewer component is lazy-loaded (`React.lazy`) to avoid blocking the initial page render while the ~10 MB WASM module downloads and initializes.

**Trade-offs:** The WASM module adds significant weight to the frontend bundle. Lazy loading mitigates the initial load impact but the first render of the RDKit viewer still has a noticeable delay. The WASM files must be copied to the `public/` directory via an npm postinstall script.

---

## 9. Static exercise data in the frontend (temporary)

**Decision:** Exercise definitions (peaks, fragments, SMILES solutions) are currently hardcoded in `frontend/src/data/exercises.ts` rather than loaded from the backend API.

**Context:** The backend exercise API endpoints exist as placeholders but do not yet serve real data. The frontend needed working exercise data to develop and test the spectrum viewer, linking interface, and exercise selector.

**Reasoning:** Hardcoding exercise data directly in the frontend allowed rapid parallel development of UI features without blocking on backend implementation. Three sample exercises (Acetone, Ethanol, Benzoic acid) with realistic peak data and SVG spectra provided enough variety to test all current UI features.

**Trade-offs:** This is explicitly a temporary decision. Once the backend exercise and bundle APIs are implemented, the frontend will fetch exercise data via the API. The current static data serves as a useful reference for the expected data shape and will inform the API response schema design.

---

## 10. SVG-based spectrum rendering with direct DOM injection

**Decision:** NMR spectra are rendered as SVG images, loaded from static files, and injected into the DOM via `dangerouslySetInnerHTML` for interactive manipulation.

**Context:** Spectra need to be zoomable, scrollable, and potentially interactive (peak highlighting on hover, click-to-link). The SVG files are provided as part of the exercise data.

**Reasoning:** SVG is a natural fit because it scales without pixelation (critical for zooming into peak regions) and its elements are accessible via the DOM for interactive features like hover highlighting. Fetching the SVG as text and injecting it directly (rather than using an `<img>` tag) gives the application full DOM access to the SVG elements, enabling interactive behaviors like highlighting peaks and overlaying link indicators.

**Trade-offs:** Using `dangerouslySetInnerHTML` bypasses React's virtual DOM, which means the SVG content is not managed by React and could introduce XSS risks if the SVG source were untrusted. In this application the SVG files are bundled with the exercises and created by trusted teachers, so this is acceptable. The approach also means SVG content is not part of React's reconciliation cycle, so updates require manual re-injection.

---

## 11. Custom hooks for shared state management

**Decision:** Use React's built-in hooks (`useState`, `useRef`, `useLayoutEffect`) plus custom extraction hooks (e.g., `useLinking`, `usePredefinedFragments`) for all state management rather than adopting a library like Redux, Zustand, or MobX.

**Context:** The application's state includes the selected exercise, spectrum zoom/scroll state, linking assignments, merge state, and predefined fragment data. The dashboard layout distributes related UI across separate grid areas (peak tables in the center, working fragments in the bottom strip), requiring shared state.

**Reasoning:** The application has a relatively flat component hierarchy and most state is local to individual features (e.g., zoom state belongs to the spectrum viewer, applet reference belongs to the molecule editor). Prop drilling from the top-level `MolecularBookkeepingPage` component is sufficient for shared state like the current exercise. Introducing a state management library would add complexity and learning overhead for the team without a clear benefit at this stage.

**Trade-offs:** As features like validation and undo/redo are implemented, state interactions between components will grow. If prop drilling becomes unwieldy or performance suffers from unnecessary re-renders, introducing a lightweight state library (e.g., Zustand) should be reconsidered. For now, custom hooks provide a clean middle ground between raw useState and a full state library.

---

## 12. Dashboard-style single-page layout

**Decision:** Use a single-page dashboard layout instead of a router (e.g., React Router).

**Context:** The previous 3-column layout combined spectra, a linking interface, and an exercise sidebar, with tabs in the center panel. User feedback showed that tab switching disrupted workflow, and the linking interface felt too crowded.

**Reasoning:** The interface was redesigned into a dashboard where all key elements are visible at once: spectra on the left, peak tables in the center, the working solution on the right, and fragments in a bottom strip. The predefined fragment library is accessed via a dropdown. This reduces context switching and improves workflow. Linking logic was moved into a shared `useLinking` hook to enable state sharing.

**Trade-offs:** The layout requires more screen space and may feel cramped on smaller displays. The dropdown saves space but reduces visibility. A router may be needed in the future if additional views are added.
---

## 13. Postinstall script for third-party asset copying

**Decision:** Use an npm `postinstall` script to copy RDKit WASM files from `node_modules` into the `public/` directory.

**Context:** RDKit.js distributes assets (a JavaScript loader and WASM binary) that must be served as static files from the web server rather than bundled by Vite.

**Reasoning:** RDKit's WASM binary must be fetchable at a known URL at runtime. Copying these into `public/` during `npm install` ensures they are available at predictable paths (e.g., `/RDKit_minimal.js`) without manual setup by each developer.

**Trade-offs:** The `public/` directory should be gitignored for these copied files to avoid bloating the repository. The postinstall approach couples the build setup to npm lifecycle hooks. The approach is documented in `package.json` and works reliably across platforms.

---

## 14. Predefined fragment library with backend API

**Decision:** Predefined fragments are stored in the backend database and served via `/api/v1/predefined-fragments/`, with a dropdown overlay in the frontend for browsing and adding them to the working set.

**Context:** Students need a curated set of molecular fragments (e.g., methyl group, phenyl ring, carboxyl group) to pick from when constructing molecules, rather than always drawing from scratch in Ketcher.

**Reasoning:** Storing fragments in the backend with name, SMILES, and keyword metadata allows searching, filtering, and future curation managed by the teacher. The frontend `PredefinedFragmentMenu` fetches the library, renders RDKit-generated thumbnails, and supports regex-based search. When a student clicks "Add", RDKit generates a MOL block from the SMILES and creates a working fragment via the existing fragment API. The menu is presented as a dropdown overlay triggered from the working fragments strip, keeping it accessible without consuming permanent screen space.

**Trade-offs:** The library requires the backend to be running and seeded with fragment data. A seed file (`predefined_fragments_seed.json`) provides initial data. The dropdown overlay approach means fragments are not always visible, but avoids dedicating a grid cell to a panel that is only used intermittently.

---

## 15. Unified merge state machine for fragment and solution targets

**Decision:** Use a single three-phase merge state machine (`idle` -> `picking-fragment-atom` -> `picking-merge-target`) with one "Merge" button that can target either the working solution or another fragment.

**Context:** Students need to merge a fragment into the working solution (producing an updated solution) and also merge two fragments together (producing a new fragment). An earlier design used separate buttons and separate state machine branches (`ff-picking-source-atom`, `ff-picking-target-fragment`, `ff-picking-target-atom`), which required an extra step where the student explicitly selected a target fragment before picking an atom on it.

**Reasoning:** The unified flow reduces the state machine from six phases to three and removes one user interaction step. After the student picks an atom on the source fragment, all valid targets (the working solution panel and every other fragment card) show clickable atom overlays simultaneously. Clicking a solution atom triggers a solution merge; clicking a fragment atom triggers a fragment-to-fragment merge. The `FragmentList` component gained a `mergeTargetMode` prop that flips it from "show overlays on one fragment" to "show overlays on all fragments except the source." This reuses the existing `MolThumb` overlay rendering without duplicating code.

**Trade-offs:** Showing overlays on many fragments at once could feel visually busy if the student has many fragments. In practice, the number of working fragments is typically small (3-8), so this is acceptable. The state machine is simpler to reason about and test.

---

## 16. Stereogenic double bond detection at the MolGraph level, neutral "Option 1 / Option 2" labels

**Decision:** Detect newly stereogenic double bonds by inspecting the merged molecular graph directly (using a hand-rolled CIP priority comparison to decide whether the two substituents on each side of a `C=C` are equivalent) and, when RDKit's canonical SMILES omits directional slashes, insert them manually so the user can toggle between the two possible configurations. The UI labels the two choices as **"Option 1"** and **"Option 2"** rather than "cis / trans" or "E / Z".

**Context:** When two fragments are merged and the new single bond lands next to a double bond, the resulting `C=C` may become stereogenic. RDKit's canonical SMILES does not always encode this as `/` and `\`: if the input fragments carried no prior directional slashes, the canonical form of e.g. `CC=C(C)O` simply comes out without slashes even though the bond is stereogenic. A double bond does not rotate, so the student must still be offered a choice. Separately, the chemistry vocabulary around double-bond stereochemistry has three conventions that are NOT interchangeable: cis/trans (same-group convention), E/Z (CIP-priority convention), and the case where the substituents are all different on both sides (only E/Z applies). Labelling the UI choices as "cis / trans" is misleading whenever the molecule doesn't satisfy the cis/trans preconditions, and labelling them "E / Z" without a CIP engine would still be misleading because we couldn't compute the actual E/Z descriptor.

**Reasoning:** Detecting stereogenicity at the graph level is more robust than parsing RDKit's canonical SMILES, which only emits directional slashes when 2D coordinates make the geometry unambiguous. For every `C=C` bond we check (i) it is not in a ring (BFS test that excludes the bond and checks if its endpoints are still connected), (ii) each carbon has at least one heavy-atom substituent besides the other `=C`, and (iii) the two substituents on each side differ in CIP priority. The CIP comparison (`compareCIP`) walks both substituent subtrees sphere by sphere in parallel: at each sphere it compares the sorted-descending list of atomic numbers; the first sphere where the lists differ decides priority. Multi-bonds contribute phantom (terminal) atoms following the CIP duplicate-atom rule: a double bond adds one phantom copy of the partner to each endpoint, a triple bond adds two. This is what lets the algorithm distinguish vinyl from ethyl (`-CH=CH2` vs `-CH2-CH3`) even though both look like "a C with one C neighbour" at shell 1. Ring closures become terminal phantoms so the BFS never loops. For aromatic systems we enumerate all valid Kekulé tautomers (backtracking perfect matching on aromatic atoms that need a double bond) and compute each substituent's full CIP profile under every form, taking the maximum profile per substituent before comparing. This is the IUPAC 2013 treatment: a substituent's CIP rank is determined by the Kekulé arrangement that gives it the highest priority. Whether a given aromatic atom needs a double bond is decided by its periodic-table group plus formal charge, with one consistent rule covering common and exotic aromatics alike: Group 13/14 (C, Si, B) always need one unless anionic; Group 15 (N, P, As) always need when cationic, otherwise need only if they have no non-aromatic explicit bond (pyridine-style vs pyrrole-style); Group 16 (O, S, Se, Te) need only when cationic (pyrylium, thiopyrylium). The implementation correctly handles benzene (2 forms), naphthalene (3 forms), furan (1 form, oxygen contributes a lone pair), pyridine (2 forms, nitrogen acts like a carbon), imidazole with explicit NH (1 form, the NH locks the matching), pyrylium / thiopyrylium / N-methylpyridinium (cationic heteroaromatics, 2 forms each), selenophene (1 form, like furan), phosphabenzene (2 forms, like pyridine), and combined systems with multiple independent aromatic systems (9 forms for a molecule with two naphthyl substituents). Cases the heuristic-only earlier version would have missed include shell-2 heteroatom differences (e.g. `-CH2-Cl` vs `-CH2-CH3`), multi-bond phantom differences (vinyl vs ethyl), shell-3 deep recursion (`-CH2-CH2-Cl` vs `-CH2-CH2-CH3`), and aromatic isomers such as 1-naphthyl vs 2-naphthyl. For the UI, "Option 1" and "Option 2" are semantically neutral: they just identify the two geometric possibilities without making chemically-incorrect claims. The chemistry teacher can explain cis/trans vs E/Z in context; the tool just needs the student to pick one of two geometries.

**Trade-offs:** The CIP implementation is intentionally bounded: we don't implement isotope tiebreakers (CIP rule 2) or the R/S sub-resolution at deeper spheres (CIP rule 5), and we flatten the per-sphere atoms across all subtree branches before comparing: fine for the "are these substituents equal?" question but not correct if we ever wanted to produce explicit R/S/E/Z labels. Kekulé enumeration is capped at 32 tautomers (`MAX_FORMS`) to bound complexity; the educational scope never approaches this (naphthalene = 3, biphenyl approx 4, two-naphthyl molecule = 9). `atomNeedsAromaticDoubleBond` covers Group 13–16 with charge awareness (C, Si, B, N, P, As, O, S, Se, Te plus their cationic forms), so benzene, naphthalene, the standard five- and six-membered heteroaromatics, the cationic ones, and heavier-element analogues all work; anything outside those groups defaults to "doesn't need a double bond", which falls back to an all-single Kekulé and a conservative CIP comparison rather than crashing. Pyrrole-style atoms are recognised only when their non-aromatic bond (typically the N–H) is explicit in the graph; an implicit-H pyrrole would still be classified as pyridine-style. The slash-insertion step has its own subtleties for conjugated dienes where adjacent stereo bonds share a slash; the toggle position is chosen to be exclusive to each bond when possible. The neutral "Option 1 / Option 2" labels forgo the teaching opportunity to distinguish cis/trans from E/Z in the UI itself, but that distinction is better taught verbally in a lecture than enforced by a dialog label.

---

## 17. Frontend-only merge computation

**Decision:** All merge operations (graph manipulation, RDKit validation, SMILES generation, stereo detection) run entirely in the frontend browser via RDKit.js WASM. The backend only stores the final SMILES and MOL block strings.

**Context:** Merging two molecular fragments involves removing hydrogen atoms, adding a bond, adjusting coordinates, validating the result, and generating canonical SMILES. This could be done server-side in Python (where RDKit is native) or client-side in JavaScript (using the RDKit WASM build).

**Reasoning:** Running merge computation in the browser keeps the application responsive without network round-trips, works fully offline, and reduces backend complexity. The `mergeAtAtoms()` function operates on parsed `MolGraph` objects (arrays of atoms and bonds), which are lightweight data structures. RDKit.js handles SMILES canonicalization and MOL block cleanup. The backend remains a thin storage layer, receiving only the final validated result via `PUT /api/v1/working-solution/` or `POST /api/v1/fragments/`.

**Trade-offs:** The RDKit WASM module adds ~10 MB to the frontend bundle (mitigated by lazy loading). Client-side computation means the backend cannot independently verify merge correctness, but this is acceptable for an educational tool where the student is constructing their own answer.


---

## 18. Ketcher export safety constraint

**Decision:** Block fragment export when the drawn structure contains a valence violation, using Ketcher's internal `badConn` atom flag read from `ketcher.editor.struct()` before any export API call is made.

**Context:** It was discovered that Ketcher silently normalises chemically invalid structures before returning them via its export API (`getSmiles()`, `getMolfile()`). For example, drawing nitrogen with two double bonds to separate oxygens (bond-order sum = 5, no formal charge) visually shows a warning on the atom but exports as the valid zwitterion `C[N+](=O)[O-]`. Any validity check applied to the exported MOL file or SMILES therefore always passes, allowing corrupt fragment data into the system and downstream into merge and NMR-matching computations.

**Reasoning:** Ketcher's own valence checker sets a `badConn = true` flag on each `Atom` object in its internal struct whenever the atom's bond-order sum exceeds its allowed valence — the same flag that drives the visual warning indicator in the editor. This raw struct is accessible via `ketcher.editor.struct()` and is read *before* `getMolfile()` is called, so it reflects the user's actual drawing rather than the normalised output. If any atom has `badConn = true`, the export is blocked immediately. To make the feedback dynamic rather than sticky, `KetcherEditor` subscribes to `ketcher.changeEvent` (Ketcher's internal pub/sub, a `Subscription` object with `.add()` / `.remove()`) on editor initialisation and re-evaluates `badConn` on every edit. A red error paragraph appears as soon as the violation is introduced and clears automatically when the user fixes it or erases the canvas.

**Trade-offs:** This approach relies on an undocumented internal Ketcher API (`editor.struct()`, `badConn`, `changeEvent`). These are not part of the public `Ketcher` TypeScript interface exported from `ketcher-core`, so they are accessed via `(ketcher as any)`. A Ketcher major-version upgrade could rename or remove them without notice. The alternative — post-export RDKit validation — was ruled out precisely because it cannot detect the problem (the exported structure is already valid). A backend-side validation layer would be a safer long-term solution but adds a round-trip and was out of scope for this issue.