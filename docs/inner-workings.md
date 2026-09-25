# How everything is related

## Application startup

On initial page load, the following data is fetched once and cached in React state:

### Predefined Fragment Library
- **Trigger**: `PredefinedFragmentMenu` component mounts (rendered in `WorkingFragmentsStrip` header)
- **Hook**: `usePredefinedFragments()` → `useEffect` calls `refetch()` on mount
- **API**: GET `/api/v1/predefined-fragments/` → `backend/app/api/predefined_fragments.py` → `list_predefined_fragments()`
- **Database**: `predefined_fragments` table (all rows, ordered by `id`)
- **Result**: Stored in `usePredefinedFragments` state (`fragments` array); menu open/close only toggles local `isOpen` state, no re-fetch

> **Note**: The optional `search` query param triggers a **new** fetch (debounced by local filtering first), but the initial load happens once at startup.

---

## Opening the Exercise Menu

- preloaded TypeScript element `ExerciseMenu.tsx` expands (button onClick)

## Applying (setting a filter)

## Selecting an exercise

- frontend sends information to backend `file` --> `file`
- data is requested from database table and field `exercise.completed` --> `ExerciseMenu.tsx`



## Setting DBE



## Opening the molecular editor

### User Action
User clicks **"Open molecule editor"** button in the top bar (rendered by `MoleculeEditorPopup.tsx`).

### File Chain & Data Flow

1. **`frontend/src/features/layout/MolecularBookkeepingPage.tsx`** (line ~640)
   - Renders `<MoleculeEditorPopup>` with props:
     - `onCreateFragment={createFragment}` — callback to create a new fragment
     - `onUpdateFragment={handleUpdateFragment}` — callback to update existing fragment
     - `editingFragment={editingFragment}` — currently selected fragment for editing (null when creating new)
     - `onEditComplete={() => setEditingFragment(null)}` — closes editor

2. **`frontend/src/features/molecule/MoleculeEditorPopup.tsx`** (lines 1–170)
   - **State**: `isOpen` (boolean), `editor` ('ketcher' | 'rdkit'), `hasBeenOpened` (lazy-mount flag)
   - **Auto-open trigger** (line 35–38): `useEffect` watches `props.editingFragment` — when it becomes non-null, sets `isOpen=true` and `hasBeenOpened=true`
   - **Toggle button**: "Open molecule editor" / "Hide molecule editor" toggles `isOpen`
   - **Click-outside handler**: closes popup and calls `props.onEditComplete()`
   - **Lazy mount**: Only renders the inner workspace (`MoleculeWorkspace`) after `hasBeenOpened` becomes true (preserves editor canvas state across open/close)

3. **`frontend/src/features/molecule/MoleculeWorkspace.tsx`** (lines 1–70)
   - Receives same props from `MoleculeEditorPopup`
   - **State**: `moleculeToLoad` — used when transferring from RDKit viewer to Ketcher
   - **`handleExportFragment()`** (lines 35–42): Unified handler for both create and update:
     ```typescript
     if (editingFragment) {
       await onUpdateFragment(editingFragment.id, fragment.smiles, fragment.molFile);
     } else {
       await onCreateFragment('', fragment.smiles, fragment.molFile);
     }
     onEditComplete?.();
     ```
   - Renders either `<KetcherEditor>` (draw mode) or `<RDKitViewer>` (view mode) via lazy Suspense

4. **`frontend/src/components/KetcherEditor.tsx`** (lines 1–200)
   - **Initialization**: `handleInit()` captures Ketcher instance, sets up structure-change listener for valence validation
   - **Loading fragment for edit** (lines 110–128): `useEffect` watches `editingFragment.id` — when entering edit mode or switching fragments, calls `ketcher.setMolecule(editingFragment.molFile)`
   - **Export handler** `handleExport()` (lines 130–175):
     1. Gets SMILES from Ketcher (`ketcher.getSmiles()`)
     2. Validates: non-empty, no disconnected components (`.`), no bad connections
     3. Gets Molfile V2000 (`ketcher.getMolfile('v2000')`)
     4. **RDKit canonicalization** (if available): Converts SMILES → RDKit mol → clean molfile (strips Ketcher artifacts, ensures canonical representation)
     5. Calls `onExportFragment({ smiles, molFile })` → bubbles up to `MoleculeWorkspace.handleExportFragment()`
     6. Clears Ketcher canvas (`ketcher.setMolecule('')`)

