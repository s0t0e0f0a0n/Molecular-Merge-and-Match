# Molecular Merge & Match - Changelog

Changes for each version are first summarized. At the end of the text the affected code is displayed.

## Version 1.1.0 - in progress
Implements the first feature updates
### 1. Stylistic changes
none

### 2. Feature implementation
- 1. Importing .zip file can contain multiple exercise sets 

### 3. Bugfixes
none

## Version 1.0.1

First round of minor changes.
<br /> Unreleased version

### 1. Stylistic changes
- 1. **_Header toolbar_**
- 2. **_Additional spectra resized_**
- 3. **_Enlarged (popup) of regular H/C spectra_**
- 4. Listed markdown dependency for future use

### 2. Feature implementation
- 1. Added extra database fields for future features
- 2. Added preloaded references
- 3. Added preloaded fragments
- 4. Added preloaded solutions
- 5. Added more predefined fragments
- 6. More elements included in DBE calculation

### 3. Bugfixes
- 1. Displaying deuterium in molecular formula (title)
- 2. Using deuterium in calculation error 


## Code changes in Version 1.1.0

- changed version
```json
// /package.json
  "name": "molecular-merge-and-match",
  "version": "1.1.0",
  "description": "Molecular Bookkeeping for Structural Analysis",
```


- changed zip import

ZipImport now loops over multiple folders contained in the zip file.

Update error messaging (4x in document) to include the folder name = exerciseSet
```bash
      failures.push(`Row ${i + 2} (${displayName}): #rest of statement
      # is replaced by
      failures.push(`${exerciseSet} - Row ${i + 2} (${displayName}): #rest of statement
```











## Code changes in Version 1.0.1


- changed version
```json
// /package.json
  "name": "molecular-merge-and-match",
  "version": "1.0.1",
  "description": "Molecular Bookkeeping for structural analysis",
```

### 1. i. Header toolbar

Changed the browser page title (visible in local development)

```html
<!-- /frontend/index.html -->
    <title>Stefan's playground</title>
```
Changed the icon size, and alt title, Resized molecular formula, and display current exercise name 
<br /> commented out the validate CAS for the time being
```bash
#frontend/src/features/layout/MolecularBookkeepingPage.tsx

```

### 1. ii. Additional spectra resized

```bash
#frontend/src/features/layout/MolecularBookkeepingPage.tsx

```


### 1. iii. Enlarged (popup) of regular H/C spectra

```bash
#frontend/src/features/layout/MolecularBookkeepingPage.tsx

```


### 1. iv. Listed markdown dependency for future use
This will be used to display some markdown pages in a help popup
```json
// /frontend/package-lock.json
  "packages": {
    "": {
      "dependencies": {
        "react-markdown": "^10.1.0"
      },
    },      
```
```json
// /frontend/package.json
  "dependencies": {
    "react-markdown": "^10.1.0"
  },
```

### 2. i. Added extra database fields for future features
- Tracking the completion status of exercises

```python
# /backend/app/db/models.py
class Exercise(Base):
    __tablename__ = "exercises"
#The following columns are added
    completed: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
    )
    start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
    )
    stop_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, default=None,
```

- Sorting the additional spectra by a predefined priority
```python
# /backend/app/db/models.py
class ExerciseAdditionalSpectrum(Base):
    __tablename__ = "exercise_additional_spectra"
#The following columns are added
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```
This info is already in the seed files so:
```python
# /backend/app/db/session.py
def _seed_exercises() -> None:
# this section is appended with the two new columns
            for s in example.get("additional_spectra", []):
                db.add(ExerciseAdditionalSpectrum(
                    exercise_id=exercise_id,
                    file_path=s["file_path"],
                    label=s.get("label"),
                    priority=s.get("priority") or 0, # new column
                ))
```
- Adding multiplicity information to <sup>13</sup>C data table.<br />
This is needed for coupled <sup>13</sup>C-spectra, in particular with <sup>2</sup>H, <sup>19</sup>F and <sup>31</sup>P

```python
# /backend/app/db/models.py
class ExerciseC13Peak(Base):
    __tablename__ = "exercise_c13_peaks"
#The following columns are added
    multiplicity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    j_values_hz_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
```
These new peaks are already present in seed files so:
```python
# /backend/app/db/session.py
def _seed_exercises() -> None:
# this section is appended with the two new columns
            for p in example.get("c13_peaks", []):
                db.add(ExerciseC13Peak(
                    exercise_id=exercise_id,
                    ppm=p["ppm"],
                    multiplicity=p.get("multiplicity"), #new column
                    j_values_hz_csv=p.get("j_values_hz_csv"), #new column
                    atom_count=p.get("atom_count"),
                    extra_info=p.get("extra_info"),
                ))
```

- User settings may later include a theme, a short/long/mix preference for solvent names.<br />
Also a different layout may be designed and be optional. User profile could be created (a second row).

```python
# /backend/app/db/models.py
class UserSettings(Base):
    __tablename__ = "user_settings"
#The following columns are added
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="light")
    layout_opt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    solvent_opt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

### 2. ii. Added preloaded references

More predefined examples under the category "references", which are all deuterated solvents, with `[2]H` representing a deuterium isotope
- Extension of `examples_seed.json`
- The <em>J</em>-coupled signals in <sup>13</sup>C-NMR are currently listed as seperate peaks.
- This could be adjusted later, It is usefull however to have a numerical reference of the individual peaks of the signal multiplets.
- Files mentioning the `/examples/` folder were appended with `/references/`
```python
# /backend/app/api/exercises.py
def _abs_path_to_url(path: str) -> str:
    """Convert an absolute upload path to a routable URL path served by the static mount."""
    # References folder added
    if path.startswith("/uploads/") or path.startswith("/examples/") or path.startswith("/references/"):
        return path
```
```python
# /backend/app/main.py
def create_app() -> FastAPI:
#added these lines
    Path("data/references").mkdir(parents=True, exist_ok=True)
    app.mount("/references", StaticFiles(directory="data/references"), name="references")

    return app
```
```bash
// frontend/vite.config.ts
server: {
      proxy: {
        '/references': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        },
      }
    },
