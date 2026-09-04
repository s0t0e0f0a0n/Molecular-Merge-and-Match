@echo off

:: 1. CHECK IF THIS IS THE MASTER PROCESS
:: If no arguments are passed, it launches the two separate PowerShell tabs

if "%~1"=="" (
    start "MMM - Backend" cmd /k ""%~f0" run_backend"
    start "MMM - Frontend" cmd /k ""%~f0" run_frontend"
    exit /b
)

:: 2. ROUTE THE NEW WINDOWS TO THEIR CODE
goto %~1


:run_backend
echo =========================================================
echo  [LOCAL DEVELOPMENT - BACKEND] Molecular Merge and Match
echo =========================================================

echo Initializing Python Virtual Environment
cd backend
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate
if not exist venv\Lib\site-packages\fastapi (
    echo Installing dependencies...
    	python -m pip install -r requirements.txt
	python -m pip install -r requirements-dev.txt
	python -m pip install tzdata pyinstaller fonttools brotli
)
echo 

echo Initializing local backend
call uvicorn app.main:app --reload
exit /b

:run_frontend
echo =========================================================
echo  [LOCAL DEVELOPMENT - FRONTEND] Molecular Merge and Match
echo =========================================================

echo Initializing Node js frontend
cd frontend
if not exist node_modules (
    echo Frontend node_modules missing. Restoring React and Vite dependencies...
    call npm install
)
call npm run dev
exit /b