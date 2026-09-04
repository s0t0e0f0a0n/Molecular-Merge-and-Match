## Molecular Merge & Match - Changelog

Changes and additions since release version 1.0.0 are grouped by:
1. Style/layout
2. Features
3. Smaller functionality updates
3. Bugfixes
4. Other


## Feature and file changes in Version 1.1.2

## 1. Style/layout additions and changes

### i. Header toolbar
Resized the icon and the molecular formula.  
Changed the title and alt title of the icon to Molecular Merge and Match.  
Changed the title of the html page to Molecular Merge & Match.  
Made the exercise selection button wider (so it can accommodate "dimethylsulfoxide-d6" and a checkmark), and changed border color.  
Added a timer and pause button with hover-over effect (see functionalities).  
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
Changed the size of the popup window (harmonised with additional spectra) - approach a little different because the way the two popups come about and show data is different.  
Required different padding for each side, and different when popup is active, using `attribute: isModal ? x : y`

    Edited:     frontend/src/features/viewingSpectra/SpectraPrototype.tsx


### iv. Changed visuals for .svg files
No code change, but all pictures are remade by me.  
- H-NMR and C-NMR spectra have increased their linewith from 2.5 to 3.0, expansions from 2.5 to 3.5. Integrals from 3.0 to 4.0.
- The lines were not as sharp, appeared broken or pixalated, because the svg picture size was decreased in the software, this is more prevalent on low-res displays.
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

### ii. Zip Import changes
Users can now upload a .zip file containing multiple folders.  
Each folder provides the name of the Exercise set and contains its own .csv

    Edited      frontend/src/features/exercises/ExerciseZipImport.tsx  


### iii. Statistics backend preparation, including pauzing an exercise
  
A future statistics page will contain much information. Most of it is now set up.
- Start datetime of an exercise.
- Complete datetime of an exercise.
- Starting datetime of the current active exercise (5 second delay).
- Stopping datetime of the current active exercise (open les than 20 seconds is ignored).
- Duration of exercision is measured and added to already existing time. (even when finished within 20 seconds)
- Repeated incorrect validation is added to an incorrect count.
- A completed exercise does not overwrite or append these values.
- Pauzing an exercise will write to the total spent time.


    Edited      backend/app/api/exercises.py
                backend/app/api/router.py
                frontend/src/context/ExerciseDataContext.tsx
                frontend/src/api/exercises.ts
                frontend/public/coffee.svg
    Created     backend/app/api/statistics.py  

### iv. Checkmark when an exercise is marked as complete
When an exercises is succesfully completed (CAS or drawing), this is stored in the database and a visual green checkmark appears next to the exercise name.

    Edited      backend/app/api/exercises.py
                frontend/src/api/exercises.ts
                frontend/src/features/layout/MolecularBookkeepingPage.tsx  



### ii. More elements included in DBE calculation
The standard set of C, H, N, F, Cl, Br, I, has been complemented to include:
- mono-valent atom: deuterium `D, [2]H, [2H]` ([2]H is used by the molecular formula)
- tri-valent atoms: Phosphorous and Boron `P` and `B`
- tetra-valent atoms: Silicium and Tin `Si` and `Sn`
- Note that di-valent atoms `O, S, Se` do not impact the DBE


    Edited:     backend/app/api/warnings.py













## 3. Functionality updates

### i. Manual Import changes
Users can now enter a _regular_ CAS number and InChI in the Exercise Creation Form. This is then converted to an sha-256 hash.  
InChI is checked if it contains "InChI=" and if not it is appended to the front.

    Edited      frontend/src/features/exercises/ExerciseCreationForm.tsx

