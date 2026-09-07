import os
import sys
import threading
import time

import uvicorn

from app.main import app  # noqa: F401


def watch_parent():
    """Check if parent process is still alive; exit if not."""
    parent_pid = os.getppid()

    # If the app starts up with PID 1 inside a Flatpak sandbox container,
    # track it directly instead of instantly killing the execution thread.
    is_flatpak_or_init = (parent_pid == 1)

    while True:
        current_parent = os.getppid()

        if is_flatpak_or_init:
            # Inside a strict Flatpak environment, check if the parent process vanishes entirely
            if current_parent == 0:
                os._exit(0)
        else:
            # Standard Windows/macOS/Linux routine: Exit if the parent ID alters or gets orphaned
            if current_parent != parent_pid or current_parent == 1:
                os._exit(0)

        time.sleep(2)

if __name__ == "__main__":
    # Start this before uvicorn.run
    threading.Thread(target=watch_parent, daemon=True).start()

    # Use a fixed port or pass one via CLI
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
#  uvicorn.run(app, host="127.0.0.1", port=port, timeout_graceful_shutdown=1)
    # Pass the entry point as a string path configuration block.
    # This prevents PyInstaller from throwing module initialization failures in production.
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, timeout_graceful_shutdown=1)

