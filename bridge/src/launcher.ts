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
 *   --run       Skip setup check, just run the bridge
 *   --uninstall Remove the Windows service
 */

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import { execSync, exec } from "child_process"

// Where the exe lives (or the project root in dev)
const APP_DIR = path.dirname(process.execPath || __dirname)
const CONFIG_FILE = path.join(APP_DIR, "bridge-config.json")
const KEY_FILE = path.join(APP_DIR, "service-account-key.json")

interface BridgeConfig {
    installed: boolean
    keyPath: string
    wsPort: number
    httpPort: number
    installedAt: string
    serviceInstalled: boolean
}

const DEFAULT_CONFIG: BridgeConfig = {
    installed: false,
    keyPath: KEY_FILE,
    wsPort: 9000,
    httpPort: 9001,
    installedAt: "",
    serviceInstalled: false,
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

// ─── Setup Wizard ──────────────────────────────────────────

async function runSetup(): Promise<BridgeConfig> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const config = loadConfig()

    cls()
    banner()
    console.log("  Welcome! Let's get the monitor bridge set up.")
    console.log("  This will take about 2 minutes.\n")
    await pressEnter(rl)

    // ── Step 1: Firebase Service Account Key ──
    cls()
    banner()
    console.log("  STEP 1 of 4 — Firebase Service Account Key\n")
    console.log("  The bridge needs a key file to talk to Firebase.")
    console.log("  If you don't have one yet:\n")
    console.log("    1. Go to https://console.firebase.google.com")
    console.log("    2. Select the CentralReform project")
    console.log("    3. Gear icon → Project settings → Service accounts")
    console.log("    4. Click 'Generate new private key'")
    console.log("    5. Save the file\n")

    // Check common locations
    const possiblePaths = [
        KEY_FILE,
        path.join(APP_DIR, "serviceAccountKey.json"),
        path.join(APP_DIR, "firebase-key.json"),
    ]

    let keyPath = ""
    for (const p of possiblePaths) {
        if (fileExists(p)) {
            console.log(`  ✓ Found key file: ${path.basename(p)}\n`)
            const confirm = await ask(rl, `  Use this file? (Y/n): `)
            if (confirm.toLowerCase() !== "n") {
                keyPath = p
                break
            }
        }
    }

    if (!keyPath) {
        console.log("  Drop the key file into this folder:")
        console.log(`  ${APP_DIR}\n`)
        console.log("  Or type the full path to the file:\n")

        while (true) {
            const input = await ask(rl, "  Path to key file (or Enter to check folder again): ")

            if (input === "") {
                // Re-scan the folder
                for (const p of possiblePaths) {
                    if (fileExists(p)) {
                        keyPath = p
                        break
                    }
                }
                // Also scan for any .json file that looks like a service account key
                if (!keyPath) {
                    const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith(".json"))
                    for (const f of files) {
                        const fullPath = path.join(APP_DIR, f)
                        try {
                            const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"))
                            if (content.type === "service_account" && content.project_id) {
                                console.log(`\n  ✓ Found: ${f} (project: ${content.project_id})\n`)
                                const confirm = await ask(rl, "  Use this file? (Y/n): ")
                                if (confirm.toLowerCase() !== "n") {
                                    keyPath = fullPath
                                    break
                                }
                            }
                        } catch { /* not valid JSON */ }
                    }
                }
                if (keyPath) break
                console.log("\n  No key file found yet. Drop it in and try again.\n")
            } else {
                // User provided a path
                const cleaned = input.replace(/"/g, "").trim()
                if (fileExists(cleaned)) {
                    // Copy it to our directory as the standard name
                    const dest = path.join(APP_DIR, "service-account-key.json")
                    fs.copyFileSync(cleaned, dest)
                    keyPath = dest
                    console.log(`\n  ✓ Copied to ${path.basename(dest)}\n`)
                    break
                } else {
                    console.log(`\n  ✗ File not found: ${cleaned}\n`)
                }
            }
        }
    }

    // Validate the key file
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

    config.keyPath = keyPath
    await pressEnter(rl)

    // ── Step 2: Ports ──
    cls()
    banner()
    console.log("  STEP 2 of 4 — Network Ports\n")
    console.log(`  WebSocket port (iPads connect here):  ${config.wsPort}`)
    console.log(`  HTTP API port (health checks):        ${config.httpPort}\n`)
    const changePort = await ask(rl, "  Change ports? (y/N): ")

    if (changePort.toLowerCase() === "y") {
        const ws = await ask(rl, `  WebSocket port [${config.wsPort}]: `)
        if (ws && !isNaN(parseInt(ws))) config.wsPort = parseInt(ws)

        const http = await ask(rl, `  HTTP port [${config.httpPort}]: `)
        if (http && !isNaN(parseInt(http))) config.httpPort = parseInt(http)
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

    // --setup: Force setup wizard
    if (args.includes("--setup")) {
        const config = await runSetup()
        if (!config.serviceInstalled) {
            await startBridge(config)
        }
        return
    }

    // --run: Skip setup, just run (used by the service)
    if (args.includes("--run")) {
        const config = loadConfig()
        await startBridge(config)
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