### ii. Alternative CAS numbers.
For molecules with chiral centers, the different isomers have different CAS numbers.  
Users draw enantiomers without explicit chirality, bu when manually inserting a CAS number the R-, S-, isomer, or racemate can be filled in.  
Thes three are now included in the ZipImport, stored in database and included in answer validation.  
Manual CAS validation now checks any of the three possible CAS numbers (2 optional).  
Other isomers (diastereo-isomers) can have many more forms, so these type of exercises rarely exists.  
When they do, it is preferred to have no more than three isomers (for example tartaric acid, RR, SS and the meso SR/RS, beware that racemic and undefined versions of tartaric acid also exist and have a CAS number).

    Edited      frontend/src/features/exercises/exerciseImportUtils.ts
                frontend/src/features/exercises/ExerciseZipImport.tsx
                backend/app/api/exercises.py


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

### vii. Sorting Additional Spectra
New and predefined examples' additional spectra will be assigned a predefined priority.  
The frontend will show the spectra according to this priority.

    Edited      backend/app/api/exercises.py
                backend/data/examples_seed.json
                frontend/src/features/viewingSpectra/AdditionalSpectraPopup.tsx
                frontend/src/api/exercises.ts  


## 4. Bugfixes

### i. Displaying deuterium in molecular formula (title)
The deuterium has to be stored as `[2]H` in the database, MOL V2000 uses an isoptope line and SMILES uses `[2H]`  
The molecular formula is adjusted in the frontend by replacing the `[2]H` for `D`

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx  

### ii. Using deuterium in calculation error 
The atoms used currently are compared with the extracted ones from the molecular formula in the database.  
The formula will now treat deuterium as hydrogen and calculate correctly by replacing the `[2]H` for `H`.  
This does still show normal hydrogen isotopes in the molecular formula in the solution panel.  
But since deuterium is a hydrogen isotope and only really used in the references, this detail is not of much importance.

    Edited:     backend/app/api/warnings.py 

### iii. Exercise window double scrollbar
When exercises list was expanded or the exercise creation form was opened, a double scrollbar was visible.  
The outer most one wasn't doing anything. Fixed by increasing height from 80vh to 85vh.

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx  


## 5. Other changes

### i. Support for Flatpak and Fedora / Red Hat based Linux distributions (.rpm)
Ran `sudo apt install rpm` on Linux Mint, target `.rpm` was created without issues.  
Confirmed working on Nobara 43 (with KDE desktop).  
Flatpak is a sandboxed/container format and required a few tweaks. (confirmed working on Nobara 43 and Linux Mint 22.2)

    Edited:     main.js
                package.json
                backend/main_electron.py


### ii. Other seed files are also stored
Just as the previous seed files, the preloaded solutions and fragments are created everytime the app.db is deleted, or updated when a new version is installed.  
Redundant entries are removed from this list, exercises_seed.json has been renamed examples_seed.json

    Edited:     /main.js






# Version 1.2.1
Changes since version 1.1.2

## 1. Style/layout additions and changes

### i. Fullscreen button change
Instead of a button with text, inline svg is used to show minimalstics arrows.

    Edited      frontend/src/components/FullscreenButton.tsx

