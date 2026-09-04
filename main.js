const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const nodeNet = require('net');

let backendProcess = null;
let backendPort = 8000;

protocol.registerSchemesAsPrivileged([
    { scheme: 'api', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

ipcMain.on('toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        const isFullScreen = win.isFullScreen();
        win.setFullScreen(!isFullScreen);
    }
});

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = nodeNet.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

function setupUserData() {
    if (!app.isPackaged) return;
    const userDataPath = app.getPath('userData');
    const targetDataDir = path.join(userDataPath, 'data');

    // Maps to the root of process.resourcesPath cleanly on all platforms
    const possibleSourcePaths = [
        path.join(process.resourcesPath, 'data'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'data')
    ];

    const sourceDataDir = possibleSourcePaths.find(p => fs.existsSync(p));

    if (!sourceDataDir) {
        console.error("CRITICAL ERROR: Could not locate the production data source folder! Searched in:", possibleSourcePaths);
    } else {
        console.log(`Successfully verified production data source at: ${sourceDataDir}`);
    }

    const needsCopy = !fs.existsSync(targetDataDir) || fs.readdirSync(targetDataDir).length === 0;

    if (needsCopy && sourceDataDir) {
        console.log("Copying initial data to userData from:", sourceDataDir);
        try {
            const copyFolderSync = (src, dest) => {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                try { fs.chmodSync(dest, 511); } catch (e) {} // 511 matches 0o755 directory protection standard

                for (const file of fs.readdirSync(src)) {
                    const srcPath = path.join(src, file);
                    const destPath = path.join(dest, file);
                    if (fs.statSync(srcPath).isDirectory()) {
                        copyFolderSync(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                        try { fs.chmodSync(destPath, 438); } catch (e) {} // 438 matches 0o666 file permissions standard
                    }
                }
            };
            copyFolderSync(sourceDataDir, targetDataDir);
        } catch (e) {
            console.error("Failed to copy data, creating empty fallback:", e);
            if (!fs.existsSync(targetDataDir)) fs.mkdirSync(targetDataDir, { recursive: true });
        }
    } else if (!fs.existsSync(targetDataDir)) {
        console.log("Creating empty data directory in userData:", targetDataDir);
        fs.mkdirSync(targetDataDir, { recursive: true });
    } else if (sourceDataDir) {
        // Keeps user seed data updated safely
        const seedFiles = [
            'examples_seed.json',
            'exercises_seed.json',
            'exercise_h1_peaks_seed.json',
            'exercise_c13_peaks_seed.json',
            'predefined_fragments_seed.json',
            'preloaded_fragments_seed.json',
            'preloaded_solutions_seed.json'
        ];
        for (const file of seedFiles) {
            const srcPath = path.join(sourceDataDir, file);
            const destPath = path.join(targetDataDir, file);
            if (fs.existsSync(srcPath)) {
                try {
                    fs.copyFileSync(srcPath, destPath);
                } catch (e) {
                    console.warn(`Failed to copy seed file ${file}:`, e.message);
                }
                try { fs.chmodSync(destPath, 438); } catch (e) { }
            }
        }
    }
}
function startBackend() {
    const exeName = process.platform === 'win32' ? 'molecular-backend.exe' : 'molecular-backend';

    // This safely targets the binary hidden inside its own native folder block
    const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'molecular-backend', exeName)
    : path.join(__dirname, 'resources', 'bin', 'molecular-backend', exeName);

    console.log(`Starting backend at: ${backendPath} on port ${backendPort}`);

    try {
        if (process.platform !== 'win32' && fs.existsSync(backendPath)) {
            try {
                // FIX: Swap out octal format for decimal integer equivalent (511) to stabilize CommonJS environments
                fs.chmodSync(backendPath, 511);
                console.log("Successfully set 755 execution permissions on backend binary.");
            } catch (e) {
                console.warn("Failed to set execute permissions:", e);
            }
        } else if (!fs.existsSync(backendPath)) {
            console.error(`CRITICAL: Backend binary completely missing at: ${backendPath}`);
        }
        // SAFE PLATFORM-SPECIFIC PATCH
        // Leaves your working Windows and Linux Flatpak paths exactly as they were,
        // but gives macOS the internal bundle directory it needs to load dynamic libraries.
        // FIX: Bound cwd dynamically to the exact directory holding the binary and the '_internal' folder.
        // This stops PyInstaller binaries from immediately crashing on macOS and container sandboxes.

        const backendCwd = app.isPackaged
        ? (process.platform === 'darwin' 
            ? path.join(process.resourcesPath, 'bin', 'molecular-backend') 
            : app.getPath('userData'))
        : path.join(__dirname, 'backend');



        console.log(`Setting backend CWD context to: ${backendCwd}`);

        backendProcess = spawn(backendPath, [backendPort.toString()], {
            detached: true,
            stdio: 'pipe',
            cwd: backendCwd, // Crucial execution assignment
            env: {
                ...process.env,
                APP_DATA_DIR: app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(__dirname, 'backend', 'data')
            }
        });

        if (!backendProcess) {
            throw new Error("Spawn failed to create process.");
        }

        backendProcess.stdout.on('data', (data) => console.log(`Py: ${data}`));
        backendProcess.stderr.on('data', (data) => console.error(`PyErr: ${data}`));

        backendProcess.on('error', (err) => {
            console.error("Failed to start backend process:", err);
        });

    } catch (err) {
        console.error("Critical error in startBackend:", err.message);
    }
}

// FIX 1: Explicitly utilize net.fetch instead of global fetch to safely bypass OS sandbox proxy traps
async function fetchWithRetry(url, options, retries = 30) {
    for (let i = 0; i < retries; i++) {
        try {
            return await net.fetch(url, options);
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`[Proxy] Backend not ready, retrying in 1s... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function setupApiProxy() {
    protocol.handle('api', async (request) => {
        const originalUrl = new URL(request.url);
        const backendUrl = `http://127.0.0.1:${backendPort}${originalUrl.pathname}${originalUrl.search}`;

        console.log(`Proxying API: ${request.url} -> ${backendUrl}`);

        try {
            const headers = new Headers(request.headers);
            headers.delete('host');
            headers.delete('origin');
            headers.delete('referer');

            const fetchOptions = {
                method: request.method,
                headers: headers,
                redirect: 'follow'
            };
            if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
                fetchOptions.body = await request.arrayBuffer();
            }
            const response = await fetchWithRetry(backendUrl, fetchOptions);
            console.log(`[Proxy] Success: ${response.status}`);
            return response;
        } catch (err) {
            console.error(`[Proxy] CRITICAL ERROR:`, err);
            return new Response(JSON.stringify({ error: err.message }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });
}

function createWindow() {
    const win = new BrowserWindow({
        show: false,
        minWidth: 1280,
        minHeight: 660,
        icon: path.join(__dirname, 'build-assets', 'icon.png'),
                                  webPreferences: {
                                      preload: path.join(__dirname, 'preload.js'),
                                  contextIsolation: true,
                                  nodeIntegration: false,
                                  sandbox: true
                                  }
    });

    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
        if (process.platform === 'linux') {
            setTimeout(() => win.setFullScreen(true), 250);
        } else {
            win.setFullScreen(true);
        }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`Failed to load: ${errorCode} - ${errorDescription}`);
    });

    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    console.log("Loading from:", indexPath);
    win.loadFile(indexPath);
}

