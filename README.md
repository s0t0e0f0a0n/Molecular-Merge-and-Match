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

## For developers

Building from source, running the Docker stack, tests, CI/CD and the architecture are described in [docs/README-tech.md](docs/README-tech.md).

## License

MIT
