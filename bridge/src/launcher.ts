/**
 * CentralReform Bridge — Smart Launcher
 * 
 * This is the entry point for the packaged .exe.
 * 
 * On first run:  Walks the user through setup (find key file, firewall, service)
 * On later runs:  Just starts the bridge normally
 * 
 * CLI flags:
 *   --setup     Force re-run the setup wizard
 *   --run       Skip setup check, just run the bridge (used by service)
 *   --uninstall Remove the Windows service
 */

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import * as net from "net"
import { execSync, exec } from "child_process"

// Where the exe lives (or the project root in dev)
const APP_DIR = path.dirname(process.execPath || __dirname)
const CONFIG_FILE = path.join(APP_DIR, "bridge-config.json")
const KEY_FILE = path.join(APP_DIR, "service-account-key.json")
const VERSION = "1.2.0"

interface BridgeConfig {
    installed: boolean
    keyPath: string
    wsPort: number
    httpPort: number
    installedAt: string
    serviceInstalled: boolean
    appUrl: string
}

const DEFAULT_CONFIG: BridgeConfig = {
    installed: false,
    keyPath: KEY_FILE,
    wsPort: 9000,
    httpPort: 9001,
    installedAt: "",
    serviceInstalled: false,
    appUrl: "",
}

// ─── Helpers ───────────────────────────────────────────────

function cls() {
    process.stdout.write("\x1B[2J\x1B[0f")
}

function banner() {
    console.log()
    console.log("  ╔═══════════════════════════════════════════════════╗")
    console.log("  ║                                                   ║")
    console.log("  ║     CentralReform X32 Monitor Bridge              ║")
    console.log("  ║                                                   ║")
    console.log("  ╚═══════════════════════════════════════════════════╝")
    console.log()
}

function loadConfig(): BridgeConfig {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) }
        }
    } catch { /* ignore */ }
    return DEFAULT_CONFIG
}

function saveConfig(config: BridgeConfig) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()))
    })
}

async function pressEnter(rl: readline.Interface, msg = "  Press Enter to continue...") {
    await ask(rl, msg)
}

function fileExists(p: string): boolean {
    try { return fs.existsSync(p) && fs.statSync(p).isFile() } catch { return false }
}

function isAdmin(): boolean {
    try {
        execSync("net session", { stdio: "ignore" })
        return true
    } catch {
        return false
    }
}

/**
 * Self-elevate to admin via UAC prompt.
 * Returns true if we re-launched elevated (caller should exit).
 * Returns false if already admin or elevation failed.
 */
function selfElevate(): boolean {
    if (isAdmin()) return false
    if (process.platform !== "win32") return false

    try {
        const exePath = process.execPath
        const args = process.argv.slice(1).join(" ")
        // Use PowerShell Start-Process with -Verb RunAs for UAC prompt
        execSync(
            `powershell -Command "Start-Process '${exePath}' -ArgumentList '${args}' -Verb RunAs"`,
            { stdio: "ignore" }
        )
        return true // We launched an elevated copy — caller should exit
    } catch {
        // User clicked "No" on UAC or it failed
        return false
    }
}

/**
 * Check if a port is available.
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.once("error", () => resolve(false))
        server.once("listening", () => {
            server.close(() => resolve(true))
        })
        server.listen(port, "0.0.0.0")
    })
}

/**
 * Check GitHub releases for a newer version. Notify-only, no auto-download.
 */
async function checkForUpdates(): Promise<void> {
    try {
        const https = require("https")
        const data: string = await new Promise((resolve, reject) => {
            const req = https.get(
                "https://api.github.com/repos/RavBogard/sheet-music-app/releases/latest",
                { headers: { "User-Agent": "CentralReform-Bridge" }, timeout: 5000 },
                (res: { statusCode: number; on: (e: string, cb: (d: Buffer) => void) => void }) => {
                    if (res.statusCode !== 200) { reject(new Error("not found")); return }
                    let body = ""
                    res.on("data", (d: Buffer) => body += d)
                    res.on("end", () => resolve(body))
                }
            )
            req.on("error", reject)
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")) })
        })

        const release = JSON.parse(data)
        const latestVersion = (release.tag_name || "").replace(/^v/, "")

        if (latestVersion && latestVersion !== VERSION && compareVersions(latestVersion, VERSION) > 0) {
            console.log()
            console.log(`  ╔═════════════════════════════════════════════════╗`)
            console.log(`  ║  ⬆ Update available: v${VERSION} → v${latestVersion.padEnd(30)}║`)
            console.log(`  ║  Download: ${(release.html_url || "").slice(0, 39).padEnd(39)}║`)
            console.log(`  ╚═════════════════════════════════════════════════╝`)
            console.log()
        }
    } catch {
        // No internet, no releases, whatever — silently skip
    }
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number)
    const pb = b.split(".").map(Number)
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1
        if ((pa[i] || 0) < (pb[i] || 0)) return -1
    }
    return 0
}

