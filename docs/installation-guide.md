# Installation instructions

## Windows
- Download the Windows installer `.exe`.
- Open the installer. (On Microsoft Edge:) If a warning pops up, click `...` -> `Keep`. After the second warning click on the dropdown next to `Delete` -> `Keep anyway`.
- Install the app in the default location: `C:\Program Files\Molecular Merge and Match`.

## MacOS (ARM)
- Download the MacOS installer `.dmg`.
- Open the `.dmg`file, a window will show up with the `Molecular Merge and Match`app and your `Applications` folder.
- Drag and drop the `Molecular Merge and Match` app onto the `Applications` icon to install the app.
- Navigate to the app, either through `Apps` in the taskbar or in the `Applications` folder in `Finder`.
### The next step(s) is/are relevant for the first time opening the app.
- For the first time opening the app, right-click (ctrl+click on Mac) on the app, then choose `open`. This will likely bypass a security warning preventing you from opening the app.
    - If not, a warning will show up, letting you choose between `Move to Trash` or `Done`. Click `Done`.
    - Afterwards navigate to `System Settings`, and then to the `Privacy & Security` tab (you might need to scroll down).
    - In this tab, scroll down to the section `Security`, in which you will find `"Molecular Merge and Match" was blocked to protect your Mac.`.
    - Click on `Open Anyway` right next to this message. In the new popup, choose `Open Anyway` again, then enter your password.

## Linux
### CLI
- Download the Linux installer `.deb`.
- Navigate in your terminal to the directory the `.deb` file is in.
- Install (replace x.x.x with the version number):
```
sudo apt install ./molecular-merge-and-match-Setup-x.x.x.deb
```
- Uninstall:
```
sudo apt remove molecular-merge-and-match
```
### GUI
- Download the Linux installer `.deb`.
- Navigate in your file explorer to the directory the `.deb` file is in.
- Right-click the `.deb` package, click `Open With...`, then choose `Software Installer`.
- Install the package.

# Local datapath
| OS      | Path                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| Windows | `C:\Users\<username>\AppData\Roaming\molecular-merge-and-match\data\`               |
| MacOS   | `<user home directory>/Library/Application Support/molecular-merge-and-match/data/` |
| Linux   | `<user home directory>/.config/molecular-merge-and-match/data/`                     |

To reset the local data, delete the contents of this folder; a new database `app.db` will be created here on application startup.