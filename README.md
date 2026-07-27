## Go to [_Releases_](https://github.com/s0t0e0f0a0n/Molecular-Merge-and-Match/releases) and download your preferred installer!
 
## Get your exercise sets
Exercise Sets are available for download here:  <a href="https://s0t0e0f0a0n.github.io/Molecular-Merge-and-Match" target="_blank">📦 Download page</a>
### Update exercise sets
Whenever an updated exercise set is available this wil replace an older .zip file.  
Changes made to exercise sets (error corrections, updated data and pictures) will also be logged in a changelog.  
Currently it is not possible to overwrite existing exercises, so any changes made within newer versions of a .zip file can only be updated by removing the exercises or exercise sets from the software. When an update feature will be made available, this message will be removed. For now, you can use the .zip files with the minimum requirement of version: **v.1.0.0**.

### Upgrading from an earlier version
Uninstall the previously installed version if you have any.  
It is optional to remove the contents of the `molecular-merge-and-match` folder in your UserData. Removing resets your current progress completely, leaving it there retains your exercises and progress.  
The current minimal version to upgrade from while leaving the previous data intact is: **v.1.1.2**.  

### Local UserData path
You can find the local UserData files here:  
| OS      | Path                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Windows | `%APPDATA%\molecular-merge-and-match\` (Typically `C:\Users\<username>\AppData\Roaming\molecular-merge-and-match\` )|
| MacOS   | `<user home directory>/Library/Application Support/molecular-merge-and-match/`                                      |
| Linux   | `<user home directory>/.config/molecular-merge-and-match/`          (for AppImage, system packages .deb and .rpm)   |
| Linux   | `<user home directory>/.var/app/com.ludev.molecularmergeandmatch/`                (for flatpak)                     |


### Installation instructions

## Windows
- Download the Windows installer `.exe`.
- Open the installer. (On Microsoft Edge:) If a warning pops up, click `...` -> `Keep`. After the second warning click on the dropdown next to `Delete` -> `Keep anyway`.
- Install the app in the default location: `C:\Program Files\Molecular Merge and Match`.

### MacOS (ARM)
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
