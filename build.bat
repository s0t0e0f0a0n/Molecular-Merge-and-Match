@echo off
echo ====================================================
echo  [WINDOWS BUILD] Molecular Merge and Match
echo ====================================================

:: 1. Safety Check: Ensure the project configuration isn't missing
if not exist package.json (
    echo CRITICAL ERROR: package.json is missing! 
    echo Please ensure this script is running from your project root folder.
    pause
    exit /b 1
)

:: 2. Restore Root Electron dependencies if missing
if not exist node_modules (
    echo [0/4] Root node_modules missing. Restoring Electron build tools...
    call npm install
    if errorlevel 1 goto :fail
)

:: 3. Clean old builds
echo [1/4] Cleaning previous distribution files...
call npm run clean
if errorlevel 1 goto :fail
if exist resources\bin rmdir /s /q resources\bin

:: 4. Compile Python Backend
echo [2/4] Initializing Python Virtual Environment and PyInstaller...
cd backend
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 goto :fail
)
call venv\Scripts\activate
if errorlevel 1 goto :fail

:: call python -m pip install --upgrade pip
call pip install -r requirements.txt
if errorlevel 1 goto :fail
call pip install pyinstaller==6.22.3
if errorlevel 1 goto :fail
:: Force a true fresh rebuild by wiping old PyInstaller cache and distribution outputs
echo Purging old PyInstaller cache and build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo "Purging local development app.db files..."
if exist backend\data\uploads rmdir /s /q backend\data\uploads
if exist backend\data\app.db del /f /q backend\data\app.db
mkdir backend\data\uploads
echo Freezing fresh Python binary...
call pyinstaller --noconsole --noconfirm --collect-all rdkit --collect-all fastapi --collect-all uvicorn --name molecular-backend main_electron.py
if errorlevel 1 goto :fail
cd ..

:: Stage backend folder structure
echo Staging backend folder structure...
if not exist resources\bin mkdir resources\bin
xcopy /E /I /Y /R /K backend\dist\molecular-backend\* resources\bin\
if errorlevel 1 goto :fail

:: 5. Step inside /frontend to restore packages and build React assets
echo [3/4] Compiling React Frontend...
cd frontend
if not exist node_modules (
    echo Frontend node_modules missing. Restoring React and Vite dependencies...
    call npm install
    if errorlevel 1 goto :fail
)
call npm run build
if errorlevel 1 goto :fail
cd ..

:: 6. Package application from the root using npm run dist
echo [4/4] Executing Electron Packaging from Root...
call npm run dist
if errorlevel 1 goto :fail

echo ====================================================
echo  BUILD COMPLETE! Check 'dist-electron' folder.
echo ====================================================
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. See the error above.
pause
exit /b 1
