import os
import sys
import threading
import time

import psutil
import uvicorn

from app.main import app  # noqa: F401


def watch_parent():
    """Check if parent process is still alive; exit if not."""
    parent_pid = os.getppid()

    # Track the original parent PID; os.getppid() is not reliable for this on Windows.
    while True:
        if not psutil.pid_exists(parent_pid):
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