/**
 * Open a URL in the default browser.
 */
function openBrowser(url: string): void {
    try {
        if (process.platform === "win32") {
            execSync(`start "" "${url}"`, { stdio: "ignore" })
        } else if (process.platform === "darwin") {
            execSync(`open "${url}"`, { stdio: "ignore" })
        } else {
            execSync(`xdg-open "${url}"`, { stdio: "ignore" })
        }
    } catch { /* browser didn't open, not critical */ }
}

// ─── Setup Code Activation ─────────────────────────────────

/**
 * Call the app's API to redeem a setup code for Firebase credentials.
 */
async function activateSetupCode(code: string): Promise<{ success: boolean; credentials?: Record<string, unknown>; error?: string }> {
    try {
        const config = loadConfig()
        const appUrl = config.appUrl

        if (!appUrl) {
            return { success: false, error: "App URL not set — enter your site URL first" }
        }

        const url = `${appUrl}/api/bridge/setup-code?code=${encodeURIComponent(code)}`
        const isHttps = url.startsWith("https://")
        const httpModule = require(isHttps ? "https" : "http")

        const { statusCode, body }: { statusCode: number; body: string } = await new Promise((resolve, reject) => {
            const req = httpModule.get(url, { timeout: 10000 },
                (res: { statusCode: number; on: (e: string, cb: (d: Buffer) => void) => void }) => {
                    let data = ""
                    res.on("data", (d: Buffer) => data += d)
                    res.on("end", () => resolve({ statusCode: res.statusCode, body: data }))
                }
            )
            req.on("error", (err: Error) => {
                // Translate common network errors to human-readable messages
                if (err.message.includes("ENOTFOUND")) {
                    reject(new Error(`Site not found — check the URL (${appUrl})`))
                } else if (err.message.includes("ECONNREFUSED")) {
                    reject(new Error("Connection refused — is the site running?"))
                } else {
                    reject(err)
                }
            })
            req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out — check your internet connection")) })
        })

        // Handle non-JSON responses (e.g. Vercel error pages, wrong URL)
        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(body)
        } catch {
            if (statusCode === 404) {
                return { success: false, error: "API not found — check your site URL" }
            }
            return { success: false, error: `Unexpected response from server (HTTP ${statusCode})` }
        }

        if (parsed.credentials) {
            return { success: true, credentials: parsed.credentials as Record<string, unknown> }
        }
        return { success: false, error: (parsed.error as string) || "Unknown error" }
    } catch (err) {
        return { success: false, error: (err as Error).message }
    }
}

/**
 * Fallback: find a key file on disk (the old manual flow).
 */
async function findKeyFile(rl: readline.Interface, possiblePaths: string[]): Promise<string> {
    console.log("\n  Drop the key file into this folder:")
    console.log(`  ${APP_DIR}\n`)
    console.log("  Or type the full path to the file:\n")

    while (true) {
        const input = await ask(rl, "  Path to key file (or Enter to check folder again): ")

        if (input === "") {
            // Re-scan the folder
            for (const p of possiblePaths) {
                if (fileExists(p)) return p
            }
            // Also scan for any .json file that looks like a service account key
            const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith(".json"))
            for (const f of files) {
                const fullPath = path.join(APP_DIR, f)
                try {
                    const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"))
                    if (content.type === "service_account" && content.project_id) {
                        console.log(`\n  ✓ Found: ${f} (project: ${content.project_id})\n`)
                        const confirm = await ask(rl, "  Use this file? (Y/n): ")
                        if (confirm.toLowerCase() !== "n") return fullPath
                    }
                } catch { /* not valid JSON */ }
            }
            console.log("\n  No key file found yet. Drop it in and try again.\n")
        } else {
            // User provided a path
            const cleaned = input.replace(/"/g, "").trim()
            if (fileExists(cleaned)) {
                const dest = path.join(APP_DIR, "service-account-key.json")
                fs.copyFileSync(cleaned, dest)
                console.log(`\n  ✓ Copied to ${path.basename(dest)}\n`)
                return dest
            } else {
                console.log(`\n  ✗ File not found: ${cleaned}\n`)
            }
        }
    }
}

