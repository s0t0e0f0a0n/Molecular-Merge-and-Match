const { app, BrowserWindow, nativeImage, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const nodeNet = require('net');

let backendProcess = null;
let backendPort = null;
let backendReady = false;
let backendExited = false;
let backendStderrLines = [];
let quitCleanupDone = false;
const BACKEND_EXIT_TIMEOUT_MS = 5000;
let mainWindow = null;
let activeExerciseId = null;
let mainWindowCloseAuthorized = false;
let mainWindowCloseInProgress = false;

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

ipcMain.on('set-active-exercise-id', (_event, exerciseId) => {
    activeExerciseId =
        Number.isSafeInteger(exerciseId) && exerciseId > 0 ? exerciseId : null;
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
        path.join(process.resourcesPath, 'data'), // Windows/Linux
        path.join(process.resourcesPath, 'resources', 'data'), // macOS (inside .app bundle)
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
                try { fs.chmodSync(dest, 0o700); } catch (e) {}
                
                for (const file of fs.readdirSync(src)) {
                    const srcPath = path.join(src, file);
                    const destPath = path.join(dest, file);
                    if (fs.statSync(srcPath).isDirectory()) {
                        copyFolderSync(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                        try { fs.chmodSync(destPath, 0o600); } catch (e) {}
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
        // The data folder exists, but we must keep seed files up to date, without overwriting the user's custom app.db.
        const seedFiles = [
            'examples_seed.json',
            'predefined_fragments_seed.json',
            'preloaded_fragments_seed.json',
            'preloaded_solutions_seed.json',
            'solvent_seed.json',
            'tags_seed.json'
        ];
        for (const file of seedFiles) {
            const srcPath = path.join(sourceDataDir, file);
            const destPath = path.join(targetDataDir, file); //Added a warning
            if (fs.existsSync(srcPath)) {
                try {
                    fs.copyFileSync(srcPath, destPath);
                } catch (e) {
                    console.warn(`Failed to copy seed file ${file}:`, e.message);
                }
                try { fs.chmodSync(destPath, 0o600); } catch (e) { }
            }
        }
    }
}
function startBackend() {
    const exeName = process.platform === 'win32' ? 'molecular-backend.exe' : 'molecular-backend';

    const backendPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'bin', exeName) 
        : path.join(__dirname, 'resources', 'bin', exeName);

    console.log(`Starting backend at: ${backendPath} on port ${backendPort}`);

    try {
        if (process.platform !== 'win32' && fs.existsSync(backendPath)) {
            try {
                // Skip chmod for read-only sandboxes (Snap and Flatpak)
                if (process.env.SNAP || process.env.FLATPAK_ID) {
                    console.log("Running inside Snap/Flatpak sandbox, skipping chmod (read-only filesystem).");
                } else {
                    fs.chmodSync(backendPath, 0o755);
                    console.log("Successfully set 755 execution permissions on backend binary.");
                }
            }
            catch (e) {
                console.warn("Failed to set execute permissions:", e);
            }
        } else if (!fs.existsSync(backendPath)) {
            console.error(`CRITICAL: Backend binary completely missing at: ${backendPath}`);
        }

        const backendCwd = app.isPackaged
            ? app.getPath('userData')
            : path.join(__dirname, 'backend');
        console.log(`Setting backend CWD context to: ${backendCwd}`);

        backendProcess = spawn(backendPath, [backendPort.toString()], {
            detached: true,
            stdio: 'pipe',
            cwd: backendCwd,
            env: {
                ...process.env,
                APP_DATA_DIR: app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(__dirname, 'backend', 'data')
            }
        });

        if (!backendProcess) {
            throw new Error("Spawn failed to create process.");
        }

        const markReadyIfStarted = (text) => {
            if (text.includes('Application startup complete')) backendReady = true;
        };
        backendProcess.stdout.on('data', (data) => {
            console.log(`Py: ${data}`);
            markReadyIfStarted(String(data));
        });
        backendProcess.stderr.on('data', (data) => {
            console.error(`PyErr: ${data}`);
            const text = String(data);
            markReadyIfStarted(text);
            backendStderrLines.push(...text.split(/\r?\n/).filter(Boolean));
            backendStderrLines = backendStderrLines.slice(-20);
        });

        backendProcess.on('error', (err) => {
            console.error("Failed to start backend process:", err);
            backendExited = true;
            if (!quitCleanupDone) {
                dialog.showErrorBox('Backend failed to start', String(err && err.message || err));
                app.quit();
            }
        });

        backendProcess.on('exit', (code, signal) => {
            backendExited = true;
            console.log(`Backend exited (code=${code}, signal=${signal})`);
            if (!backendReady && !quitCleanupDone && code !== 0) {
                const lastLines = backendStderrLines.join('\n') || '(no error output)';
                dialog.showErrorBox(
                    'Backend failed to start',
                    `The backend exited before it was ready (code ${code ?? signal}).\n\n${lastLines}`
                );
                app.quit();
            }
        });

    } catch (err) {
        console.error("Critical error in startBackend:", err.message);
    }
}

async function fetchWithRetry(url, options, retries = 30) {
    for (let i = 0; i < retries; i++) {
        try {
            // Use net.fetch instead of (global) fetch for sandboxing support
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
    let iconAsset;
    // Linux doesn't scale the .png or .icns very well, unless using nativeImage or selecting a dedicated size.
    if (process.platform === 'linux') {
        // const rawIcon = nativeImage.createFromPath(path.join(__dirname, 'build-assets', 'icons', 'icon.png'));
        iconAsset = path.join(__dirname, 'build-assets', 'icons', '64x64.png');
    }
    // Windows shows the context icon somewhat smaller somehow, the cropped version looks best
    else if (process.platform === 'win32') {
        iconAsset = path.join(__dirname, 'build-assets', 'win', 'icon_crop.ico');
    }
    else {
        iconAsset = path.join(__dirname, 'build-assets', 'mac', 'icon_mac.icns');
    }

    const win = new BrowserWindow({
        show: false,
        minWidth: 1280,
        minHeight: 660,
        icon: iconAsset,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    mainWindow = win;

    win.on('close', (event) => {
        if (mainWindowCloseAuthorized || activeExerciseId === null) return;

        event.preventDefault();
        if (mainWindowCloseInProgress) return;
        mainWindowCloseInProgress = true;

        void flushActiveExerciseTimerBeforeClose(win);
    });

    win.on('closed', () => {
        if (mainWindow === win) mainWindow = null;
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
    
    // Load the React build
    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    console.log("Loading from:", indexPath);
    win.loadFile(indexPath);
}

async function flushActiveExerciseTimerBeforeClose(win) {
    while (!win.isDestroyed()) {
        const exerciseId = activeExerciseId;
        if (exerciseId === null) {
            mainWindowCloseAuthorized = true;
            mainWindowCloseInProgress = false;
            win.close();
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await net.fetch(
                `http://127.0.0.1:${backendPort}/api/v1/statistics/stop?exercise_id=${encodeURIComponent(String(exerciseId))}`,
                { method: 'POST', headers: { 'X-Requested-With': 'MMM' }, signal: controller.signal },
            );
            if (!response.ok) {
                throw new Error(`Timer save failed (${response.status})`);
            }

            activeExerciseId = null;
            mainWindowCloseAuthorized = true;
            mainWindowCloseInProgress = false;
            win.close();
            return;
        } catch (error) {
            console.error('Failed to save active exercise timer before closing:', error);
            clearTimeout(timeoutId);
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning',
                title: 'Could not save exercise progress',
                message: 'The timer could not be saved. Would you like to retry before closing?',
                detail: error instanceof Error ? error.message : String(error),
                buttons: ['Retry', 'Close Without Saving', 'Cancel'],
                defaultId: 0,
                cancelId: 2,
                noLink: true,
            });

            if (response === 0) continue;
            if (response === 1) {
                mainWindowCloseAuthorized = true;
                mainWindowCloseInProgress = false;
                win.close();
                return;
            }

            mainWindowCloseInProgress = false;
            return;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    mainWindowCloseInProgress = false;
}


app.whenReady().then(async () => {
    try {
        backendPort = await getFreePort();
    } catch (err) {
        console.error("Could not find a free port:", err);
        dialog.showErrorBox('Cannot start backend', `No free network port could be found.\n\n${err && err.message || err}`);
        app.quit();
        return;
    }
    setupApiProxy();
    setupUserData();
    startBackend();
    createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
    if (quitCleanupDone) return;
    quitCleanupDone = true;
    if (!backendProcess || backendExited) return;

    event.preventDefault();
    console.log("Terminating backend process...");
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        app.quit();
    };
    const timer = setTimeout(() => {
        console.warn("Backend did not exit within timeout, quitting anyway.");
        finish();
    }, BACKEND_EXIT_TIMEOUT_MS);
    backendProcess.once('exit', finish);

    if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F'], (err) => {
            if (err) console.warn("taskkill failed:", err.message);
        });
    } else {
        backendProcess.kill('SIGTERM');
    }
});

process.on('SIGINT', () => {
  console.log("Received SIGINT, shutting down gracefully...");
  app.quit();
});

process.on('SIGTERM', () => {
  app.quit();
});
