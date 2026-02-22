import { app, BrowserWindow, Tray, Menu, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { main as startBridge, getBridgeStatus } from './index'; // We will update index.ts to export getBridgeStatus

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bridgeStarted = false;

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(createWindow);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: "CentralReform Bridge",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        show: false // Wait for ready-to-show
    });

    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        startBackgroundBridge();
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow?.hide();
        }
        return false;
    });

    createTray();
}

function createTray() {
    const iconPath = path.join(__dirname, '../ui/icon.png');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Dashboard', click: () => mainWindow?.show() },
        { type: 'separator' },
        {
            label: 'Quit Bridge', click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('CentralReform Bridge');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow?.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow?.show();
            mainWindow?.focus();
        }
    });
}

async function startBackgroundBridge() {
    if (bridgeStarted) return;
    bridgeStarted = true;

    try {
        // Redirect console.log to our frontend
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
            originalLog(...args);
            mainWindow?.webContents.send('log', { level: 'info', message: args.join(' ') });
        };
        console.error = (...args) => {
            originalError(...args);
            mainWindow?.webContents.send('log', { level: 'error', message: args.join(' ') });
        };
        console.warn = (...args) => {
            originalWarn(...args);
            mainWindow?.webContents.send('log', { level: 'warn', message: args.join(' ') });
        };

        // Load config and set environment variables
        const isPackaged = app.isPackaged;
        const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

        process.env.WS_PORT = "9000";
        process.env.HTTP_PORT = "9001";
        process.env.NODE_ENV = "production";

        const configFile = path.join(exeDir, "bridge-config.json");
        let keyPathFromConfig: string | null = null;
        if (fs.existsSync(configFile)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (cfg.wsPort) process.env.WS_PORT = String(cfg.wsPort);
                if (cfg.httpPort) process.env.HTTP_PORT = String(cfg.httpPort);
                if (cfg.keyPath) keyPathFromConfig = cfg.keyPath;
            } catch (e) {
                console.warn("Failed to parse bridge-config.json:", e);
            }
        }

        const possibleKeys = [
            keyPathFromConfig,
            path.join(exeDir, "service-account-key.json"),
            path.join(exeDir, "serviceAccountKey.json"),
            path.join(exeDir, "firebase-key.json")
        ].filter(Boolean) as string[];

        const foundKey = possibleKeys.find(p => fs.existsSync(p));
        if (foundKey) {
            process.env.FIREBASE_SA_KEY_PATH = foundKey;
            console.log("Found Firebase credentials at:", foundKey);
            // Run the bridge backend!
            await startBridge();
        } else {
            console.error(`MISSING FIREBASE CREDENTIALS`);
            console.error(`Please provide a setup code to download the key or place 'service-account-key.json' in the installation folder manually.`);
            mainWindow?.webContents.send('require-setup');
        }

        // Polling loop to send stats to UI
        setInterval(() => {
            const status = typeof getBridgeStatus === 'function' ? getBridgeStatus() : {};
            mainWindow?.webContents.send('status', status);
        }, 2000);

    } catch (err) {
        console.error("Bridge startup failed:", err);
    }
}

// IPC Handlers for UI actions
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('submit-setup-code', async (event, { appUrl, code }) => {
    try {
        const url = `${appUrl}/api/bridge/setup-code?code=${encodeURIComponent(code)}`;
        const response = await fetch(url);

        if (!response.ok) {
            let errorText = `HTTP ${response.status}`;
            try {
                const errJson = await response.json() as any;
                errorText = errJson.error || errorText;
            } catch (e) { }
            return { success: false, error: errorText };
        }

        const data = await response.json() as any;
        if (data.credentials) {
            const isPackaged = app.isPackaged;
            const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

            // Save Key
            const keyPath = path.join(exeDir, "service-account-key.json");
            fs.writeFileSync(keyPath, JSON.stringify(data.credentials, null, 2));

            // Save Config
            const configPath = path.join(exeDir, "bridge-config.json");
            let cfg: any = {};
            if (fs.existsSync(configPath)) {
                try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
            }
            cfg.appUrl = appUrl;
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

            process.env.FIREBASE_SA_KEY_PATH = keyPath;
            console.log("✅ Credentials downloaded and saved successfully!");

            // Boot Bridge
            startBridge().catch(err => {
                console.error("Bridge startup failed after setup:", err);
            });

            return { success: true };
        }
        return { success: false, error: data.error || "Invalid response from server" };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// App lifecycle
app.on('window-all-closed', () => {
    // We prevent this by trapping the close event above, 
    // but just in case, on Windows closing all windows closes the app.
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Hack to attach custom property for close event prevention
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Electron {
        interface App {
            isQuiting: boolean;
        }
    }
}
app.isQuiting = false;
