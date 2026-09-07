#!/bin/bash
set -e # Exit immediately if any command fails

echo "===================================================="
echo "  [macOS BUILD] Molecular Merge and Match"
echo "===================================================="

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
rm -rf resources/bin/molecular-backend

# 4. Compile Python Backend
echo "[2/4] Initializing Python Virtual Environment..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate local python sandbox
. venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
pip install pyinstaller

# FIX 1: Force a true fresh rebuild by wiping old PyInstaller cache on Mac
echo "Purging old PyInstaller cache and build artifacts..."
rm -rf build dist

# FIX 2: Dropped '--noconsole' flag to guarantee a clean command-line folder directory
# structure containing the bare binary, avoiding accidental .app generation.
echo "Freezing fresh Python binary..."
pyinstaller --collect-all rdkit --collect-all fastapi --collect-all uvicorn --name molecular-backend main_electron.py
deactivate
cd ..

# Stage backend folder structure using preservation copy flags
echo "Staging backend folder structure..."
rm -rf resources/bin
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

# 6. Package application into your production .dmg
echo "[4/4] Executing Electron Packaging from Root..."
npm run dist

echo "===================================================="
echo "  BUILD COMPLETE! Check 'dist-electron' folder."
echo "===================================================="
