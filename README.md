# Molecular Merge and Match: Molecular Bookkeeping for Structural Analysis

An interactive NMR-based structure elucidation tool for university-level organic chemistry students. Students select molecular fragments, match them to peaks in 1H-NMR and 13C-NMR spectra, combine fragments into a complete molecule, and validate their answer against a teacher-defined solution.

Built originally for the Software Engineering course at Leiden University (2026).

## Install / uninstall instructions

Notes before installation:
- The application is not officially registered in any Windows/Apple/Ubuntu..etc respositories.
- This may result in warnings that the app is unsafe, particularly on macOS.
- Whether you choose an installer or a portable file, user data is always written. 
- The parent folders (AppData, Library, .config, .var) to userdata are usually hidden folders. It stores your exercises and progression here:

#### Local datapath
| OS                                     | Path                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Windows                                | `C:\Users\<username>\AppData\Roaming\molecular-merge-and-match\data\`               |
| MacOS                                  | `<user home directory>/Library/Application Support/molecular-merge-and-match/data/` |
| Linux (system packages and AppImage)   | `<user home directory>/.config/molecular-merge-and-match/data/`                     |
| Linux (flatpak)                        | `<user home directory>/.var/app/com.svdv.molecularmergeandmatch/data/`              |


To reset the local data, delete the contents of this folder; a new database `app.db` will be created here on application startup.

### Windows
- Download the Windows installer `.exe`.
- Open the installer. (if in Microsoft Edge:) If a warning pops up, click `...` -> `Keep`. After the second warning click on the dropdown next to `Delete` -> `Keep anyway`.
- Select if you want to install per-user (useful for managed laptops etc.) or system-wide (needs admin priveledges).
- Alternatively, a portable `.exe` is available.
- Install the app in the default location: `C:\Program Files\Molecular Merge and Match`. or any location you so desire.

### MacOS
- Download the MacOS installer `.dmg`.
- Open the `.dmg`file, a window will show up with the `Molecular Merge and Match`app and your `Applications` folder.
- Drag and drop the `Molecular Merge and Match` app onto the `Applications` icon to install the app.
- Navigate to the app, either through `Apps` in the taskbar or in the `Applications` folder in `Finder`.
#### The next step(s) is/are relevant for the first time opening the app.
- For the first time opening the app, right-click (ctrl+click on Mac) on the app, then choose `open`. This will likely bypass a security warning preventing you from opening the app.
    - If not, a warning will show up, letting you choose between `Move to Trash` or `Done`. Click `Done`.
    - Afterwards navigate to `System Settings`, and then to the `Privacy & Security` tab (you might need to scroll down).
    - In this tab, scroll down to the section `Security`, in which you will find `"Molecular Merge and Match" was blocked to protect your Mac.`.
    - Click on `Open Anyway` right next to this message. In the new popup, choose `Open Anyway` again, then enter your password.

### Linux
Command Line (un)install is recommended for all package formats since the app is not listed as an 'official' repository application.  
Choose whichever format is suitable to your liking, your distribution and package manager, or choose a containerized format.  
Using snap is not recommended and is only provided upon request.  
System packages: After install the application is available in the application viewer or by typing `molecular-merge-and-match` in the terminal.  
AppImage: a self-contained file, requires no installation, but does depend on host libraries.  
Flatpak: self-contained sandboxed installer (cross distribution), open in application viewer or through terminal.  
Good practice: run `sudo apt update` / `sudo pacman -Sy` etc first. It might be needed for succesful installation.  

#### GUI
- Download the Linux installer `.deb`,`.rpm`,`.AppImage`,`.flatpak`, or `.pacman`.
- Right-click on the downloaded file. Go to permissions and make sure it is set to open as an executable.
- Then either double click or right-click the package, click `Open With...`, then choose `Software Installer`.
- Install the package. It highly depends on the type of package and distribution if this will work or not.
#### CLI
- Download the Linux installer `.deb`,`.rpm`,`.AppImage`,`.flatpak`, or `.pacman`.
- Navigate in your terminal to the directory the packge file is in.
- Install (replace x.x.x with the version number):
- Go to the folder where the package is located, for example "Downloads": `cd ~/Downloads`

**.deb**: Debian / Ubuntu based distribtions using APT package manager:
```bash
sudo apt install ./molecular-merge-and-match-Setup-<version>.deb
     # uninstall (sudo apt purge can also be used)
