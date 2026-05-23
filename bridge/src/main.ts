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
import { main as startBridge, getBridgeStatus, setRestartHandler } from './index';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bridgeStarted = false;

// ─── B1: last-resort crash guards (v10.0.4) ───
//
// An uncaught exception or unhandled rejection in the Electron main process
// otherwise kills the bridge with NO relaunch — fatal for a box that is ON but
// physically unreachable for ~2 days. Log it (captured by the O1 remote ring
// once that's up) and DO NOT exit: staying up (even degraded) beats dying, and
// the remote bridgeControl "restart" lever exists for a genuinely wedged process.
process.on('uncaughtException', (err) => {
    console.error('[Bridge] Uncaught exception (kept alive):', err?.stack || err?.message || String(err));
});
process.on('unhandledRejection', (reason) => {
    console.error(
        '[Bridge] Unhandled promise rejection (kept alive):',
        reason instanceof Error ? (reason.stack || reason.message) : String(reason),
    );
});

// R4 — hand index.ts the Electron relaunch lever so a remote
// bridgeControl.action === "restart" can relaunch the unattended bridge.
setRestartHandler(() => {
    console.warn('[Bridge] Remote restart requested — relaunching the process.');
    (app as any).isQuiting = true;
    app.relaunch();
    app.exit(0);
});

// ─── Credential storage (Bug#1 fix: durable, install-path-independent) ───
//
// The 2026-05-21 outage: credential discovery was anchored to the exe directory only,
// so reinstalling/updating the bridge to a new folder orphaned service-account-key.json
// in the OLD folder and forced a (then-broken) re-credential. electron's userData path
// is keyed by the app NAME, not the install path, so it survives reinstalls. We now
// read+write creds at userData first, keep exeDir as a fallback (manual JSON-drop
// emergency valve / legacy installs), and self-migrate an exeDir key into userData on
// startup so the NEXT reinstall is non-destructive.
const CRED_FILENAME = 'service-account-key.json';
const CONFIG_FILENAME = 'bridge-config.json';

/** Stable, install-path-independent credential directory (survives reinstalls). */
function getCredDir(): string | null {
    try {
        return app.getPath('userData');
    } catch {
        return null; // non-Electron / dev context
    }
}

/** Exe directory (install folder) — legacy / manual-JSON-drop fallback cred location. */
function getExeDir(): string {
    return app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
}

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

function buildTrayMenu(): Menu {
    const items: Electron.MenuItemConstructorOptions[] = [
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
    ];

    // BR-03: a downloaded update no longer auto-restarts the bridge mid-service.
    // Expose an explicit human "install now" path here (mirrors the install-update IPC).
    if (pendingUpdateVersion) {
        items.push({
            label: `Install update v${pendingUpdateVersion} (restart now)`,
            click: () => installPendingUpdate()
        });
    }

    items.push(
        { type: 'separator' },
        {
            label: 'Quit Bridge',
            click: () => {
                (app as any).isQuiting = true;
                app.quit();
            }
        }
    );

    return Menu.buildFromTemplate(items);
}

function refreshTrayMenu() {
    tray?.setContextMenu(buildTrayMenu());
}