// ─── Setup Wizard ──────────────────────────────────────────

async function runSetup(): Promise<BridgeConfig> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const config = loadConfig()

    cls()
    banner()
    console.log("  Welcome! Let's get the monitor bridge set up.")
    console.log("  This will take about 2 minutes.\n")
    await pressEnter(rl)

    // ── Step 1: Firebase Credentials ──
    cls()
    banner()
    console.log("  STEP 1 of 4 — Connect to Firebase\n")

    // Check if key file already exists
    const possiblePaths = [
        KEY_FILE,
        path.join(APP_DIR, "serviceAccountKey.json"),
        path.join(APP_DIR, "firebase-key.json"),
    ]

    let keyPath = ""
    let keyValidated = false
    for (const p of possiblePaths) {
        if (fileExists(p)) {
            try {
                const content = JSON.parse(fs.readFileSync(p, "utf-8"))
                if (content.type === "service_account" || (content.project_id && content.private_key)) {
                    console.log(`  ✓ Key file already exists: ${path.basename(p)}`)
                    console.log(`    Project: ${content.project_id}\n`)
                    const confirm = await ask(rl, "  Use this file? (Y/n): ")
                    if (confirm.toLowerCase() !== "n") {
                        keyPath = p
                        keyValidated = true
                    }
                }
            } catch { /* not valid */ }
            if (keyPath) break
        }
    }

    if (!keyPath) {
        console.log("  The easiest way: get a setup code from the admin panel.\n")

        // Get the app URL (needed to call the setup code API)
        if (!config.appUrl) {
            console.log("  First, what's your CentralReform site address?")
            console.log("  (This is where musicians log in — e.g., https://your-app.vercel.app)\n")
            while (true) {
                const urlInput = await ask(rl, "  Site URL: ")
                const trimmedUrl = urlInput.trim().replace(/\/+$/, "") // strip trailing slashes
                if (trimmedUrl.startsWith("https://")) {
                    config.appUrl = trimmedUrl
                    saveConfig(config)
                    console.log()
                    break
                } else if (trimmedUrl.startsWith("http://")) {
                    config.appUrl = trimmedUrl
                    saveConfig(config)
                    console.log()
                    break
                } else if (trimmedUrl.includes(".")) {
                    // They forgot the protocol
                    config.appUrl = `https://${trimmedUrl}`
                    saveConfig(config)
                    console.log(`  → Using ${config.appUrl}\n`)
                    break
                }
                console.log("  ✗ Please enter a full URL (e.g., https://your-app.vercel.app)\n")
            }
        }

        console.log("  Now get a setup code:")
        console.log("    1. Open your CentralReform admin panel → Sound System")
        console.log("    2. Click 'Generate Setup Code'")
        console.log("    3. Enter the 6-character code below\n")
        console.log("  (If you have a key file instead, type 'file')\n")

        while (true) {
            const input = await ask(rl, "  Setup code (or 'file' for key file): ")
            const trimmed = input.trim().toUpperCase()

            if (trimmed === "FILE") {
                // Fall back to key file flow
                keyPath = await findKeyFile(rl, possiblePaths)
                break
            }

            if (trimmed.length === 6 && /^[A-Z0-9]+$/.test(trimmed)) {
                console.log("\n  Activating...")
                const result = await activateSetupCode(trimmed)
                if (result.success && result.credentials) {
                    // Save the credentials as our key file
                    const dest = path.join(APP_DIR, "service-account-key.json")
                    fs.writeFileSync(dest, JSON.stringify(result.credentials, null, 2))
                    keyPath = dest
                    keyValidated = true
                    console.log(`  ✓ Credentials saved! (project: ${result.credentials.project_id})\n`)
                    break
                } else {
                    console.log(`  ✗ ${result.error}\n`)
                    if (result.error?.includes("expired") || result.error?.includes("already used")) {
                        console.log("  Generate a new code from the admin panel and try again.\n")
                    }
                }
            } else if (trimmed.length > 0) {
                console.log("  ✗ Code should be 6 characters (letters and numbers)\n")
            }
        }
    }

    // Validate the key file (skip if already validated above)
    if (!keyValidated) {
        try {
            const keyContent = JSON.parse(fs.readFileSync(keyPath, "utf-8"))
            if (keyContent.type !== "service_account") {
                console.log("\n  ⚠ Warning: This doesn't look like a Firebase service account key.")
                console.log("  Continuing anyway — the bridge will error on startup if it's wrong.\n")
            } else {
                console.log(`  ✓ Valid key for project: ${keyContent.project_id}\n`)
            }
        } catch {
            console.log("\n  ⚠ Couldn't read the key file. Continuing anyway.\n")
        }
    }

    config.keyPath = keyPath
    await pressEnter(rl)

    // ── Step 2: Ports ──
    cls()
    banner()
    console.log("  STEP 2 of 4 — Network Ports\n")
    console.log(`  WebSocket port (iPads connect here):  ${config.wsPort}`)
    console.log(`  HTTP API port (health checks):        ${config.httpPort}\n`)

    // Check for port conflicts
    const wsAvailable = await isPortAvailable(config.wsPort)
    const httpAvailable = await isPortAvailable(config.httpPort)

    if (!wsAvailable || !httpAvailable) {
        if (!wsAvailable) console.log(`  ⚠ Port ${config.wsPort} is already in use!`)
        if (!httpAvailable) console.log(`  ⚠ Port ${config.httpPort} is already in use!`)
        console.log("  Another program (or a previous bridge instance) may be using these ports.\n")
    }

    const changePort = await ask(rl, "  Change ports? (y/N): ")

    if (changePort.toLowerCase() === "y") {
        let wsPort = config.wsPort
        let httpPort = config.httpPort

        while (true) {
            const ws = await ask(rl, `  WebSocket port [${wsPort}]: `)
            if (ws && !isNaN(parseInt(ws))) wsPort = parseInt(ws)

            const http = await ask(rl, `  HTTP port [${httpPort}]: `)
            if (http && !isNaN(parseInt(http))) httpPort = parseInt(http)

            const wsOk = await isPortAvailable(wsPort)
            const httpOk = await isPortAvailable(httpPort)

            if (wsOk && httpOk) {
                config.wsPort = wsPort
                config.httpPort = httpPort
                break
            }

            if (!wsOk) console.log(`  ⚠ Port ${wsPort} is in use. Try another.`)
            if (!httpOk) console.log(`  ⚠ Port ${httpPort} is in use. Try another.`)
        }
    }

    console.log(`\n  ✓ Ports: WebSocket=${config.wsPort}, HTTP=${config.httpPort}\n`)
    await pressEnter(rl)

    // ── Step 3: Firewall ──
    cls()
    banner()
    console.log("  STEP 3 of 4 — Windows Firewall\n")
    console.log("  Musicians' iPads need to reach this PC on the network.")
    console.log(`  The bridge needs ports ${config.wsPort} and ${config.httpPort} open.\n`)

    if (isAdmin()) {
        const doFirewall = await ask(rl, "  Open firewall ports automatically? (Y/n): ")
        if (doFirewall.toLowerCase() !== "n") {
            try {
                // Remove old rules if they exist (ignore errors)
                try { execSync('netsh advfirewall firewall delete rule name="CentralReform Bridge"', { stdio: "ignore" }) } catch { /* ok */ }

                execSync(
                    `netsh advfirewall firewall add rule name="CentralReform Bridge" dir=in action=allow protocol=TCP localport=${config.wsPort},${config.httpPort}`,
                    { stdio: "ignore" }
                )
                console.log("  ✓ Firewall rules added!\n")
            } catch (err) {
                console.log("  ✗ Failed to add firewall rules. You may need to add them manually.\n")
            }
        }
    } else {
        console.log("  ⚠ Not running as Administrator — can't modify firewall automatically.")
        console.log("  To add rules manually:")
        console.log("    1. Open Windows Defender Firewall → Advanced settings")
        console.log("    2. Inbound Rules → New Rule → Port → TCP")
        console.log(`    3. Enter: ${config.wsPort}, ${config.httpPort}`)
        console.log("    4. Allow the connection → Name it 'CentralReform Bridge'\n")
    }

    await pressEnter(rl)

    // ── Step 4: Windows Service ──
    cls()
    banner()
    console.log("  STEP 4 of 4 — Auto-Start Service\n")
    console.log("  Install as a Windows service so the bridge starts")
    console.log("  automatically whenever this PC boots up.\n")

    const doService = await ask(rl, "  Install auto-start service? (Y/n): ")
    if (doService.toLowerCase() !== "n") {
        try {
            installService(config)
            config.serviceInstalled = true
            console.log("\n  ✓ Service installed! The bridge will start on boot.\n")
        } catch (err) {
            console.log(`\n  ✗ Service installation failed: ${err}`)
            console.log("  You can still run the bridge manually by double-clicking this file.\n")
            config.serviceInstalled = false
        }
    } else {
        console.log("\n  OK — you can always install the service later with: bridge.exe --setup\n")
        config.serviceInstalled = false
    }

    // ── Done! ──
    config.installed = true
    config.installedAt = new Date().toISOString()
    saveConfig(config)

    cls()
    banner()
    console.log("  ✓ Setup complete!\n")
    console.log("  Next steps:")
    console.log("    1. Open the CentralReform admin panel → Sound System")
    console.log("    2. The Bridge URL is auto-detected — no need to enter it")
    console.log("    3. Assign monitor buses to your musicians")
    console.log("    4. Test from an iPad!\n")

    // Show this PC's IP addresses
    try {
        const os = require("os")
        const interfaces = os.networkInterfaces()
        const ips: string[] = []
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === "IPv4" && !iface.internal) {
                    ips.push(`${iface.address} (${name})`)
                }
            }
        }
        if (ips.length > 0) {
            console.log("  This PC's network addresses:")
            for (const ip of ips) {
                console.log(`    • ${ip}`)
            }
            console.log()
        }
    } catch { /* os module not available */ }

    if (config.serviceInstalled) {
        console.log("  The bridge is running as a service in the background.")
        console.log("  You can close this window.\n")
    } else {
        const startNow = await ask(rl, "  Start the bridge now? (Y/n): ")
        rl.close()
        if (startNow.toLowerCase() !== "n") {
            return config
        }
    }

    rl.close()
    return config
}

