#!/usr/bin/env sh

# 1. CONTROLEER OF DIT HET HOOFDPROCES IS
# Als er geen argumenten worden meegegeven, start het de twee aparte terminal-tabbladen
if [ -z "$1" ]; then
    # Haal de huidige actieve shell van de gebruiker op (bijv. /bin/bash of /bin/zsh)
    CURRENT_SHELL="${SHELL:-/bin/sh}"

    # Open het backend-tabblad in de huidige shell
    gnome-terminal --tab --title="MMM - Backend" -- "$CURRENT_SHELL" -c "$0 run_backend; exec $CURRENT_SHELL"
    
    # Open het frontend-tabblad in de huidige shell
    gnome-terminal --tab --title="MMM - Frontend" -- "$CURRENT_SHELL" -c "$0 run_frontend; exec $CURRENT_SHELL"

    # Wacht 10 seconden totdat de processen (zoals Uvicorn) zijn opgestart
    echo "Waiting for local servers to start..."
    sleep 10
    
    # Start de browser (1. Edge -> 2. Falkon Flatpak -> 3. Standaardbrowser)
    if command -v microsoft-edge >/dev/null 2>&1; then
        microsoft-edge http://localhost:5173 >/dev/null 2>&1 &
    elif command -v flatpak >/dev/null 2>&1 && flatpak info org.kde.falkon >/dev/null 2>&1; then
        flatpak run org.kde.falkon http://localhost:5173 >/dev/null 2>&1 &
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:5173 >/dev/null 2>&1 &
    else
        echo "Could not detect browser launcher. Please open http://localhost:5173 manually."
    fi
    exit 0

fi

# 2. ROUTEER DE NIEUWE VENSTERS NAAR HUN CODE
case "$1" in
    run_backend)
        echo "========================================================="
        echo " [LOCAL DEVELOPMENT - BACKEND] Molecular Merge and Match"
        echo "========================================================="

        echo "Initializing Python Virtual Environment"

        # Maak poort 8000 vrij als er nog een oud proces op hangt
        fuser -k 8000/tcp >/dev/null 2>&1
        cd backend || exit 1
        
        if [ ! -d "venv" ]; then
            echo "Creating virtual environment..."
            python3 -m venv venv
        fi
        
        # Gebruik . in plaats van source (source is specifiek voor Bash/Zsh, . werkt in ELKE shell)
        . venv/bin/activate
        
        # Controleer of fastapi is geïnstalleerd
        # Wildcards (*) werken in POSIX-shells soms anders in IF-statements, daarom gebruiken we find of test
        if [ ! -d "venv/lib" ] || [ -z "$(find venv/lib -type d -name fastapi 2>/dev/null)" ]; then
            echo "Installing dependencies..."
            python3 -m pip install -r requirements.txt
            python3 -m pip install -r requirements-dev.txt
            python3 -m pip install tzdata pyinstaller fonttools brotli
        fi
        echo ""

        echo "Initializing local backend"
        uvicorn app.main:app --reload
        exit 0
        ;;

    run_frontend)
        echo "========================================================="
        echo " [LOCAL DEVELOPMENT - FRONTEND] Molecular Merge and Match"
        echo "========================================================="

        echo "Initializing Node js frontend"
        cd frontend || exit 1
        
        if [ ! -d "node_modules" ]; then
            echo "Frontend node_modules missing. Restoring React and Vite dependencies..."
            npm install
        fi
        
        npm run dev
        exit 0
        ;;
        
    *)
        echo "Unknown command: $1"
        exit 1
        ;;
esac