function createTray() {
    const icon = createTrayIcon();
    tray = new Tray(icon);

    tray.setToolTip('CentralReform Bridge');
    refreshTrayMenu();

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
//
// BR-03 fix: the bridge runs unattended in the system tray on the studio machine and
// serves live monitor mixes to the band's iPads during Friday-evening / Shabbat-morning
// services ([[project_shul_cadence]]). Previously electron-updater force-restarted the
// app ~3s after ANY GitHub release downloaded (`quitAndInstall` on a timer) — a release
// published mid-service froze every musician's mix.
//
// We still DOWNLOAD updates eagerly, but never INSTALL (which relaunches the process)
// while a service could be live. A downloaded update is applied only when:
//   1. the X32 has been continuously disconnected (idle, no service) for a sustained
//      window — `x32Connected` can briefly flap (BR-02), so we require it to PERSIST;
//   2. a human explicitly installs it (tray item / dashboard `install-update` IPC); or
//   3. the app next quits (`autoInstallOnAppQuit`).

/** Minutes the X32 must be continuously disconnected before a pending update auto-installs. */
const IDLE_MINUTES_BEFORE_AUTO_INSTALL = 30;

let pendingUpdateVersion: string | null = null;
let consecutiveIdleMinutes = 0;
let idleInstallTimer: NodeJS.Timeout | null = null;
let updateHandlersRegistered = false;

function installPendingUpdate() {
    if (!pendingUpdateVersion) return;
    console.log(`[Update] Installing v${pendingUpdateVersion} and relaunching...`);
    if (idleInstallTimer) {
        clearInterval(idleInstallTimer);
        idleInstallTimer = null;
    }
    (app as any).isQuiting = true;
    // isSilent = true, isForceRunAfter = true
    autoUpdater.quitAndInstall(true, true);
}

// Auto-apply a downloaded update once the mixer has been idle long enough that no service
// can plausibly be running. Guards against the BR-02 false-disconnect flap by requiring a
// SUSTAINED disconnect (counted minute-by-minute), not an instantaneous reading.
function startIdleInstallWatch() {
    if (idleInstallTimer) return; // already watching
    consecutiveIdleMinutes = 0;
    idleInstallTimer = setInterval(() => {
        if (!pendingUpdateVersion) return;

        let x32Connected = false;
        try {
            x32Connected = !!getBridgeStatus()?.x32Connected;
        } catch {
            x32Connected = false;
        }

        if (x32Connected) {
            consecutiveIdleMinutes = 0; // mixer live — service likely running, keep deferring
            return;
        }

        consecutiveIdleMinutes += 1;
        if (consecutiveIdleMinutes >= IDLE_MINUTES_BEFORE_AUTO_INSTALL) {
            console.log(`[Update] X32 idle for ${consecutiveIdleMinutes}m — applying deferred update v${pendingUpdateVersion}.`);
            installPendingUpdate();
        }
    }, 60_000);
}

function checkForUpdates() {
    try {
        autoUpdater.autoDownload = true;
        // Safe fallback: if we never reach an idle window, the update lands the next time
        // the app quits — never mid-service.
        autoUpdater.autoInstallOnAppQuit = true;

        // Register listeners once. checkForUpdates() is called on startup AND from the tray
        // "Check for Updates" item, so re-registering would stack duplicate handlers on this
        // long-running process.
        if (!updateHandlersRegistered) {
            updateHandlersRegistered = true;

            autoUpdater.on('update-available', (info) => {
                console.log(`[Update] New version available: ${info.version}`);
                mainWindow?.webContents.send('log', {
                    level: 'info',
                    message: `🔄 Update available: v${info.version} — downloading...`
                });
            });

            autoUpdater.on('update-downloaded', (info) => {
                pendingUpdateVersion = info.version;
                console.log(`[Update] v${info.version} downloaded — deferring install (BR-03): will apply when the mixer is idle, on manual install, or on next quit.`);
                mainWindow?.webContents.send('log', {
                    level: 'info',
                    message: `✅ Update v${info.version} ready — it will install when the mixer is idle or on the next restart, so it won't interrupt a live service. Use the tray "Install update" to apply it now.`
                });
                mainWindow?.webContents.send('update-pending', { version: info.version });
                refreshTrayMenu();       // surface the explicit "Install update now" action
                startIdleInstallWatch(); // auto-apply once the X32 has been idle long enough
            });

            autoUpdater.on('update-not-available', () => {
                console.log('[Update] Already on latest version');
            });

            autoUpdater.on('error', (err) => {
                console.warn('[Update] Auto-update check failed:', err.message);
                // Don't spam the user with update errors — it's not critical
            });
        }

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

    // Report the REAL packaged build version (Electron reads it from the bundled
    // package.json) instead of the hardcoded "2.0.0" sentinel. Both the Firestore
    // heartbeat (config.ts) and the console banner (index.ts) read BRIDGE_VERSION
    // lazily, so setting it here — before startBridge() runs — makes them publish the
    // true version (e.g. 10.0.0). This lets us confirm REMOTELY (via the heartbeat)
    // that a deployed auto-update actually landed — closing the recon version-blind gap.
    // An explicit env override still wins (only set when unset).
    if (!process.env.BRIDGE_VERSION) {
        try {
            process.env.BRIDGE_VERSION = app.getVersion();
        } catch {
            // Non-Electron / dev context — fall back to the sentinel default.
        }
    }

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

        // Resolve credential locations: durable userData dir first, exe dir as fallback.
        const exeDir = getExeDir();
        const credDir = getCredDir();

        process.env.WS_PORT = "9000";
        process.env.HTTP_PORT = "9001";
        process.env.NODE_ENV = "production";

        // Load bridge config — prefer the durable userData copy, fall back to exeDir.
        let keyPathFromConfig: string | null = null;
        const configCandidates = [
            credDir ? path.join(credDir, CONFIG_FILENAME) : null,
            path.join(exeDir, CONFIG_FILENAME),
        ].filter(Boolean) as string[];
        const configFile = configCandidates.find(p => fs.existsSync(p));
        if (configFile) {
            try {
                const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (cfg.wsPort) process.env.WS_PORT = String(cfg.wsPort);
                if (cfg.httpPort) process.env.HTTP_PORT = String(cfg.httpPort);
                if (cfg.keyPath) keyPathFromConfig = cfg.keyPath;
            } catch (e) {
                console.warn("Failed to parse bridge-config.json:", e);
            }
        }

        // Find Firebase credentials. Order: explicit env override → config-specified path →
        // durable userData key → legacy/manual exeDir keys.
        const possibleKeys = [
            process.env.FIREBASE_SA_KEY_PATH || null,
            keyPathFromConfig,
            credDir ? path.join(credDir, CRED_FILENAME) : null,
            path.join(exeDir, CRED_FILENAME),
            path.join(exeDir, "serviceAccountKey.json"),
            path.join(exeDir, "firebase-key.json")
        ].filter(Boolean) as string[];

        const foundKey = possibleKeys.find(p => fs.existsSync(p));
        if (foundKey) {
            process.env.FIREBASE_SA_KEY_PATH = foundKey;
            console.log("Found Firebase credentials at:", foundKey);

            // Self-migration (Bug#1): if the key lives OUTSIDE the durable userData dir, copy
            // it in so the NEXT reinstall/update doesn't orphan it. Best-effort; never blocks
            // startup. Also auto-rescues current manual-JSON-drop installs on first v10.0.1 run.
            if (credDir) {
                const durableKey = path.join(credDir, CRED_FILENAME);
                if (foundKey !== durableKey && !fs.existsSync(durableKey)) {
                    try {
                        fs.mkdirSync(credDir, { recursive: true });
                        fs.copyFileSync(foundKey, durableKey);
                        console.log("Migrated Firebase credentials to durable location:", durableKey);
                    } catch (e) {
                        console.warn("Could not migrate credentials to userData (non-fatal):", e);
                    }
                }
            }

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
            // Bug#1 fix: persist creds to the durable userData dir (survives reinstalls);
            // fall back to exeDir only if userData is unavailable.
            const credDir = getCredDir() ?? getExeDir();
            try { fs.mkdirSync(credDir, { recursive: true }); } catch { /* dir usually already exists */ }

            const keyPath = path.join(credDir, CRED_FILENAME);
            fs.writeFileSync(keyPath, JSON.stringify(data.credentials, null, 2));

            const configPath = path.join(credDir, CONFIG_FILENAME);
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
    // Explicit human "install now" from the dashboard — same path as the tray item.
    installPendingUpdate();
});

// ─── App Lifecycle ───

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

(app as any).isQuiting = false;