// ─── Service Management ────────────────────────────────────

function installService(config: BridgeConfig) {
    const exePath = process.execPath
    const nssm = findOrDownloadNSSM()

    if (!nssm) {
        throw new Error("Could not find or download NSSM (service manager)")
    }

    // Remove existing service if any
    try { execSync(`"${nssm}" stop CentralReformBridge`, { stdio: "ignore" }) } catch { /* ok */ }
    try { execSync(`"${nssm}" remove CentralReformBridge confirm`, { stdio: "ignore" }) } catch { /* ok */ }

    // Install new service
    execSync(`"${nssm}" install CentralReformBridge "${exePath}" --run`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge DisplayName "CentralReform Monitor Bridge"`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge Description "Connects iPads to the X32 mixer for monitor control"`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge Start SERVICE_AUTO_START`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge AppDirectory "${APP_DIR}"`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge AppStdout "${path.join(APP_DIR, "bridge.log")}"`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge AppStderr "${path.join(APP_DIR, "bridge.log")}"`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge AppRotateFiles 1`, { stdio: "ignore" })
    execSync(`"${nssm}" set CentralReformBridge AppRotateBytes 10485760`, { stdio: "ignore" })

    // Set environment variables
    const envVars = [
        `FIREBASE_SA_KEY_PATH=${config.keyPath}`,
        `WS_PORT=${config.wsPort}`,
        `HTTP_PORT=${config.httpPort}`,
        `NODE_ENV=production`,
    ].join("\n")
    execSync(`"${nssm}" set CentralReformBridge AppEnvironmentExtra ${envVars}`, { stdio: "ignore" })

    // Start it
    execSync(`"${nssm}" start CentralReformBridge`, { stdio: "ignore" })
}

function uninstallService() {
    const nssm = findOrDownloadNSSM()
    if (!nssm) {
        console.log("  Could not find NSSM. Service may not be installed.")
        return
    }
    try { execSync(`"${nssm}" stop CentralReformBridge`, { stdio: "ignore" }) } catch { /* ok */ }
    try { execSync(`"${nssm}" remove CentralReformBridge confirm`, { stdio: "ignore" }) } catch { /* ok */ }
    console.log("  ✓ Service removed.")
}

function findOrDownloadNSSM(): string | null {
    // Check if NSSM is bundled alongside the exe
    const bundled = path.join(APP_DIR, "nssm.exe")
    if (fileExists(bundled)) return bundled

    // Check PATH
    try {
        execSync("nssm version", { stdio: "ignore" })
        return "nssm"
    } catch { /* not on PATH */ }

    // Download NSSM
    console.log("  Downloading service manager (NSSM)...")
    try {
        execSync(
            `powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '${path.join(APP_DIR, "nssm.zip")}';"` +
            `" Expand-Archive -Path '${path.join(APP_DIR, "nssm.zip")}' -DestinationPath '${APP_DIR}' -Force;"` +
            `" Copy-Item '${path.join(APP_DIR, "nssm-2.24", "win64", "nssm.exe")}' '${bundled}';"` +
            `" Remove-Item '${path.join(APP_DIR, "nssm.zip")}' -Force;"` +
            `" Remove-Item '${path.join(APP_DIR, "nssm-2.24")}' -Recurse -Force"`,
            { stdio: "ignore" }
        )
        if (fileExists(bundled)) {
            console.log("  ✓ Downloaded\n")
            return bundled
        }
    } catch { /* download failed */ }

    return null
}