### ii. Fonts, spectra, and information
- Information, like this changelog, has been added in the form of Markdown files. Support for markdown and a few markup plugins has been imported. Whether this will be kept in the future, or turned to standard html markup is not yet certain.  
- Spectral SVG files are made using MestreNova for NMR spectra and using Microsoft Excel for the IR spectra. This presets certain fonts in both cases, which would have to be manually changed to also include other fonts in the font-family that are deemed suitable for displaying the spectra.
This proces has been made redundant for all the NMR spectra and IR spectra, by manipulating the SVG files through string replacement of an inline SVG, instead of displaying them directly as an image (which was the case for the additional spectra). The prefered font choice for NMR-spectra is still `Aptos`, which is Microsoft-owned.
- For IR spectra, the proces has been optimized by making the files using `Ubuntu Sans` as the standard font. In absence of this font, the standard system-ui fonts for Windows and macOS fit perfectly in place of `Ubuntu Sans`, the other way round did not!
- To harmonize fonts between operating systems, the free to distribute `Ubuntu Sans` has been selected as standard display font and has been embedded in the software. First as a few different static fonts, and in the most recent update variable (.ttf and .woff2) fonts have been embedd.
Monospace font `Noto Sans Mono` is similarly embedded.


    Edited      frontend/index.css
                frontend/package.json
                frontend/src/vite-env.d.ts
                frontend/src/components/StereoChoicedialog.tsx
                frontend/src/components/FragmentList.tsx
    Created     frontend/src/ABOUT.md
                frontend/src/CHANGELOG.md
                frontend/src/INFOR.md
                frontend/src/fonts/
                frontend/src/fonts/UbuntuSans-Italic-VarFont.ttf
                frontend/src/fonts/UbuntuSans-Italic-VarFont.woff2
                frontend/src/fonts/UbuntuSans-VarFont.ttf
                frontend/src/fonts/UbuntuSans-VarFont.woff2
                frontend/src/fonts/NotoSansMono-VariableFont_wdth,wght.ttf
                frontend/src/fonts/NotoSansMono-VariableFont_wdth,wght.woff2
                frontend/src/features/viewingSpectra/svgFontOverride.ts

### iii. Layout updates
Minor layout updates include moving the manual CAS validation to the working solution panel, and the addition of a settings button.

    Edited      frontend/src/features/layout/MolecularBookkeepingPage.tsx
    Created     frontend/public/use_cheats.svg



## 2. Feature additions and changes

### i. Settings and cheats panel
A settings panel is introduced with multiple tabs (settings, solvents, tags, cheats, information and about). Each of these will be explained further separately, besides information and about.  
Settings are stored as a user profile and presets can be loaded (default, beginner and exam).  
The beginner preset has more visual aids and cheats already enabled, whereas the more advanced exam preset hides almost everything.

    Edited      frontend/src/features/layout/MolecularBookkeepingPage.tsx
                frontend/src/api/settings.ts
                frontend/src/api/exercises.ts
                frontend/src/types/peak.ts
                frontend/src/hooks/useLinkedFragments.ts
                backend/app/api/router.py
                backend/app/api/settings.py
                backend/app/api/exercises.py
    Created     frontend/src/settings/SettingsPanel.tsx
                frontend/src/settings/settingStyles.css
                frontend/src/hooks/useCheating.ts
                frontend/src/hooks/useHighlighting.ts
                frontend/src/api/solvents.ts
                frontend/src/api/tags.ts
                backend/app/api/solvents.py
                backend/app/api/tags.py
                backend/app/core/solvent_tokens.py
                backend/app/core/tag_tokens.py

### ii. Settings: display options
- <sup>1</sup>H and <sup>13</sup>C spectra contain various pieces of text. "Exchanges with D<sub>2</sub>O" and "solvent" are two text strings which can be hideen by manipulation of the inline svg
- Show or hide the manual (CAS number) validation tool
- Show or hide the exercise timer
- Show or hide warning symbols when too many atoms are merged or linked
- Show or hide the informative text which atoms are missing
- Enable or disable the use of cheats
- Select a predefined preset for the settings (and cheats)


### ii. Cheats: Coupled <sup>1</sup>H and <sup>13</sup>C spectra display options
When <sup>13</sup>C-NMR spectra are coupled with <sup>2</sup>H, <sup>19</sup>F, <sup>31</sup>P etc. This information is now stored, and optionally visualized.  
The .csv file has an additional column of multiplet data for <sup>13</sup>C-NMR. Every multiplet receives a manual 'atom tag'.  
The atom tag is also listed in peak data `ppm (atom count, atom tag)` for example: `102.3 (1C, 2), 101.5 (1C, 2)`.  
These two peaks have the same atom tag. The atom count is an integer followed by "C", it is almost always absent and having the "C" distinguises atom count from tag.  
The new multiplet data and atom tag relation is stored in the database in a similar way as for <sup>1</sup>H data,  
however peaks and multiplets have seperate tables, since coupled <sup>13</sup>C spectra aren't very common.  
In standard view settings, users will only see a peaklist without multiplet info.  
When "cheats" are activated, users can turn on 
- the multiplicity information for coupled <sup>13</sup>C-NMR specttra in the datatable
- view the coupling constants in the <sup>13</sup>C-NMR datatable
- view the coupling constants in the <sup>1</sup>H-NMR datatable