sudo apt remove molecular-merge-and-match
```
**.rpm**: Fedora / Red Hat based distribtions using DNF package manager
```bash
sudo dnf install ./molecular-merge-and-match-Setup-<version>.rpm
     # uninstall
sudo dnf remove molecular-merge-and-match
```
**.rpm**: openSUSE using Zypper package manager
```bash
sudo zypper install ./molecular-merge-and-match-Setup-<version>.rpm
     # uninstall
sudo zypper remove molecular-merge-and-match
```
**.pacman**: Arch-based distributions using Pacman package manager  
.pacman is used, but is binary identical to .pkg.tar.zst the latter can be confused with an repository or general archive.
```bash
sudo pacman -U ./molecular-merge-and-match-Setup-<version>.pacman
     # uninstall
sudo pacman -R molecular-merge-and-match
```
**.AppImage** open: you can double click the file when this is applied in the file's permissions or run
```bash
chmod +x ./molecular-merge-and-match-Setup-<version>.AppImage
     # to open from CLI go the folder containing the file and type
./molecular-merge-and-match-Setup-<version>.AppImage
```
**.flatpak** sandboxed container will ask to install dependencies
```bash
flatpak install ./molecular-merge-and-match-Setup-<version>.flatpak
     # Flatpaks are available in the application viewer after install or run
flatpak com.ludev.molecularmergeandmatch
     # uninstall
flatpak uninstall com.ludev.molecularmergeandmatch
```
**.snap** Ubuntu (Canonical) proprietary container format, which is not completely self-contained.  
You NEED to install this through the terminal, otherwise it will not work.
```bash
sudo snap install ./molecular-merge-and-match-Setup-<version>.snap --dangerous
     # Snap packages are available in the application viewer after install or run
snap run molecularmergeandmatch
     # uninstall
