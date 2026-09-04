# Molecular Merge & Match - Changelog

Changes and additions since release version 1.0.0 are grouped by:
1. Style/layout
2. Features
3. Functionalities
4. Bugfixes
5. Other

Version 1.1.0 is available, which contains the new features, but only the zip upload functionality change.

## Feature and file changes in Version 1.1.2

## 1. Style/layout additions and changes

### i. Header toolbar
Resized the icon and the molecular formula.  
Changed the title and alt title of the icon to Molecular Merge and Match.  
Changed the title of the html page to Molecular Merge & Match.  
Made the exercise selection button wider (so it can accommodate "dimethylsulfoxide-d6" and a checkmark), and changed border color.  
Added a timer and pauze button with hover-over effect (see functionalities).  
Added a completion checkmark (see functionalities).

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx  
                frontend/index.html



### ii. Additional spectra resized
Changed the zoom factor to +/- 20% in scroll mode, including initial zoom.  
Changed the size of the popup window (harmonised with regular H/C spectra) - approach a little different because the way the two popups come about and show data is different.  
Total width of the popup changed, aspect ration as DOM style changed to 2.5:1.  
Further tinkering with the padding of the tabs and the width of the image, to make the two popup (almost) identical. 

    Edited:     frontend/src/features/viewingSpectra/AdditionalSpectraPopup.tsx 


### iii. Regular H/C spectra zoom and popup adjusted
Changed the zoom factor to +/- 20% in scroll mode, including initial zoom.  
Changed the width of the C-NMR highlight to 2.5 ppm.  
Changed the size of the popup window (harmonised with additional spectra) - approach a little different because the way the two popups come about and show data is different.  
Required different padding for each side, and different when popup is active, using `attribute: isModal ? x : y`

    Edited:     frontend/src/features/viewingSpectra/SpectraPrototype.tsx


### iv. Changed visuals for .svg files
No code change, but all pictures are remade by me.  
- H-NMR and expansions in spectra have increased their linewith from 2.5 to 3.5, C-NMR from 2.5 to 3.0. Integrals from 3.0 to 4.0.
- The lines were not as sharp, appeared broken or pixalated, because the svg picture size was decreased in the software.
- The suggested font-family: "Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" for NMR spectra.
- TIP for the user: Aptos is a standard Windows 11 font, but seems embedded in office NOT installed on the system. Do this yourself, if you want.
- IR spectra have been redesigned.
- IR behaved poorly when Calibri was set as the standard font and when Calibri was absent (like in Linux), Ubuntu Sans took over.
- IR are now made using Ubuntu Sans. When changing to system-ui (Segoe UI Variable on Windows, SF Pro in mac) they still look good.
- The suggested font-family: "Ubuntu Sans, system-ui, sans-serif" for IR spectra.

### v. Zip Import additional spectra names
The hyphen in additional spectra file names, is now retained in the title.

    Edited:     frontend/src/features/exercises/ExerciseZipImport.tsx  

## 2. Feature additions and changes

### i. Database changes
Throughout this version, multiple changes were made that required additional tables or changing the existing database structure.

    Edited:     backend/app/db/models.py  
                backend/app/db/session.py  

### ii. More elements included in DBE calculation
The standard set of C, H, N, F, Cl, Br, I, has been complemented to include:
- mono-valent atom: deuterium `D, [2]H, [2H]` ([2]H is used by the molecular formula)
- tri-valent atoms: Phosphorous and Boron `P` and `B`
- tetra-valent atoms: Silicium and Tin `Si` and `Sn`
- Note that di-valent atoms `O, S, Se` do not impact the DBE


    Edited:     backend/app/api/warnings.py


### iii. Added more predefined fragments
The order and identiy of the fragments has been altered. Also tested was the halide ion instead of hydrogen halide, which works.  
Nitro, azide and hydroxide could not similarly be added as anions, so nitromethane, methyl azide, and water were used as precursors.

    Edited:     backend/data/predefined_fragments_seed.json

### iv. Added preloaded fragments
Example 2 has fragments preloaded when app.db is created.

    Edited:     backend/app/db/session.py  
    Created:    backend/data/preloaded_fragments_seed.json  

### v. Added predefined references
New references are spectra of deuterated solvents. Their entries are now created when app.db is created.  
The .svg files are located in the `references` folder, which had to be treated similar to `examples`, as a static mount.

    Edited:     backend/data/examples_seed.json  
                backend/app/main.py
                backend/app/api/exercises.py  
                frontend/vite.config.ts
    Created:    backend/data/references/  

### vi. Added preloaded solutions

The newly created references, and example 1 (sucrose) have their 'answer' preloaded when app.db is created.

    Edited:     backend/app/db/session.py
    Created:    backend/data/preloaded_solutions_seed.json










