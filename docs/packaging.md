# Packaging the app with electron-builder
This guide walks you through manually building the project into a distributed desktop application. Since we have a FastAPI backend and a React frontend, we bundle the Python backend as a **"Sidecar" executable**.
Note: `cd-electron.yml` automates this process through github actions.

---

## Step 1: Prepare the Python Backend for Freezing
Convert the Python code into a standalone binary so that users don't need Python installed.

1.  **Create a Build Entry Point:** In `backend/`, a file named `main_electron.py` is created. This ensures the app runs correctly when bundled.

2.  **Freeze with PyInstaller:**
    - Navigate to `backend/`
    - Create and enter a virtual environment.
    - Ensure that the regular requirements have been installed: `pip install -r requirements.txt`
    - Run:
    ```bash
    pip install pyinstaller

    pyinstaller --noconsole --collect-all rdkit --collect-all fastapi --collect-all uvicorn --name molecular-backend main_electron.py
    ```
    *   **Result:** You will have a `dist/molecular-backend` folder. Move the **entire contents** of this folder into a root-level folder named `resources/bin/`.

---

## Step 2: Build the Frontend
Electron needs a static build of the React app.

1.  Navigate to `frontend/`.
2.  Install dependencies: `npm install`.
3.  Make sure `frontend/public` exists, if not, create the folder, then run `npm run postinstall`.
4.  Run: `npm run build`.
5.  **Result:** A `frontend/dist/` folder containing `index.html` and assets.

---

## Step 3: Initialize the Electron Shell
In the **root** of the project (above `backend/` and `frontend/`), set up Electron.

1.  **Initialize npm:** `npm init -y`
2.  **Install Electron:** `npm install electron electron-builder --save-dev`

---

## Step 4: Configure `electron-builder`
- Make sure to remove `"directories": { "doc": "docs" }` from `package.json`, as syntax is deprecated and already specified in build.

---

## Step 5: Platform-Specific Packaging
Because the Python backend binary is OS-specific, we must perform the final build on the respective operating system.

| Target OS   | Action                                                                                            |
| :---------- | :------------------------------------------------------------------------------------------------ |
| **Windows** | Run `npm run dist` on a Windows machine (Run Powershell as Administrator). It generates a `.exe`. |
| **macOS**   | Run `npm run dist` on a Mac. It generates a `.dmg`.                                               |
| **Linux**   | Run `npm run dist` on Linux. It generates an `.deb`.                                              |

### Update icon.png in `build-assets/`
When packaging with electron-builder, it looks for an icon in `build-assets/`. The electron documentation gives guidelines for minimum file size and file type, but electron-builder seems to have trouble handling the icons. As a result, we use `.png` for Windows, and `.icns` for MacOS and Linux (configured in `package.json`).