app.whenReady().then(async () => {
    try {
        backendPort = await getFreePort();
    } catch (err) {
        console.warn("Could not find free port, falling back to 8000:", err);
    }
    setupApiProxy();
    setupUserData();
    startBackend();
    createWindow();
});

// FIX 2: Quit entirely on all platforms to shut down the Python loopback engine cleanly
app.on('window-all-closed', () => {
    app.quit();
});

app.on('will-quit', () => {
    if (backendProcess) {
        console.log("Killing backend process tree safely...");
        if (process.platform === 'win32') {
            try {
                const { exec } = require('child_process');
                exec(`taskkill /pid ${backendProcess.pid} /T /F`);
            } catch (e) {
                console.error("Failed to kill Windows task tree:", e);
            }
        } else if (process.platform === 'darwin' || process.platform === 'linux') {
            // FIX 3: Encapsulate process group kill in a explicit try block to catch unhandled error states smoothly
            try {
                process.kill(-backendProcess.pid, 'SIGTERM');
            } catch (e) {
                try { backendProcess.kill('SIGTERM'); } catch (err) {}
            }
        } else {
            try { backendProcess.kill('SIGTERM'); } catch (err) {}
        }
    }
});

process.on('SIGINT', () => {
    console.log("Received SIGINT, shutting down gracefully...");
    app.quit();
});

process.on('SIGTERM', () => {
    app.quit();
});