### State Changes in MolecularBookkeepingPage
- `editingFragment` (set by `handleStartEditFragment()`) → triggers auto-open
- On export completion → `onEditComplete` fires → `setEditingFragment(null)` → popup closes

---

## Sending a drawn structure from the molecular editor to the fragment space

### User Action
User draws a structure in Ketcher, clicks **"Export to fragment space"** (new fragment) or **"Save changes to fragment"** (editing existing).

### File Chain & Data Flow

1. **`frontend/src/components/KetcherEditor.tsx`** — `handleExport()` (lines 130–175)
   - Produces validated `{ smiles, molFile }` object
   - Calls `onExportFragment({ smiles, molFile })` prop

2. **`frontend/src/features/molecule/MoleculeWorkspace.tsx`** — `handleExportFragment()` (lines 35–42)
   - **If editing existing fragment** (`editingFragment` non-null):
     ```typescript
     const ok = await onUpdateFragment(editingFragment.id, fragment.smiles, fragment.molFile);
     if (ok) onEditComplete?.();
     ```
   - **If creating new fragment** (`editingFragment` null):
     ```typescript
     await onCreateFragment('', fragment.smiles, fragment.molFile);
     onEditComplete?.();
     ```
   - Note: label is empty string `''`; `MolecularBookkeepingPage.createFragment` generates "Fragment N" label

3. **`frontend/src/features/layout/MolecularBookkeepingPage.tsx`** — callbacks passed to `MoleculeEditorPopup`:
   - **`createFragment()`** (lines 165–176):
     ```typescript
     const createFragment = useCallback(async (_label, smiles, molFile) => {
       const label = getNextFragmentLabel(); // "Fragment 1", "Fragment 2", ...
       const newId = await rawCreateFragment(label, smiles, molFile);
       if (newId !== null) {
         history.record({ kind: 'create-fragment', fragmentId: newId, fragLabel: label });
       }
       return newId;
     }, [rawCreateFragment, history, getNextFragmentLabel]);
     ```
   - **`handleUpdateFragment()`** (lines 178–202):
     ```typescript
     const handleUpdateFragment = useCallback(async (id, smiles, molFile) => {
       const before = fragments.find(f => f.id === id);
       const ok = await updateFragment(id, smiles, molFile);
       if (!ok) return false;
       history.record({ kind: 'edit-fragment', fragmentId: id, fragLabel: before.label,
         before: { smiles: before.smiles, mol_file: before.mol_file },
         after: { smiles, mol_file: molFile } });
       return true;
     }, [fragments, updateFragment, history]);
     ```

4. **`frontend/src/hooks/useFragments.ts`** — API layer (lines 45–75):
   - **`createFragment()`** (POST `/api/v1/fragments/`):
     ```json
     { "exercise_id": "exercise-123", "label": "Fragment 1", "smiles": "CCO", "mol_file": "..." }
     ```
     → Returns created fragment with DB-assigned `id` → `refetch()` updates local state
   - **`updateFragment()`** (PUT `/api/v1/fragments/:id`):
     ```json
     { "smiles": "CCO", "mol_file": "..." }
     ```
     → `refetch()` updates local state

5. **Backend API** — `backend/app/api/fragments.py`:
   - **`create_fragment()`** — POST `/api/v1/fragments/`:
     - Receives `FragmentCreate` body (`exercise_id`, `label`, `smiles`, `mol_file`)
     - Creates `Fragment` ORM object, adds to session, commits, refreshes
     - Returns `FragmentOut` (id, exercise_id, label, smiles, mol_file, annotation)
   - **`update_fragment()`** — PUT `/api/v1/fragments/{fragment_id}`:
     - Receives `FragmentUpdate` body (`smiles`, `mol_file`)
     - Queries `Fragment` by id (filters `deleted_at IS NULL`)
     - Updates `smiles`, `mol_file`, commits, refreshes
     - Returns `FragmentOut`
   - **`list_fragments()`** — GET `/api/v1/fragments/?exercise_id=...`:
     - Queries `Fragment` table filtered by `exercise_id` and `deleted_at IS NULL`
     - Orders by `id`, returns list of `FragmentOut`

