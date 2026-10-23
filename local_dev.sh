#!/usr/bin/env sh

# 1. check if this is the main process
if [ -z "$1" ]; then
    # macOS has no gnome-terminal: backend in the background, frontend in the foreground
    if [ "$(uname)" = "Darwin" ]; then
        "$0" run_backend &
        BACKEND_PID=$!
        trap 'kill $BACKEND_PID 2>/dev/null' EXIT INT TERM
        (sleep 10; open http://localhost:5173) &
        "$0" run_frontend
        exit 0
    fi

    CURRENT_SHELL="${SHELL:-/bin/sh}"

    # Open backend-tab in current shell
    gnome-terminal --tab --title="MMM - Backend" -- "$CURRENT_SHELL" -c "$0 run_backend; exec $CURRENT_SHELL"
    
    # Open frontend-tab in current shell
    gnome-terminal --tab --title="MMM - Frontend" -- "$CURRENT_SHELL" -c "$0 run_frontend; exec $CURRENT_SHELL"

    # Wait 10 seconds  until background process have started
    echo "Waiting for local servers to start..."
    sleep 10
    
    # Start the browser (1. Edge -> 2. Falkon Flatpak -> 3. Standard browser)
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

# 2. Route new commands to their windows
case "$1" in
    run_backend)
        echo "========================================================="
        echo " [LOCAL DEVELOPMENT - BACKEND] Molecular Merge and Match"
        echo "========================================================="

        echo "Initializing Python Virtual Environment"

        # Clear port 8000 if stale process is used
        STALE_PIDS=$(lsof -ti:8000 2>/dev/null)
        [ -n "$STALE_PIDS" ] && kill $STALE_PIDS 2>/dev/null
        cd backend || exit 1
        
        if [ ! -d "venv" ]; then
            echo "Creating virtual environment..."
            "$(command -v python || command -v python3)" -m venv venv
        fi
        
        . venv/bin/activate
        
        # Check if fastapi is installed
        if [ ! -d "venv/lib" ] || [ -z "$(find venv/lib -type d -name fastapi 2>/dev/null)" ]; then
            echo "Installing dependencies..."
            python -m pip install -r requirements.txt -r requirements-dev.txt
            python -m pip install pyinstaller==6.22.3
        fi
        echo ""

        echo "Initializing local backend"
        exec uvicorn app.main:app --reload
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

