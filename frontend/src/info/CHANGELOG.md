## Molecular Merge & Match - Changelog

Releases are listed in reverse chronological order. Each release uses the
following sections as applicable: Added, Changed, Removed, Fixed, and Security.

### Versions in this document:  
- [v1.5.10](#v1510)
- [v1.5.0](#v150)
- [v1.4.0](#v140)
- [v1.3.0](#v130)
- [v1.2.1](#v121)
- [v1.1.2](#v112)
- [v1.1.0](#v110)
- [v1.0.0](#v100)

## v1.5.10
### Added
- NMRium integration, replacing the NMRGlue test bench. Press F2 (Command+F2 on macOS) to open the NMRium spectrum viewer in its own window.
- Press F8 (Command+F8 on macOS) to open the NMRium exercise-creation workflow. Load a Bruker dataset, pick and process the spectra, and the workflow stores the 1D peaks, multiplets and integrals as a draft that is saved to the database and restored the next time you open it.
- Spectra can be exported as SVG, previewed with an adjustable ppm range and integral position, and stored temporarily in the backend (`NMRiumtemp`) for use in the new exercise.
- The workflow continues with a Ketcher structure step and a summary page, which looks up the CAS number through PubChem and renders the structure with RDKit.
- Study behaviour statistics now include metacognitive and study-style profiles, with a choice between all exercises and the last 20.
- The statistics reset tools can reset exercises that are due for spaced repetition.

### Changed
- Resetting a logbook now invalidates and reloads cached history, preventing stale entries from returning. Switching exercises or loading history no longer triggers an unnecessary save.
- Large logbook saves no longer use `keepalive`, avoiding Chromium's 64 KiB request-body limit.

### Removed
- Removed the NMRGlue test bench (nmrglue and matplotlib preview); NMRium replaces it.

### Fixed
- Switching exercises no longer lets late fragment, working-solution, or spectrum responses overwrite the current exercise.
- Legacy database migrations now preserve statistics columns and their data when converting `cheats_used` to text.
- Failed logbook saves now display a warning.
- Closing the app no longer shows a false "timer could not be saved" warning; the timer save on close now sends the required request header.

### Security
- Updated Ketcher to 3.16.2 (pinned) and DOMPurify to 3.4.17, resolving all known runtime dependency vulnerabilities. CI now audits runtime npm and Python dependencies.
- Desktop builds now apply restricted permissions to data files and exclude local databases and uploads.
- Uploaded and rendered spectrum SVGs are sanitized.
- API requests are protected against cross-site requests through trusted-host validation and a required custom header on non-GET requests. Web deployments can configure trusted hosts with `ALLOWED_HOSTS`.
- Exercise uploads limit SVG text to 5 MiB and base64-encoded spectra to 10 MiB. PNG and JPEG files whose signatures do not match their extensions are rejected.

## v1.5.0
### Added
- Logbook states now record when an exercise is opened and closed, improving statistics for exercises worked on over multiple days.
- DBE values are recorded in the logbook and statistics, and DBE statistics are shown in the statistics panel.
- Statistics now include a time-of-day activity chart, due-date and review-history charts, a Mastery List, and Level analysis.
- Spaced repetition can be enabled in settings. It queues new and due exercises, advances after a correct solution, and lets users skip and defer an exercise; review intervals use time spent, incorrect attempts, cheat use, confidence, and difficulty.

### Changed
- Tags now use a “show” option instead of “hide.”
- Settings, Statistics, and Info panels have been updated.
- Solvents are displayed in two centered columns, grouped by whether they are in use.

### Fixed
- Solvent and tag counts have been restored.
- Workspace reset behavior, the logbook graph, and tag statistics have been fixed.
- The exercise menu now displays deletions correctly, lays out the tag list evenly, and avoids disruptive scrollbar and layout changes.
- Cheat-tag behavior has been corrected.

## v1.4.0
### Added
- A Statistics panel with fastest/slowest/most incorrect exercise lists; fragment, merge, and link totals and averages; exercise status and progression views; daily time/difficulty charts; and a logbook activity graph.
- Successful solutions show a blocking prompt for confidence and difficulty ratings.
- The Statistics panel's reset controls can target the current exercise, a set, a tag, an age range, a difficulty, or all exercises, and reset logbook, workspace, completion, or progression data—or delete selected exercises.
- An NMRGlue test bench opens with F8 (Command+F8 on macOS). Drop a Bruker <sup>1</sup>H or <sup>13</sup>C dataset folder to preview spectra after zero-filling, windowing, Fourier transformation, and automatic phasing, with pulse-program information.
- Exercise completion records which cheats were enabled, and upload progress is shown when importing exercises or patches.
- The “Show only incomplete exercises” toggle narrows the results after the selected exercise-set and tag filters are applied; it combines with those filters using AND, while tags retain their selected AND/OR mode.

### Changed
- Deuterated solvents in the References set now display subscripts in exercise names. Exercise names use natural sorting.
- Completion indicators now use SVG checkmarks, with distinct symbols for incorrect and halted exercises and a larger checkmark for completed sets.
- The molecular editor closes when clicking outside it. Molecules rendered in its View mode can be sent to the editor or Working Fragments.
- Cheats can be toggled with F7 (Command+F7 on macOS) or from the clickable cheat icon.
- Exercise completion, timer, and checkmark state was adapted to support statistics and partial resets. Previously completed exercises can be partially reset and attempted again; their round checkmark changes back to the earlier checkmark style.
- Predefined-fragment search keywords and synonyms were expanded without changing the fragment structures.
- The exercise-menu code was moved into its own file.

### Fixed
- Corrected the duplicate warning icon shown when linked fragments used too many atoms.
- Removed a redundant data fetch and reduced unnecessary API requests during statistics updates.
- The F11 key and fullscreen toggle button now work together in both directions.




## v1.3.0
### Added
- ZIP patch imports let users apply JSON patches to previously distributed exercises. A ZIP can include patch folders and SVG files to replace or add spectra.

### Changed
- Settings tabs now have icons.
- Importing an exercise with a soft-deleted tag now restores the existing tag instead of creating a duplicate.
- GitHub was reinstated for change tracking and installer builds, enabling ARM64 targets. Flatpak support was extended for stricter distributions such as Arch and Fedora, with builds made locally. Pacman packages (`.pkg.tar.zst`) can be built on GitHub runners and were tested on Artix. Snap support was added but is discouraged. Windows installers now support per-user installation and a portable option.
- The Example 1 INADEQUATE spectrum SVG was revised with larger text and heavier lines.

### Fixed
- Cheat-tag visibility now works in the exercise menu; the existing toggle filters cheat tags.
- Corrected the preloaded sucrose example: Fragment 1 is now annotated as alpha-glucopyranose and Fragment 2 as beta-fructofuranose, matching their structures.






## v1.2.1
### Added
- A Settings panel with Settings, Solvents, Tags, Cheats, Information, Changelog, and About tabs. Settings are saved in a user profile, with Default, Beginner, and Exam presets; Beginner enables more visual aids and cheats, while Exam hides most of them.
- Display controls for solvent and exchange annotations, manual CAS validation, the timer, warnings, missing-atom text, cheats, and single-exercise creation.
- Cheat options for NMR helper overlays; correct DBE; <sup>1</sup>H and <sup>13</sup>C atom counts; coupled <sup>13</sup>C multiplets and coupling constants; <sup>1</sup>H coupling constants; alternative-nuclei data; and spectrum data-source labels.
- ZIP-import CSV fields for exercise-name prefixes, coupled <sup>13</sup>C data, alternative-nuclei data, and <sup>1</sup>H/<sup>13</sup>C data sources. The prefix is combined with the exercise number; an empty `solvent` field now allows the solvent to be extracted separately from each spectrum's data text.
- Solvents and tags now use pre-seeded database entries and tokens. Settings let users choose preferred solvent names and hide or soft-delete tags; an Undo is available only while the Settings panel remains open.
- Alternative-nuclei data, such as <sup>19</sup>F, can be shown in a data table and used to match fragments.
- DBE is calculated and stored when an exercise is created, and the correct value is available to cheats.
- Markdown content for the Information, Changelog, and About sections.

### Changed
- The fullscreen control now uses inline arrow icons. The manual CAS validation control moved to the working-solution panel, and a Settings button was added.
- NMR and IR spectra now use normalized font handling to improve cross-platform rendering. Aptos remains the preferred NMR font; Ubuntu Sans is used for IR spectra and embedded with Noto Sans Mono.
- Formula parsing now strips trailing charges and ignores salt/adduct components after separators when calculating atom counts and DBE; the non-salt structure remains the target for exercises. Formula and DBE calculations were moved into a shared module.
- Timer, pause, and statistics logic were separated from the main bookkeeping page.
- Local build scripts for Linux/macOS and Windows reduce manual setup, support shell differences (for example, using `.` instead of `source`), and account for target architecture and build flags. Linux package targets are AppImage, deb, RPM, and Flatpak; macOS builds were not verified.
- The preloaded Example exercise and its spectra were updated; its molecular formula changed from `C4H8O2` to `C8H8O2`.

### Fixed
- Prevented warning symbols from flashing while switching exercises without disrupting timer statistics.
- Fixed overlapping peak highlights by merging their boxes before rendering.


## v1.1.2
### Added
- Exercise completion is saved for both CAS and structure answers, with a green checkmark beside completed exercises.
- Exercise timing and incorrect-attempt tracking record start and completion times, active time, and failed validations. Timing starts five seconds after opening; visits shorter than 20 seconds are ignored unless the exercise is completed or paused.
- A pause control and paused-screen overlay were added; clicking the overlay resumes the exercise, and pausing saves elapsed time.
- ZIP imports support up to two alternative CAS numbers for stereoisomers, and answer validation accepts the primary or either alternative CAS number.
- Additional spectra are displayed in their configured priority order.
- Pacman packages were added to the Linux release artifacts.

### Changed
- The exercise selector was widened to accommodate long names and completion checkmarks.
- The application page title is now “Molecular Merge & Match,” and the interface font changed to Ubuntu Sans.

### Fixed
- Fixed the double scrollbar shown when expanding the exercise list or opening exercise creation by increasing the layout height from 80vh to 85vh.
- Packaged builds now include `examples_seed.json`, matching the database seeder so preloaded examples are available.

## v1.1.0
### Added
- ZIP imports can contain multiple exercise-set folders, each with its own CSV file.
- Preloaded deuterated-solvent references, fragments for the ethyl acetate example, and solution structures for sucrose and the solvent references.
- Expanded the predefined fragment library with iodide, isobutane, nitromethane, and methyl azide.

### Changed
- Resized the header icon and molecular formula, displayed the current exercise name, and adjusted the regular and additional spectrum popups.
- DBE calculation now supports deuterium, phosphorus, boron, silicon, and tin.
- ZIP-import errors now identify the exercise-set folder, making it easier to locate the source of a failed row or file.

### Fixed
- Deuterium is displayed as D in molecular formulas, and formula comparison treats `[2]H` as hydrogen to avoid validation errors.

## v1.0.0
### Added
- Initial desktop release for NMR structure elucidation, with interactive <sup>1</sup>H and <sup>13</sup>C spectra, peak-to-fragment linking and merging, and CAS or structure validation against teacher-defined solutions.
- Exercise creation and ZIP import, a searchable predefined-fragment library, and per-exercise undo/redo history.
- Desktop installers for Windows, macOS, and Linux.