6. **Frontend state refresh**:
   - `refetch()` → GET `/api/v1/fragments/?exercise_id=...` → updates `fragments` state in `useFragments`
   - `MolecularBookkeepingPage` receives updated `fragments` array via hook
   - `WorkingFragmentsStrip` re-renders with new fragment list

### Database Tables Involved
- `fragments` — stores each fragment: `id`, `exercise_id`, `label`, `smiles`, `mol_file`, `annotation`, `deleted_at` (soft delete)

### History recording
- An histroy event is created in frontend and backend. See the history section at te very bottom.

## Generate a structure through SMILES, exporting to fragment space or to the editor

### User Action
User opens the molecule editor, switches to **"View" tab** (RDKit viewer), enters a SMILES string (e.g., `c1ccccc1`), clicks **"Render"**, then either:
- **"Transfer to editor"** — loads the structure into Ketcher (Draw tab) for further editing
- **"Add to working fragments"** — directly creates a new fragment in the fragment space

### File Chain & Data Flow

#### 1. RDKit Viewer — SMILES Input & Rendering
**`frontend/src/components/RDKitViewer.tsx`**
- **State**: `smilesInput` (string), `svg` (rendered structure), `info` (descriptors), `error`
- **`handleRender()`** (lines 35–60):
  1. Validates SMILES via `rdkit.get_mol(smilesInput)`
  2. Checks `mol.is_valid()`
  3. Generates SVG: `mol.get_svg(500, 350)`
  4. Computes descriptors: `mol.get_descriptors()` → MW, heavy atoms, rings, HBA/HBD, LogP, InChI
  5. Updates `svg`, `info` state for display
- **`handleTransfer()`** (lines 62–74):
  - Re-validates SMILES via RDKit
  - Calls `onTransferToEditor(mol.get_smiles(), mol.get_molblock())`
- **`handleAddToWorkingFragments()`** (lines 76–90):
  - Re-validates SMILES via RDKit
  - Calls `onAddToWorkingFragments(mol.get_smiles(), mol.get_molblock())` (async)

#### 2. MoleculeWorkspace — Tab Switching & Fragment Creation
**`frontend/src/features/molecule/MoleculeWorkspace.tsx`** (lines 35–70)
- **State**: `moleculeToLoad` (ExportedFragment | null) — holds molecule when switching from View → Draw
- **RDKitViewer props** (lines 58–65):
  ```tsx
  <RDKitViewer
    onTransferToEditor={(smiles, molFile) => {
      setMoleculeToLoad({ smiles, molFile });  // Store molecule for Ketcher to load
      onEditorChange?.('ketcher');             // Switch tab to Draw mode
    }}
    onAddToWorkingFragments={(smiles, molFile) => onCreateFragment('', smiles, molFile)}
  />
  ```
- **KetcherEditor prop** (line 48): `moleculeToLoad={moleculeToLoad}` — Ketcher loads this when not in edit mode

#### 3. KetcherEditor — Receiving Transferred Molecule
**`frontend/src/components/KetcherEditor.tsx`** (lines 110–128)
- **`useEffect`** watches `moleculeToLoad` and `editingFragment`:
  ```typescript
  if (moleculeToLoad && !editingFragment) {
    ketcherRef.current.setMolecule(moleculeToLoad.molFile).catch(console.error);
    setStructError(null);
    return;
  }
  ```
  - When `moleculeToLoad` is set (from View tab) and not editing a fragment → loads molecule into Ketcher canvas
  - User can now further edit, then export via normal `handleExport()` flow

#### 4. Fragment Creation (Direct from View Tab)
When user clicks **"Add to working fragments"**:
1. `RDKitViewer.handleAddToWorkingFragments()` → `onAddToWorkingFragments(smiles, molFile)`
2. `MoleculeWorkspace` passes `onCreateFragment('', smiles, molFile)` (same as draw-mode create)
3. Flow continues through **`MolecularBookkeepingPage.createFragment()`** → **`useFragments.createFragment()`** → **Backend `create_fragment()`** → **`fragments` table** (exactly as documented in "Sending a drawn structure...")

