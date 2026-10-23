#!/bin/bash
set -e # Exit immediately if any command fails

case "$(uname -s)" in
    Darwin) OS_NAME="macOS" ;;
    Linux) OS_NAME="Linux" ;;
    *) echo "Unsupported OS: $(uname -s). Use build.bat on Windows."; exit 1 ;;
esac
# Look for python first, then python3. If neither is found, exit with an error.
PYTHON="$(command -v python || command -v python3)"
if [ -z "$PYTHON" ]; then
    echo "CRITICAL ERROR: Python 3 was not found on PATH."
    exit 1
fi

echo "===================================================="
echo "  [$OS_NAME BUILD] Molecular Merge and Match"
echo "===================================================="

export PYTHONNOUSERSITE=1

# 1. Safety Check: Ensure the project configuration isn't missing
if [ ! -f "package.json" ]; then
    echo "CRITICAL ERROR: package.json is missing!"
    echo "Please ensure this script is running from your project root folder."
    exit 1
fi

# 2. Restore Root Electron dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "[0/4] Root node_modules missing. Restoring Electron build tools..."
    npm install
fi

# 3. Clean old builds
echo "[1/4] Cleaning previous distribution files..."
npm run clean
rm -rf resources/bin

# 4. Compile Python Backend
echo "[2/4] Initializing Python Virtual Environment and PyInstaller..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    "$PYTHON" -m venv venv
fi
. venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install pyinstaller==6.22.3
# Force a true fresh rebuild by wiping old PyInstaller cache
echo "Purging old PyInstaller cache and build artifacts..."
rm -rf build dist
echo "Purging local development app.db files..."
rm -f backend/data/app.db
rm -rf backend/data/uploads
mkdir -p backend/data/uploads
echo "Freezing fresh Python binary..."
# Only Linux hides the console; on a local build Intel macOS --noconsole would produce a faulty build.
PYINSTALLER_ARGS=""
if [ "$OS_NAME" = "Linux" ]; then
    PYINSTALLER_ARGS="--noconsole"
fi
pyinstaller $PYINSTALLER_ARGS --collect-all rdkit --collect-all fastapi --collect-all uvicorn --name molecular-backend main_electron.py
deactivate
cd ..

# Stage backend folder structure using preservation copy flags
echo "Staging backend folder structure..."
mkdir -p resources/bin
cp -a backend/dist/molecular-backend/. resources/bin/

# 5. Step inside /frontend to restore packages and build React assets
echo "[3/4] Compiling React Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Frontend node_modules missing. Restoring React and Vite dependencies..."
    npm install
fi
npm run build
cd ..

# 6. Package application into your production files
echo "[4/4] Executing Electron Packaging from Root..."
npm run dist

echo "===================================================="
echo "  BUILD COMPLETE! Check 'dist-electron' folder."
echo "===================================================="