```


### 2. iii. Added more predefined fragments

- Extension of `predefined_fragments_seed.json`

Predefined Fragments are not a necessity since they can be drawn by the editor. 
<br /> Some common functional groups and patterns could be desirable to include.
<br /> Examples would include the nitro group, tert-butyl group, iso-propyl group and the halides.
<br /> - In general, the editor strips an H-atom from both fragments and then combines them to a new fragment when merging.
<br /> - Halides can be conveniently added as their anion, but an anion like azide is not accepted. Methyl azide is provided instead.
<br /> - Similarly, the nitro group, drawn with an explicit hydrogen, or just as NO<sub>2</sub> cannot be merged. Nitromethane is provided instead.
<br /> - iso-Butane is a parent molecule for both iso-butyl and tert-butyl by choosing to merge on either the external or internal carbon atom.
```json
// /backend/data/predefined_fragments_seed.json
// Examples
[
  {"name": "Methyl azide", "smiles": "CN=[N+]=[N-]", "keywords": "azide"},
  {"name": "Nitromethane", "smiles": "C[N+]([O-])=O", "keywords": "nitro"}, 
  {"name": "i-Butane", "smiles": "CC(C)C", "keywords": "butane"},
  {"name": "Iodide", "smiles": "[I-]", "keywords": "iodide"}
]
```


### 2. iv. Added preloaded fragments

The Ethyl acetate example has fragments loaded
- Creation of `preloaded_fragments_seed.json`
<br /> The exercise_id field has an absolute value and refers to the newly added predefined examples

```json
// /backend/data/preloaded_fragments_seed.json
// Example of data input for ethyl acetate
	{
		"exercise_id" : "exercise-9",
		"label" : "Fragment 1",
		"smiles" : "C",
		"mol_file" : "\n     RDKit          2D\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n",
		"annotation" : "next to sp2"
	},
