/**
 * CentralReform Bridge — Electron Main Process
 *
 * Runs the X32 monitor bridge with a GUI dashboard.
 * Lives in the system tray when not actively viewing.
 * Auto-updates from GitHub releases.
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { main as startBridge, getBridgeStatus } from './index';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bridgeStarted = false;

// ─── Single Instance Lock ───

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        // Enforce auto-start on Windows login (hidden in tray)
        if (app.isPackaged) {
            app.setLoginItemSettings({
                openAtLogin: true,
                path: process.execPath,
                args: [
                    '--processStart', `"${process.execPath}"`,
                    '--process-start-args', `"--hidden"`
                ]
            });
        }
        createWindow();
    });
}

// ─── Window ───

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
        show: false,
        skipTaskbar: false,
    });

    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

    mainWindow.once('ready-to-show', () => {
        // Do NOT show window on startup, stay minimized in system tray
        startBackgroundBridge();
        checkForUpdates();
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!(app as any).isQuiting) {
            event.preventDefault();
            mainWindow?.hide();
        }
        return false;
    });

    createTray();
}

// ─── System Tray ───

function createTrayIcon() {
    // Try loading icon file first
    const iconPath = path.join(__dirname, '../ui/icon.png');
    if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
    }

    // Generate a simple 16x16 tray icon programmatically
    // Purple/violet circle on transparent background (matches the app's violet theme)
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4); // RGBA

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cx = x - size / 2 + 0.5;
            const cy = y - size / 2 + 0.5;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const offset = (y * size + x) * 4;

            if (dist < size / 2 - 0.5) {
                // Violet fill: #8b5cf6
                canvas[offset] = 0x8b;     // R
                canvas[offset + 1] = 0x5c; // G
                canvas[offset + 2] = 0xf6; // B
                canvas[offset + 3] = 0xff; // A
            } else if (dist < size / 2 + 0.5) {
                // Anti-aliased edge
                const alpha = Math.round((size / 2 + 0.5 - dist) * 255);
                canvas[offset] = 0x8b;
                canvas[offset + 1] = 0x5c;
                canvas[offset + 2] = 0xf6;
                canvas[offset + 3] = Math.max(0, Math.min(255, alpha));
            }
            // else: transparent (already zeroed)
        }
    }

    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray() {
    const icon = createTrayIcon();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Dashboard',
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'Check for Updates',
            click: () => checkForUpdates()
        },
        { type: 'separator' },
        {
            label: 'Quit Bridge',
            click: () => {
                (app as any).isQuiting = true;
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

// ─── Auto-Updates ───

function checkForUpdates() {
    try {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('update-available', (info) => {
            console.log(`[Update] New version available: ${info.version}`);
            mainWindow?.webContents.send('log', {
                level: 'info',
                message: `🔄 Update available: v${info.version} — downloading...`
            });
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log(`[Update] v${info.version} downloaded — installing silently in background...`);
            mainWindow?.webContents.send('log', {
                level: 'info',
                message: `✅ Update v${info.version} downloaded — restarting to apply update`
            });

            // Wait 3 seconds to let the UI log appear, then forcefully restart and update
            setTimeout(() => {
                (app as any).isQuiting = true;
                // isSilent = true, isForceRunAfter = true
                autoUpdater.quitAndInstall(true, true);
            }, 3000);
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[Update] Already on latest version');
        });

        autoUpdater.on('error', (err) => {
            console.warn('[Update] Auto-update check failed:', err.message);
            // Don't spam the user with update errors — it's not critical
        });

        autoUpdater.checkForUpdates().catch(() => {
            // Silently fail — updates are best-effort
        });
    } catch {
        // Auto-update not available in dev mode — that's fine
    }
}

// ─── Bridge Startup ───

async function startBackgroundBridge() {
    if (bridgeStarted) return;
    bridgeStarted = true;

    try {
        // Redirect console output to the Electron UI
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args: unknown[]) => {
            originalLog(...args);
            mainWindow?.webContents.send('log', { level: 'info', message: args.join(' ') });
        };
        console.error = (...args: unknown[]) => {
            originalError(...args);
            mainWindow?.webContents.send('log', { level: 'error', message: args.join(' ') });
        };
        console.warn = (...args: unknown[]) => {
            originalWarn(...args);
            mainWindow?.webContents.send('log', { level: 'warn', message: args.join(' ') });
        };

        // Resolve paths relative to exe location (not asar)
        const isPackaged = app.isPackaged;
        const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

        process.env.WS_PORT = "9000";
        process.env.HTTP_PORT = "9001";
        process.env.NODE_ENV = "production";

        // Load bridge config
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

        // Find Firebase credentials
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
            await startBridge();
        } else {
            console.error(`MISSING FIREBASE CREDENTIALS`);
            console.error(`Please provide a setup code to download the key or place 'service-account-key.json' in the installation folder manually.`);
            mainWindow?.webContents.send('require-setup');
        }

        // Status polling for UI
        setInterval(() => {
            const status = typeof getBridgeStatus === 'function' ? getBridgeStatus() : {};
            mainWindow?.webContents.send('status', status);
        }, 2000);

    } catch (err) {
        console.error("Bridge startup failed:", err);
    }
}

// ─── IPC Handlers ───

ipcMain.on('open-external', (_event: Electron.IpcMainEvent, url: string) => {
    shell.openExternal(url);
});

ipcMain.handle('submit-setup-code', async (_event: Electron.IpcMainInvokeEvent, { appUrl, code }: { appUrl: string; code: string }) => {
    try {
        const url = `${appUrl}/api/bridge/setup-code?code=${encodeURIComponent(code)}`;
        const response = await fetch(url);

        if (!response.ok) {
            let errorText = `HTTP ${response.status}`;
            try {
                const errJson = await response.json() as { error?: string };
                errorText = errJson.error || errorText;
            } catch { /* ignore */ }
            return { success: false, error: errorText };
        }

        const data = await response.json() as { credentials?: Record<string, unknown>; error?: string };
        if (data.credentials) {
            const isPackaged = app.isPackaged;
            const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

            const keyPath = path.join(exeDir, "service-account-key.json");
            fs.writeFileSync(keyPath, JSON.stringify(data.credentials, null, 2));

            const configPath = path.join(exeDir, "bridge-config.json");
            let cfg: Record<string, unknown> = {};
            if (fs.existsSync(configPath)) {
                try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* ignore */ }
            }
            cfg.appUrl = appUrl;
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

            process.env.FIREBASE_SA_KEY_PATH = keyPath;
            console.log("✅ Credentials downloaded and saved successfully!");

            startBridge().catch(err => {
                console.error("Bridge startup failed after setup:", err);
            });

            return { success: true };
        }
        return { success: false, error: data.error || "Invalid response from server" };
    } catch (err: unknown) {
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('install-update', () => {
    (app as any).isQuiting = true;
    autoUpdater.quitAndInstall();
});

// ─── App Lifecycle ───

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

(app as any).isQuiting = false;