### iii. Cheats: overlays, DBE, atom count, alt nuclei and data source
More cheat options enable:
- Helper overlays displaying the most common areas in NMR spectra
- Always show the correct DBE value, users cannot input their own DBE any longer
- show the "integration" of the <sup>1</sup>H-NMR signals, as well as those for <sup>13</sup>C-NMR. The latter will nearly always display "1C", unless two different carbon atoms resonate at exactly the same frequency.
- show the data source of the NMR spectra. This is considered a cheat for now, as one can look up the title description in the raw data folder and possibly find the answer to the exercise.
- Alternative NMR-active nuclei with data entries are visible as a datatable (see functionalities) 

## 3. Functionality updates

### i. Change in calculation of the DBE and molecular formula
The stored molecular formula can in rare occasions contain charges or salts.  
Salts are recommended to be stored as C<sub>2</sub>H<sub>7</sub>N &bullet; HCl as an example for ethylamine hydrochloride.  
The free base is the interesting part and is expected to be solved, the salt part doesn't have to be drawn.  
Formerly the dot and spaces are stripped, but this leads to incorrect atom counts and DBE calculation.  
The new version disregards everything after the &bullet; .  
In the event Sodium salts are measured, this will be displayed in the spectral title (solvent line) instead OR Sodium and Potassium will be made exempt from the previous ruling. 
However, the user is still asked to draw the non-salt structure and therefore also refraining from sodium salts in the title is considered good practice.

DBE is now also calculated and stored in the database on exercise creation. The 'true' DBE will be used in cheats.
All the calculations have been moved to a separate file from which the warnings and exercises make use.

    Edited:     backend/app/api/warnings.py  
                backend/app/api/exercises.py
    Created:    backend/app/core/calculation.py

### ii. ZIP import handeling and addition of more data fields
In addition to the standard fields already present, the following columns are added
- Prefix
- <sup>13</sup>C coupled NMR data
- Alternative nuclei data
- Datasources for both <sup>1</sup>H and <sup>13</sup>C spectra

Instead of giving every exercise the generic label "Exercise" followed by their iterative ID number, the prefix column will contain the name of the exersizes, then followed by their ID number.  
The other three columns are usefull additions which will be available through cheats and settings.
In addition, the column `solvent` will now be allowed to be empty. When it is empty, the solvent is extracted from the data text, so to allow different solvents for <sup>1</sup>H and <sup>13</sup>C spectra respectively.

    Edited      exercises.py

### iii. Pause button and timer come from separate file
The pause button, timer and statistics logic is now placed in its own file instead of the larger MolecularBookkeepingPage.tsx.

    Created     frontend/src/TimingPanel.tsx

### iv. Solvent and tags are pre-seeded: visibility setting
A list of solvents and tags, with their preferred display options is pre-seeded into the database.  
When exercises are loaded, the existings tags and solvents in the .csv file are replaced by tokens matching to the stored solvents and tags.  
In the Settings, you can select which of the several (2 - 4) display names of each solvent you prefer.  
In Settings, you can select which tags you want to hide and which you want to completely delete.

    Edited      backend/app/db/session.py
                backend/app/db/models.py
    Created     backend/data/solvent_seed.json
                backend/data/tags_seed.json

### v. Alternative nuclei
The data string for alternative nuclei (like <sup>19</sup>F) is stored in the database, and can through cheats be added to the datatable.  
In addition, these alt nuclei can now be used to match with fragments. There is no direct spectrum to show peak highlighting, but a match from the datatable can be made.


## 4. Bugfixes