```
- Loading the contents in the database when first created.

```python
# /backend/app/db/session.py
#The following lines are added
def _seed_preloaded_fragments() -> None:
    """Insert preloaded fragments from seed file if table is empty."""

    db = SessionLocal()
    try:
        if db.query(Fragment).count() > 0:
            return
        seed_path = _get_seed_file_path("preloaded_fragments_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            frags = json.load(f)
        for frag in frags:
            db.add(Fragment(
                exercise_id=frag["exercise_id"], label=frag["label"],
                smiles=frag["smiles"], mol_file=frag["mol_file"],
                annotation=frag["annotation"],
            ))
        db.commit()
    finally:
        db.close()
# then add function to database initiation
def init_db() -> None:
    _seed_preloaded_fragments()
```

### 2. v. Added preloaded solutions

For the sucrose example the completed structure is shown.<br />
For all the solvent references the structure is shown
- Creation of `preloaded_solutions_seed.json`
<br /> The exercise_id field has an absolute value and refers to the newly added predefined examples (references)

```json
// /backend/data/preloaded_solutions_seed.json
// Example of data input for CDCl3 (chloroform-d)
	{
		"exercise_id" : "exercise-1",
		"smiles" : "ClC(Cl)([2H])Cl",
		"mol_file" : "\n     RDKit          2D\n\n  5  4  0  0  0  0  0  0  0  0999 V2000\n   -1.5000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    0.0000    1.5000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.0000   -1.5000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  2  3  1  0\n  2  4  1  0\n  2  5  1  0\nM  ISO  1   4   2\nM  END\n",
		"dbe" : 0
	},
```
- Loading  the contents in the database when first created.

```python
# /backend/app/db/session.py
from app.db.models import (WorkingSolution) #that class/table was missing in import
#The following lines are added
def _seed_preloaded_solutions() -> None:
    """Insert predefined answers from seed file if table is empty."""
    db = SessionLocal()
    try:
        if db.query(WorkingSolution).count() > 0:
            return
        seed_path = _get_seed_file_path("preloaded_solutions_seed.json")
        if not os.path.exists(seed_path):
            return
        with open(seed_path) as f:
            answers = json.load(f)
        for answer in answers:
            db.add(WorkingSolution(
                exercise_id=answer["exercise_id"], 
                smiles=answer["smiles"], 
                mol_file=answer["mol_file"],
                dbe=answer["dbe"],
            ))
        db.commit()
    finally:
        db.close()
# then add function to database initiation
def init_db() -> None:
    _seed_preloaded_solutions()
```
- The seedfiles are included to be preserved.



### 2. vi. More elements included for DBE calculation
Changed DBE calculation to included more elements
<br /> The DBE is calculated from the structure presented as solution

```python
# /backend/app/api/warnings.py
def calculate_dbe(atom_counts: dict[str, int]) -> float:
    c = sum(atom_counts.get(symbol, 0) for symbol in ["C", "Si", "Sn"])
    h = atom_counts.get("H", 0)
    n = sum(atom_counts.get(symbol, 0) for symbol in ["N", "P", "B"])
    x = sum(atom_counts.get(symbol, 0) for symbol in ["F", "Cl", "Br", "I", "D", "[2]H", "[2H]"])

    dbe = c + 1 - (h + x - n) / 2
    return dbe

```

### 3. i.. Displaying deuterium in molecular formula (title)

- Handeling of the <sup>2</sup>H isotope (deuterium), considering:
> Commonly displayed as "D", however the MOL block uses H with an additional ISO line and SMILES use [2H].
> <br /> Both SMILES and MOL are generated by drawing a structure and when fetched from the database.
> <br /> Molecular Formulae use [2]H by convention.
> <br /> DBE and missing/too many atoms check are based on the SMILES/MOL block and are matched with the predefined molecular formula.

Deuterium is stored as [2]H in the molecular formula field in the database.<br />
First, the displayed molecular formula gets a replace treatement
```bash
#frontend/src/features/layout/MolecularBookkeepingPage.tsx
              {selectedExercise.molecular_formula && (
                <span style={{ fontWeight: 500, color: '#555' }}>
                  {formatChemistryText(selectedExercise.molecular_formula.replace(/\[2\]H/g, 'D'))}
                </span>
              )}
```
### 3. ii. Using deuterium in calculation error 
The discrepancy between the SMILES and molecular formula creates warnings in the backend (400 Bad request)
```python
# /backend/app/api/warnings.py
def parse_formula(formula: str) -> dict[str, int]:
    # replace the deuterium isotope notation, with "D"still gives frontend error symbol.
    # replace with "H" avoids this
    formula = formula.replace("[2]H", "H") 
    #NOTE: this is the database formula, replacing [2H] for examples doesn't resolve errors
```

Other parts of this file need not be modified to work properly. (for example, the exclude H atom statements)
<br />Molecular formula for fragments and in solution space is not changed (displays "H"), but it is questionable if that is desired. 
<br />It only really occurs in supplied deuterated solvent references.


# Molecular Merge & Match - Future Feature Wishlist

## Functionalities

### Importing exercises
- Additional spectra are given a predefined priority and stored in the DB
- Carbon data can also contain multiplicity and coupling constants
- Manual input should allow direct CAS and InChI strings
- Manual input more constrains: pictures mandatory
- Change the data string input for zip and manual (13C-NMR and 13C NMR both allowed)
- SVG files are "treated"
  - font-family is replaced
  - all colors are made into variables to be handles by the frontend based on theme CSS

### Updating exercises
- Students can add and remove tags
- A update feature, which lets you correct mistakes in de DB as a student with retention of completion status
  - A zip file containing either CSV or json file and svg files.
  - Existing entries are matched based on solution hash (CAS !OR! InChI), no match, skip row
  - when a match is found replace all other information (including the other CAS of InChI field)
    - delete the data in H and C peaks and additional spectra tables for that exercise
    - and/or replace this data with new information
- Easier could be to just have an append feature, that adds additional spectra,
  - maybe also corrects existing svg files

### Handling exercises
- Completion status is marked by a green checkmark
- Students can bookmark spectra if they want to revisted them. Star icon next to delete, Star next to name
- Time-dependant exercises (for exams for example)
- Move validate CAS number elsewhere, maybe a cheat, or within solution space?

### Displaying spectra and table
- Additional spectra are ordered according to their DB priority
- Highlighting multiplet is based on their range + a little wider
<br /> this is problematic with how the data is stripped and stored
- Carbon shows multiplicity only when filled in

### Addition of an info / help / settings panel / cheats
- Credits and contact info
- Documentation on how to use to software
- Basic documentation of NMR
- Progress panel. this uses the HTML/CSS elements like `<progress>`
- It will show progress per tag and per set
- Reset progress per exercise, set or tag
  - Difference between resetting completion status and stored fragments and solutions
  - Factory reset: deletes all entries in every table (prefer to drop table)
- A dark, light, custom theme can be set
- Switched between different layouts
- Switched between user profiles (for layout!)

### Cheats - displays cheat symbol
- Validate CAS number
- Display correct DBE (calculated from molecular formula)
- Display coupling constants
- Blur/unblur (CSS) certain svg files or elements?

### Bugs
- Changing between exercises often shows a warning symbol. 
- Turn warnings off first, then switch, then turn on again?
- Dragging window in Linux massive scaling issue

### Display / layout
- Light and Dark and Custom theme layout CSS, all style elements replaced by js variables

## Change modes
### From structure elucidation to spectral assignment
- Structure is given in fragment list
- Each peak can be matched to individual atom
- How is the solution checked? Currently matches are stored in the logbook states

## Questions
Must DBE in database be a float? why not int ?
<br /> what exactly do these database time fields mean? `server_default=func.now(), onupdate=func.now()`
<br /> in # /backend/app/api/warnings.py the issue is resolved, but I can't see in this or related solution panel and warning files where THIS "formula" is retrieved, so it was a lucky shot.



            <label style={labelStyle}>Solution InChI text</label>
            <input
              value={solutionInchi}
              onChange={(e) => setSolutionInchi(e.target.value)}
              style={inputStyle}
              placeholder="Any text will be hashed with SHA-256 before submit"
            />
          </div>
          <div>
            <label style={labelStyle}>CAS number text</label>
            <input
              value={solutionCasNumber}
              onChange={(e) => setSolutionCasNumber(e.target.value)}
              style={inputStyle}
              placeholder="Any text will be hashed with SHA-256 before submit"


#also InChI= is added for safety
    const solutionInchiText = solutionInchi.trim();
    const solutionCasNumberText = solutionCasNumber.trim();
    const normalizedSolutionInchiText = solutionInchiText.startsWith("InChI=")
      ? solutionInchiText
      : `InChI=${solutionInchiText}`;
    const hashedSolutionInchi = solutionInchiText
      ? await hashTextToHex(normalizedSolutionInchiText)
      : null;
    const hashedSolutionCasNumber = solutionCasNumberText
      ? await hashTextToHex(solutionCasNumberText)
      : null;




async function hashTextToHex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}


      solution_inchi: hashedSolutionInchi,
      solution_cas_number: hashedSolutionCasNumber,



Priority list additional exercises

app/api/exercises.py

Defined new constant, lists all NMR techniques which could possibly be used here
```python
_ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME = {
    "ir": 1,
    "h-presat": 2,
    "h-31p-dec": 3,
    "h-19f-dec": 4,
    "psyche": 5,
    "c-bbdec": 6,
    "c-dept-135": 7,
    "c-gated": 8,
    "cosy": 9,
    "hsqc": 10,
    "hmqc": 11,
    "f": 12,
    "f-1h-dec": 13,
    "p": 14,
    "p-1h-dec": 15,
    "hmbc": 16,
    "h2bc": 17,
    "noe-diff": 18,
    "noesy": 19,
    "roesy": 20,
    "hoesy": 21,
    "tocsy": 22,
    "hsqc-tocsy": 23,
    "hsqc-hecade": 24,
    "inadequate": 25,
    "inadsym": 26,
}
```
```python

def _priority_for_additional_spectrum_filename(filename: str) -> int:
    stem = Path(filename).stem
    if not stem:
        return 0

    parts = stem.split("_")
    if len(parts) > 1:
        token = "_".join(parts[1:]).strip()
    else:
        token = stem.strip()

    normalized_token = token.lower().replace(" ", "")
    return _ADDITIONAL_SPECTRUM_PRIORITY_BY_NAME.get(normalized_token, 0)

```
```python
class AdditionalSpectrumOut(BaseModel):
    id: int
    file_path: str
    label: str | None
    priority: int #this is added

    model_config = {"from_attributes": True}
```
```python
def _to_response(row: Exercise) -> ExerciseOut:
     return ExerciseOut(       
            AdditionalSpectrumOut(
                id=s.id,
                file_path=s.file_path,
                label=s.label,
                priority=s.priority, #this is added
            )
            for s in row.additional_spectra
        ],
    )