// ─── Main Entry Point ──────────────────────────────────────

async function main() {
    const args = process.argv.slice(2)

    // --uninstall: Remove service and exit
    if (args.includes("--uninstall")) {
        banner()
        uninstallService()
        const config = loadConfig()
        config.serviceInstalled = false
        saveConfig(config)
        process.exit(0)
    }

    // --run: Skip setup, just run (used by the service — never elevate)
    if (args.includes("--run")) {
        const config = loadConfig()
        process.env.BRIDGE_VERSION = VERSION
        await startBridge(config)
        return
    }

    // Self-elevate to admin for firewall access (interactive mode only)
    if (process.platform === "win32" && !isAdmin()) {
        console.log("\n  This program needs Administrator access for firewall setup.")
        console.log("  Requesting elevation...\n")
        if (selfElevate()) {
            // Successfully launched elevated copy — exit this one
            process.exit(0)
        }
        // Elevation failed or denied — continue without admin
        console.log("  Continuing without admin — firewall rules may need manual setup.\n")
    }

    // Check for updates (non-blocking, notify only)
    await checkForUpdates()

    // --setup: Force setup wizard
    if (args.includes("--setup")) {
        const config = await runSetup()
        if (!config.serviceInstalled) {
            await startBridge(config)
        }
        return
    }

    // Default: Check if setup has been done
    const config = loadConfig()
    if (!config.installed || !fileExists(config.keyPath)) {
        // First run — launch wizard
        const updatedConfig = await runSetup()
        if (!updatedConfig.serviceInstalled) {
            await startBridge(updatedConfig)
        }
    } else {
        // Already set up — just run
        console.log()
        banner()
        console.log("  Bridge is configured. Starting...\n")
        console.log("  (Run with --setup to reconfigure)\n")
        await startBridge(config)
    }
}

async function startBridge(config: BridgeConfig) {
    // Set environment variables for the bridge
    process.env.FIREBASE_SA_KEY_PATH = config.keyPath
    process.env.WS_PORT = String(config.wsPort)
    process.env.HTTP_PORT = String(config.httpPort)
    process.env.NODE_ENV = "production"
    process.env.BRIDGE_VERSION = VERSION

    // Import and run the actual bridge
    const { main: bridgeMain } = require("./index")
    await bridgeMain()
}

main().catch((err) => {
    console.error("\n  Fatal error:", err.message || err)
    console.error("  Check that your service account key is valid and your network is connected.\n")
    // Keep the window open so the user can read the error
    setTimeout(() => process.exit(1), 30000)
})