### i. Flashing warning symbols
When switching exercises sometimes the warning symbols would briefly be shown, due to the when the current exercise components are closed and the new ones are loaded.
The previous fix would interfere with the timer statistics, a more simplistic fix was implemented and preserves the timing functionality.

    Edited      frontend/context/ExerciseDataContext.tsx

### ii. Overlapping highlighting
When multiple peaks are matched, or when <sup>13</sup>C J-coupled peaks collapse to a multiplet (activated through cheats), overlapping highlighting creates additive translucency.  
The additive behaviour is fixed to merge peak highlight boxes before rendering.  
Highlight is moved to a seperate hook file.

    Edited:     frontend/src/features/layout/MolecularBookkeepingPage.tsx
                frontend/src/features/viewingSpectra/SpectraPrototype.tsx
    Created:    frontend/src/hooks/useHighlighting.ts


## 5. Other changes

### i. Listed markdown dependency
For use in Information, Changelog and About sections. This might be converted to XML/HTML at some point for a little more flexible (inline) styling.

    Edited:     frontend/package.json
                frontend/src/vite-env.d.ts


### ii. Making the build more universal, and automated
Several aspects of the build required manual copying files or text edits.  
Some of these workflow aspects were not essential when a few files where stored differently from the start.  
Some of these workflow aspect did not succesfully create a macOS or flatpak installer.  
Automated shell scripts (.sh in Linux/macOS, .bat in Windows) have been made and generalised to apply in all shells (replacing `source` with `.` for example).
macOS is currently not entirely verified (by lack of dedicated macOS hardware, wether it be Intel or ARM).
The different automation files can take certain requirements into consideration, like the targeted architecture, or flags like "noconsole".  
The latter was essential te remove for macOS.

    Edited:     main.js
                package.json
                backend/main_electron.py
    Created:    build-assets/entitlements.mac.plist (might not be needed!)
                build.bat
                build.sh
                build_mac.sh
                local_dev.bat










All NEW files

    Created     backend/app/api/solvents.py
                backend/app/api/statistics.py
                backend/app/api/tags.py
                backend/app/core/calculation.py
                backend/app/core/solvent_tokens.py
                backend/app/core/tag_tokens.py
                backend/app/data/references/ (bunch of spectra here)
                backend/app/data/prelladed_fragments.json
                backend/app/data/preloaded_solutions.json
                backend/app/data/solvent_seed.json
                backend/app/data/tags_seed.json
                frontend/public/coffee.svg
                frontend/public/use_cheats.svg
                frontend/src/api/solvents.ts
                frontend/src/api/tags.ts
                frontend/src/features/settings/SettingsPanel.tsx
                frontend/src/features/settings/settingsStyles.css
                frontend/src/features/statistics/TimingPanel.tsx
                frontend/src/features/viewingSpectra/svgFontOverride.ts
                frontend/src/fonts/UbuntuSans-Italic-VarFont.ttf
                frontend/src/fonts/UbuntuSans-Italic-VarFont.woff2
                frontend/src/fonts/UbuntuSans-VarFont.ttf
                frontend/src/fonts/UbuntuSans-VarFont.woff2
                frontend/src/fonts/JetBrainsMono-Italic[wght].ttf
                frontend/src/fonts/JetBrainsMono-Italic[wght].woff2
                frontend/src/fonts/JetBrainsMono-[wght].ttf
                frontend/src/fonts/JetBrainsMono-[wght].woff2
                frontend/src/fonts/NotoSansMono-VariableFont_wdth,wght.ttf
                frontend/src/fonts/NotoSansMono-VariableFont_wdth,wght.woff2
                frontend/src/hooks/useCheating.ts
                frontend/src/hooks/useHighlighting.ts
                frontend/tests/features/viewingSpectra/AdditionalSpectraPopup.test.tsx
                build.bat
                build.sh
                build_mac.sh
                local_dev.bat