### Database Tables Involved
- `fragments` — same as draw-mode export (see "Sending a drawn structure...")

### Key Differences from Draw-Mode Export
| Aspect | Draw Mode (Ketcher) | View Mode (RDKit) |
|--------|---------------------|-------------------|
| Input | Mouse/drawing canvas | SMILES text input |
| Validation | Ketcher internal + RDKit canonicalization | RDKit `get_mol()` + `is_valid()` |
| Molfile source | `ketcher.getMolfile('v2000')` | `mol.get_molblock()` |
| Canonicalization | RDKit re-parse after Ketcher export | Native RDKit (already canonical) |
| Transfer to editor | N/A (already in editor) | `onTransferToEditor` → `moleculeToLoad` → Ketcher loads |

---

## Opening the predefined fragment menu & selecting a fragment

### User Action
User clicks **"Predefined fragments"** button in the fragment space header (WorkingFragmentsStrip), the dropdown opens showing a searchable grid of fragment thumbnails. User optionally searches, then clicks **"Add"** on a fragment card to add it to the working fragment space.

> **Data loading**: The fragment library is fetched **once at application startup** (see "Application startup"). Opening the menu only reads from cached React state — no network request.

### File Chain & Data Flow

#### 1. PredefinedFragmentMenu — Menu Toggle & Fragment Grid
**`frontend/src/features/molecule/PredefinedFragmentMenu.tsx`**
- **Props**: `onAdd: (name, smiles, molFile) => void` — callback when user clicks "Add"
- **State**: `isOpen` (boolean), `search` (string), `searchError` (string | null)
- **Toggle button** (lines 106–120): Shows "Predefined fragments (N)" / "Hide fragments", toggles `isOpen`
- **Click-outside handler** (lines 62–71): Closes menu on `mousedown` outside wrapper
- **Search input** (lines 131–143): Filters fragments **locally** by `name` or `keywords` (case-insensitive regex) — no API call unless user explicitly triggers a server-side search (not currently implemented in UI)
- **Fragment grid** (lines 146–152): 3-column grid of `FragmentButton` components for filtered fragments

#### 2. FragmentButton — Thumbnail Render & Add Action
**`frontend/src/features/molecule/PredefinedFragmentMenu.tsx`** (lines 14–58)
- **Props**: `fragment: PredefinedFragment`, `onAdd`
- **Thumbnail rendering** (lines 27–38): `useEffect` on `rdkit` + `fragment.smiles`:
  1. `rdkit.get_mol(fragment.smiles)`
  2. `mol.is_valid()` → `mol.get_svg(THUMB_SIZE, THUMB_SIZE)` → sets `svg` state
- **`handleAdd()`** (lines 40–50):
  1. Re-validates via `rdkit.get_mol(fragment.smiles)`
  2. Gets canonical SMILES: `mol.get_smiles()`
  3. Gets molblock: `mol.get_molblock()`
  4. Calls `onAdd(fragment.name, canonSmiles, molBlock)`

#### 3. Data Fetching — usePredefinedFragments Hook
**`frontend/src/hooks/usePredefinedFragments.ts`**
- **State**: `fragments` (PredefinedFragment[]), `loading` (boolean)
- **`refetch(search?)`** (lines 13–21):
  - GET `/api/v1/predefined-fragments/` (or `/?search=<regex>`)
  - Sets `fragments` from JSON response
- **Initial load** (lines 23–25): `useEffect` calls `refetch()` on mount (**runs once at startup**, see "Application startup")
- **Returns**: `{ fragments, loading, refetch }`

#### 4. Integration in MolecularBookkeepingPage
**`frontend/src/features/layout/MolecularBookkeepingPage.tsx`** (lines 640–650)
- Renders `<PredefinedFragmentMenu onAdd={handleAddPredefined} />` in `WorkingFragmentsStrip` header
- **`handleAddPredefined()`** (lines 204–208):
  ```typescript
  const handleAddPredefined = useCallback(
    (_name: string, smiles: string, molFile: string) => {
      createFragment('', smiles, molFile);
    },
    [createFragment],
  );
  ```
  - Calls `createFragment()` (same as draw-mode/SMILES-mode fragment creation)
  - Flow continues through **`MolecularBookkeepingPage.createFragment()`** → **`useFragments.createFragment()`** → **Backend `create_fragment()`** → **`fragments` table**