snap remove molecularmergeandmatch
```

## Running the app

After installing, start **Molecular Merge and Match** from your application menu (Windows: Start menu, macOS: `Applications`, Linux: application viewer or `molecular-merge-and-match` in a terminal). The backend starts automatically with the app; no separate setup is needed.

## Study behaviour profile

The Study behaviour tab shows an average profile across completed exercises that have a statistics row and logbook data. Each axis is normalized to 0–1:

- **Concept mastery:** `1 / (incorrect validations + 1)`, multiplied by a difficulty weight: Easy 0.8, Medium 0.9, Difficult 1.0.
- **Calibration:** compares confidence (1–5, mapped linearly to 0–1) with the same accuracy formula. Exercises with confidence 0 are omitted from this axis.
- **Deliberation:** number of gaps longer than 20 seconds between consecutive logbook entries, divided by the number of entries.
- **Resilience:** starts at 1 for exercises with incorrect validations; subtracts 0.5 if a cheat activation is the first recorded event after an incorrect validation, 0.3 if the exercise is closed within 60 seconds after an incorrect validation, and `0.2 × hesitation` measured only on the entries after the first incorrect validation (backtracking after a failure). Exercises without incorrect validations are omitted.
- **Autonomy:** based on the proportion of included exercises marked as using cheats. The score falls linearly from 1 at a 0% cheat rate to 0 at 30%, and stays at 0 above 30%.

Cheat use at completion is recorded from the current cheat settings. Cheat activation events are recorded when cheats are switched from off to on during an active exercise, and exercise-close events are recorded for active, incomplete exercises. These timestamped events only exist from the version that introduced behavior-event tracking onward; older activity cannot be reconstructed.

### Study style profile (hexagon)

A second radar next to the metacognitive profile. Every corner is a "negative" style, so a low, evenly balanced web is the goal. The radius is drawn as `0.1 + 0.9 × value`, so a value of 0 still shows a small inner hexagon; hovering a dot shows the true value and hovering a label explains the style. It needs at least 5 included exercises. A shared toggle above both radars switches between **All exercises** and the **Last 20** completed exercises; it applies to both plots. Hovering the labels of the metacognitive profile also explains each axis.

Per-exercise inputs, all on a 0–1 scale (exercises without active time are skipped; confidence-based corners skip exercises with confidence 0):

- `a` accuracy = `1 / (incorrect validations + 1)` (same as the metacognitive profile)
- `c` confidence = `(confidence − 1) / 4`
- `d` difficulty = Easy 0, Medium 0.5, Difficult 1
- `k` cheats = 1 if cheats were used (same cheat check as the rest of the panel), else 0
- `rushed` = `1 − min(1, active minutes / 5)`; `slow` = 0 up to 20 minutes, then `1 − 20 / active minutes`. Active time is the sum of the `restarts` intervals (or completed − started when none exist). Five to twenty minutes counts as normal for any difficulty.
- `h` hesitation = `min(1, 2.5 × reversals / (entries + 3))`, where reversals are logbook entries that undo work (`delete-fragment`, `unlink`, `clear-links`, `clear-solution`) and entries are all logbook entries of the attempt. It is relative to the exercise's own size, so a 2-entry and a 50-entry exercise are comparable.

Each corner is the geometric mean of its conditions (a "high" condition uses the value, a "low" one uses `1 − value`), averaged over the included exercises:

| Corner | Formula | Meaning |
|---|---|---|
| Phantom | `(a · k · (1 − slow))^(1/3)` | accurate and quick, but with cheats |
| Dunning-Kruger | `(c · d · (1 − a))^(1/3)` | confident on hard exercises, yet inaccurate |
| Hidden genius | `((1 − c) · a · (1 − h))^(1/3)` | accurate and decisive, yet low confidence |
| Speed demon | `((1 − a) · rushed)^(1/2)` | fast and wrong |
| Perfectionist | `(a · (1 − k) · slow)^(1/3)` | accurate without cheats, but slow |
| Stubborn | `((1 − k) · (1 − a) · max(slow, h))^(1/3)` | wrong without help, with a long time or lots of undoing |

The calculations are in `frontend/src/features/statistics/metaCognitive.ts`.

## Statistics panel graphs and data

The Statistics panel loads exercise summaries from `GET /api/v1/exercises/summaries`. The backend combines exercise fields with the matching `statistics` row when one exists. Common fields used below include `Exercise.id`, `name`, `exercise_set`, `completed`, `due_time`; tags from the exercise/tag associations; and `Statistics.started_at`, `completed_at`, `timer_total`, `incorrect_count`, `cheats_used`, `cheats_off`, `difficulty`, `confidence`, `mastery_index`, `fragments_drawn`, `merges_done`, `matches_done`, and `dbe_set`. `has_statistics` identifies whether a statistics row was found. Example/reference summaries may therefore have exercise data without a statistics row.

Graphs that need action history also load `GET /api/v1/logbook/history`. Each `logbook_states` record contributes its `exercise_id`, `entries_json`, `restarts`, and `archived` fields. `entries_json` is parsed for timestamped action entries; `restarts` is parsed for timer start/stop intervals. These endpoints return data for the current local database; graph values are calculated in the frontend from the returned fields.

### Exercise overview

- **Contribution overview:** one cell per exercise summary. Colour is derived from `exercise_set`, `completed_at`, `incorrect_count`, `timer_total`, and the cheat check. Examples/References are grey; an exercise completed with cheats is yellow; completed without cheats is green; attempted but incomplete with errors is red; started/incomplete is blue; otherwise white.
- **Fastest/slowest solved exercises:** top ten exercises with `completed_at`, ranked by `timer_total`.
- **Most incorrect answers:** top ten summaries with `incorrect_count > 0`, ranked by that field.
- **Perfect streak:** counts completed exercises from newest to oldest until one has a nonzero `incorrect_count`.
- **Fragments, merges, matches, and DBE inputs:** totals of `fragments_drawn`, `merges_done`, `matches_done`, and `dbe_set`; averages divide each total by the number of exercises with `completed_at`.

### Progression

- **Activity over time:** daily stacked exercise counts based on `completed_at`, or `started_at` if not completed. Status is derived from `exercise_set`, `completed_at`, `incorrect_count`, and the cheat check. An exercise is shown as reviewed when its difficulty value has a success count greater than one and it was not completed with cheats. The overlaid line is the daily average `timer_total` per exercise. The chart begins at the oldest activity date (or at least six days before today) and extends through today.
- **Total progression / progression per exercise set / progression per tag:** progress bars count green and yellow (completed) statuses against the total tracked exercises. Examples and References are excluded. The adjacent numbers show correct without cheats / correct with cheats / attempted and incorrect / incomplete / total, followed by summed `timer_total`. Set grouping uses `exercise_set`; tag grouping uses tags marked for progression by the tags API, matched against `statistics_tags` (falling back to exercise tags).

### Study behaviour

- **Metacognitive profile:** averages the five scores described above. It uses completed summaries with a statistics row, a recognized difficulty and a non-archived logbook containing entries. Logbook entry timestamps and exercise start/completion times scope activity to the attempt. Incorrect validations come from non-baseline `StatisticsReviewEvent` rows (`exercise_id`, `reviewed_at`, `is_correct`); timestamped cheat activations and exercise closures come from `statistics_behavior_events` (`exercise_id`, `occurred_at`, `event_type`).
- **Time spent by time of day:** sums the durations of `restarts` intervals into 15-minute clock-time bins, split by Easy/Medium/Difficult. The chart uses the exercise `difficulty` summary to assign each interval's colour.

### Time distribution

- **Logbook events during completed exercises:** 20 bins show event positions across each eligible attempt's active duration, using timestamps in `entries_json` and the exercise `started_at`/`completed_at` fields. Stacked counts include create-fragment, link, merge-fragments and set-DBE actions. A rest is a gap longer than 30 seconds between consecutive logbook activity timestamps; it is placed at the gap midpoint. Pause counts come from timer `restarts` intervals, excluding the final interval stop. Paused wall-clock time is excluded when positioning events.
- **Completed exercises by time:** completed exercises are grouped by `timer_total`, rounded to the nearest 30 seconds. The stacked bar colour comes from the first letter of `difficulty` (E/M/D). The axis shows at least 10 minutes and caps at a final 60+ minute bin.
- **Rests duration:** counts the same >30-second logbook gaps as the event graph, by rounded 30-second duration bin and exercise difficulty. It uses the same 10-to-60+ minute display range as completed exercise time.

### Level analysis

- **Time per exercise level:** each point uses `timer_total`, difficulty and a `Level 0`–`Level 5` tag from exercise tags or `statistics_tags`. For each level the chart shows the mean time, mean absolute deviation (MAD), and individual exercise points, coloured by difficulty. It always shows all six level rows; the analysis appears once a level has at least three eligible points.

### Mastery List

The sortable table shows summaries with a non-null `difficulty`: exercise set/name, level tag, cheat status, `incorrect_count`, `confidence`, difficulty letter and success count encoded in the difficulty value (for example `E2`), `timer_total`, `mastery_index`, and exercise `due_time`.

### Spaced repetition

- **Exercises by due date:** counts summaries with a parseable exercise `due_time` into relative-day bins, coloured overdue / due within 30 days / later. Day 0 means the 24-hour period starting now.
- **Reviews:** daily review counts and cumulative review total come from `GET /api/v1/statistics/review-history`, which groups `statistics_review_events` by `reviewed_at` date and `status_at_review`, excluding rows where `is_baseline` is true. Daily stacks show Learning, Relearning, Young and Mature categories; the cumulative line uses all non-baseline review events in the returned daily totals. The selectable date range changes the displayed window, not the underlying database query.

The Reset tab contains actions rather than graphs. Its eligibility and targets are based on exercise summaries and the selected reset scope.

## For developers

Building from source, running the Docker stack, tests, CI/CD and the architecture are described in [docs/README-tech.md](docs/README-tech.md).

## License

MIT