All edited files between 1.0.0 and 1.1.2

    Edited      main.js
                package.json
                backend/main_electron.py
                backend/app/main.py
                backend/app/api/exercises.py
                backend/app/api/router.py
                backend/app/api/warnings.py
                backend/app/db/models.py
                backend/app/db/session.py
                backend/data/examples_seed.json
                backend/data/predefined_fragments_seed.json
                backend/tests/conftest.py
                backend/tests/test_exercises_api.py
                frontend/index.html
                frontend/package.json
                frontend/vite.config.ts
                frontend/src/main.tsx
                frontend/src/api/exercises.ts
                frontend/src/components/Layout.tsx
                frontend/src/components/ExerciseDataContext.tsx
                frontend/src/context/WarningContext.tsx
                frontend/src/features/exercises/ExerciseCreationForm.tsx
                frontend/src/features/exercises/exerciseImportUtils.ts
                frontend/src/features/exercises/ExerciseZipImport.tsx
                frontend/src/features/layout/LoadingExerciseOverlay.tsx
                frontend/src/features/layout/MolecularBookkeepingPage.tsx
                frontend/src/features/molecule/PredefinedFragmentMenu.tsx
                frontend/src/features/solution/WorkingSolutionPanel.tsx
                frontend/src/features/viewingSpectra/AdditionalSpectraPopup.tsx
                frontend/src/features/viewingSpectra/SpectraPrototype.tsx
                frontend/src/hooks/useLinkedFragmentWarning.ts
                frontend/tests/features/exercises/ExerciseCreationForm.test.tsx
                frontend/tests/features/layout/MockExercises.ts
                frontend/tests/features/layout/MolecularBookkeepingPage.test.tsx


All edited files between 1.1.2 and 1.2.1


    Edited      main.js
                package.json
                .github/workflows/cd-electron.yml
                backend/main_electron.py
                backend/app/api/exercises.py
                backend/app/api/router.py
                backend/app/api/settings.py
                backend/app/api/statistics.py
                backend/app/api/warnings.py
                backend/app/db/models.py
                backend/app/db/session.py
                backend/data/examples_seed.json
                backend/data/preloaded_fragments_seed.json
                backend/data/preloaded_solutions_seed.json
                backend/data/solvent_seed.json
                backend/data/tags_seed.json
                backend/tests/conftest.py
                backend/tests/test_exercises_api.py
                backend/tests/test_warnings.py
                frontend/index.html
                frontend/index.css
                frontend/package.json
                frontend/vite.config.ts
                frontend/src/main.tsx
                frontend/src/vite-env.d.ts
                frontend/src/api/exercises.ts
                frontend/src/api/settings.ts
                frontend/src/components/FragmentList.tsx
                frontend/src/components/FullscreenButton.tsx
                frontend/src/components/Layout.tsx
                frontend/src/components/StereoChoiceDialog.tsx
                frontend/src/components/ExerciseDataContext.tsx
                frontend/src/features/exercises/ExerciseCreationForm.tsx
                frontend/src/features/exercises/exerciseImportUtils.ts
                frontend/src/features/exercises/ExerciseZipImport.tsx
                frontend/src/features/layout/MolecularBookkeepingPage.tsx
                frontend/src/features/linking/LinkInheritOptionsPopup.tsx
                frontend/src/features/linking/PeakTableColumn.tsx
                frontend/src/features/linking/WorkingFragmentStrip.tsx
                frontend/src/features/molecule/PredefinedFragmentMenu.tsx
                frontend/src/features/solution/WorkingSolutionPanel.tsx
                frontend/src/features/viewingSpectra/AdditionalSpectraPopup.tsx
                frontend/src/features/viewingSpectra/SpectraPrototype.tsx
                frontend/src/features/warning/WarningPanel.tsx
                frontend/src/types/peak.ts
                frontend/tests/features/exercises/ExerciseCreationForm.test.tsx
                frontend/tests/features/layout/MockExercises.ts
                frontend/tests/features/layout/MolecularBookkeepingPage.test.tsx