## 3. Functionality additions and changes


## 4. Bugfixes

### i. Displaying deuterium in molecular formula (title)
The deuterium has to be stored as `[2]H` in the database, MOL V2000 uses an isoptope line and SMILES uses `[2H]`  
The molecular formula is adjusted in the frontend by replacing the `[2]H` for `D`

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx  

### ii. Using deuterium in calculation error 
The atoms used currently are compared with the extracted ones from the molecular formula in the database.  
The formula will now treat deuterium as hydrogen and calculate correctly by replacing the `[2]H` for `H`.  
This does still show normal hydrogen isotopes in the molecular formula in the solution panel.  
But since deuterium is a hydrogen isotope, this detail is not of much importance.

    Edited:     backend/app/api/warnings.py 

### iii. Exercise window double scrollbar
When exercises list was expanded or a the exercise creation form was opened, a double scrollbar was visible.  
The outer most one wasn't doing anything. Fixed by increasing height from 80vh to 85vh.

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx  


## 5. Other changes

### i. Support for Fedora / Red Hat based Linux distributions (.rpm)
Ran `sudo apt install rpm` on Linux Mint, target `.rpm` was created without issues.  
Confirmed working on Nobara 43 (with KDE desktop)

    Edited:     /package.json

### ii. Listed markdown dependency for future use
Suspected use for markdown in certain information popups in the future, dependencies listed.

    Edited:     frontend/package-lock.json  
                frontend/package.json

### iii. Other seed files are also stored
Just as the previous seed files, the preloaded solutions and fragments are created everytime the app.db is deleted, or updated when a new version is installed.  
Redundant entries are removed from this list, exercises_seed.json has been renamed examples_seed.json

    Edited:     /main.js

### iv. Documentation on building application
The only way to get the build to succeed is to
- Reverse two steps in the documentations: first install electron-builder, THEN initiate. Otherwise dependencies are not included.
- do not run `npm audit fix` it breaks the build


    Edited:     docs/packaging.md



### 1.i. Checkmark when an exercise is marked as complete
Edited `backend/app/api/exercises.py`  
Edited `frontend/src/api/exercises.ts`  
Edited `frontend/src/features/layout/MolecularBookkeepingPage.tsx`  
Also associated test files were edited (copilot helped).  



### 2. ii. Alternative CAS numbers are included in ZipImport, stored in database.
Edited `frontend/src/features/exercises/exerciseImportUtils.ts`  
Edited `frontend/src/features/exercises/ExerciseZipImport.tsx`  
Two more CAS fields can be added in the .csv import file (through .zip). Usefull for stereoisomers.

### 2. iii. Alternative CAS numbers are included in answer validation
Edited `backend/app/api/exercises.py`  
Manual CAS validation now checks any of the three possible CAS numbers (2 optional).

### 2. iv. Sorting Additional Spectra
Edited `backend/app/api/exercises.py`  
Edited `backend/data/examples_seed.json`  
Edited `frontend/src/features/viewingSpectra/AdditionalSpectraPopup.tsx`  
Edited `frontend/src/api/exercises.ts`  
New and predefined examples' additional spectra will be assigned a predefined priority.  
The frontend will show the spectra according to this priority.

### 2. v. Completed exercises are marked as complete
Edited `backend/data/examples_seed.json`  
Edited `backend/app/api/exercises.py`  
Predefined examples (except example 2) are already complete.  
Both structure validation and CAS validation stores completion status.

### 2. vi. Statistics backend preparation
Edited `backend/app/api/exercises.py` 
Edited `backend/app/api/router.py` 
Created `backend/app/api/statistics.py`  
Edited `frontend/src/context/ExerciseDataContext.tsx`  
Edited `frontend/src/api/exercises.ts`  
A future statistics page will contain much information. Most of it is now set up.
- Start datetime of an exercise.
- Complete datetime of an exercise.
- Starting datetime of the current active exercise (5 second delay).
- Stopping datetime of the current active exercise (open les than 20 seconds is ignored).
- Duration of exercision is measured and added to already existing time. (even when finished within 20 seconds)
- Repeated incorrect validation is added to an incorrect count.
- A completed exercise does not overwrite or append these values


## File changes in Version 1.1.0


### 2. i. Manual Import changes
Edited `frontend/src/features/exercises/ExerciseCreationForm.tsx`  
Users can now enter a _regular_ CAS number and InChI in the Exercise Creation Form. This is then converted to an sha-256 hash.  
InChI is checked if it contains "InChI=" and if not it is appended to the front.

### 2. ii. Zip Import changes
Edited `frontend/src/features/exercises/ExerciseZipImport.tsx`  
Users can now upload a .zip file containing multiple folders.  
Each folder provides the name of the Exercise set and contains its own .csv