```
```python
in 
@router.post("/", response_model=ExerciseOut, status_code=201)
def create_exercise(body: ExerciseCreate) -> ExerciseOut:
                db.add(
                    ExerciseAdditionalSpectrum(
                        exercise_id=exercise.id,
                        file_path=_upload_file_path_to_url(file_path),
                        label=spectrum.label,
                      #add the following
                        priority=_priority_for_additional_spectrum_filename(
                            spectrum.filename
                        ),
                    )
```






bufix in zip import
  // const rawLabel = filename.slice(prefix.length).replace(/[_-]+/g, " ").trim();
  const rawLabel = filename.slice(prefix.length).trim();

import { useWarning } from '../../context/WarningContext';
export function MolecularBookkeepingPage() {
  const { rdkit } = useRDKit();
  const { resetWarnings } = useWarning(); #this is added

  added

  useEffect(() => {
    resetWarnings();
  }, [selectedExerciseId, resetWarnings]);


in warningcontext.tsx

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type WarningContextValue = {
  warningsByType: WarningsByType
  setWarningResult: (warning: WarningResponse) => void
  resetWarnings: () => void #this is added
}

AI credits zijn op.
Enkele wijzigingen zijn gemaakt in
MolecularBookkeepingPage.tsx
WorkingSolutionPanel.tsx
useLinkedFragmentWarnings.ts


--
added .rpm to output --> tested on Nobara, it works

--

main.js appended


        // The data folder exists, but we must keep seed files up to date, without overwriting the user's custom app.db.
        const seedFiles = [
            'exercises_seed.json', 
            'exercise_h1_peaks_seed.json', 
            'exercise_c13_peaks_seed.json', 
            'predefined_fragments_seed.json',
            'preloaded_fragments_seed.json',
            'preloaded_solutions_seed.json'
        ];