#### 5. Backend API — predefined_fragments.py
**`backend/app/api/predefined_fragments.py`**

**Used by frontend:**
- **`list_predefined_fragments()`** — GET `/api/v1/predefined-fragments/`:
  - Queries all `PredefinedFragment` rows, orders by `id`
  - Optional `search` query param: applies case-insensitive regex to `keywords` or `name` in Python (after fetching all)
  - Returns list of `PredefinedFragmentOut` (id, name, smiles, keywords, user_added)

**Backend-only (not called by any frontend UI):**
- **`create_predefined_fragment()`** — POST `/api/v1/predefined-fragments/`:
  - Receives `PredefinedFragmentCreate` (name, smiles, keywords)
  - Creates `PredefinedFragment` with `user_added=True`, commits, returns `PredefinedFragmentOut`
  - *Exists for admin/scripted population of the library; no frontend "Add to library" button*
- **`delete_predefined_fragment()`** — DELETE `/api/v1/predefined-fragments/{id}`:
  - Hard deletes row by `id`
  - *No frontend "Remove from library" UI; tested via `backend/tests/test_predefined_fragments_api.py`*


### Fragment Added — Next Steps
Once **"Add"** is clicked, the fragment is created in the exercise-specific `fragments` table via the standard `createFragment()` pipeline (documented in "Sending a drawn structure..."). The predefined library itself (`predefined_fragments` table) is **not modified** — it remains a shared read-only (mostly) library across all exercises.

---

## Validating an exercise through CAS

## Validating an exercise through drawing




## Editing the fragment

## Annotating the fragment

## Merge two fragments, to create a new one
## Merge to the fragment in the solution space

## Match a fragment to data in the table

## Sending a molecule to the Solution space

## Opening the SettingsPanel




## Opening the StatisticsPanel

## Apply reset

### History / Undo Integration (In-Memory + Automatic DB Persistence)

**In-memory recording** (immediate, in `MolecularBookkeepingPage.tsx`):
- **Create**: `history.record({ kind: 'create-fragment', fragmentId, fragLabel })`
- **Update**: `history.record({ kind: 'edit-fragment', fragmentId, fragLabel, before, after })`

**Automatic persistence to database** (handled by `HistoryContext.tsx`):
- Every `history.record()` call updates the in-memory logbook state (`allHistories[exerciseKey]`)
- A debounced effect (70ms) in `HistoryContext` automatically saves the entire logbook state to the backend via `saveLogbook()`
- **API**: PUT `/api/v1/logbook/?exercise_id=exercise-123`
  ```json
  {
    "entries_json": "[{...}, {...}]",
    "cursor": 5,
    "links_json": "[{...}, {...}]"
  }
  ```
- **Backend** stores this in `logbook_states` table (or equivalent):
  - `exercise_id` (string, e.g., "exercise-123")
  - `entries_json` (TEXT/JSONB — full serialized logbook entries array)
  - `cursor` (INTEGER — current position in undo/redo stack)
  - `links_json` (TEXT/JSONB — serialized peak-fragment links)
  - `updated_at` (TIMESTAMP)

**Loading on exercise switch**:
- `HistoryProvider` useEffect fetches logbook via `fetchLogbook(exerciseKey)` → GET `/api/v1/logbook/?exercise_id=...`
- Parses JSON into `entries`, `cursor`, `links` and hydrates in-memory state

**Undo/Redo also persists**:
- `undo()` / `redo()` / `jumpTo()` call `applyReverse` / `applyForward` which invoke the registered handlers (e.g., `deleteFragment`, `updateFragment`, `setSolution`) to reverse/replay the actual data mutations
- After each step, the updated logbook state (new cursor, potentially modified links) is auto-saved via the same debounced effect

**Clear logbook** (on exercise reset):
- `clearHistory()` → DELETE `/api/v1/logbook/?exercise_id=...` → clears `logbook_states` row
- Also clears in-memory state

---


