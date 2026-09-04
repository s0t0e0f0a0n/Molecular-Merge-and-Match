import os
import sys
import threading
import time

import uvicorn

from app.main import app


def watch_parent():
    """Check if parent process is still alive; exit if not."""
    parent_pid = os.getppid()
    while True:
        # If parent PID changes or becomes 1 (init/system), the app closed
        if os.getppid() != parent_pid or os.getppid() == 1:
            os._exit(0)
        time.sleep(2)

if __name__ == "__main__":
    # Start this before uvicorn.run
    threading.Thread(target=watch_parent, daemon=True).start()

    # Use a fixed port or pass one via CLI
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(app, host="127.0.0.1", port=port, timeout_graceful_shutdown=1)
