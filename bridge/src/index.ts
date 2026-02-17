/**
 * CentralReform X32 Monitor Bridge
 * 
 * This server runs on the production PC at CRC and bridges
 * WebSocket connections from iPads to OSC commands for the X32.
 * 
 * Setup:
 *   1. Copy .env.example → .env and fill in values
 *   2. npm install
 *   3. npm run dev  (development)  or  npm start  (production)
 * 
 * The bridge:
 *   - Connects to the X32 via OSC (UDP)
 *   - Reads config from Firestore (config/monitor)
 *   - Accepts WebSocket connections from authenticated iPads
 *   - Syncs fader state bidirectionally in real-time
 */

import * as dotenv from "dotenv"
dotenv.config()

import * as os from "os"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { BridgeWSServer } from "./ws-server"

const WS_PORT = parseInt(process.env.WS_PORT || "9000")

/**
 * Detect this machine's LAN IP address.
 * Picks the first non-internal IPv4 address, preferring Ethernet over Wi-Fi.
 */
function getLocalIp(): string | null {
    const interfaces = os.networkInterfaces()
    const candidates: { address: string; name: string }[] = []

    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const iface of addrs || []) {
            if (iface.family === "IPv4" && !iface.internal) {
                candidates.push({ address: iface.address, name })
            }
        }
    }

    if (candidates.length === 0) return null

    // Prefer wired (Ethernet) over wireless
    const wired = candidates.find(c =>
        /ethernet|eth\d|en\d/i.test(c.name)
    )
    return wired?.address || candidates[0].address
}

async function main() {
    const version = process.env.BRIDGE_VERSION || "1.1.0"
    console.log("╔═══════════════════════════════════════════╗")
    console.log(`║  CentralReform X32 Monitor Bridge v${version}  ║`)
    console.log("╚═══════════════════════════════════════════╝")
    console.log()

    // 1. Load config from Firestore
    const config = new ConfigManager()
    const monitorConfig = await config.loadConfig()

    // 1b. Check for another running bridge instance
    const existing = await config.checkForRunningInstance()
    if (existing.running) {
        console.warn(`[Bridge] ⚠ Another bridge instance appears to be running!`)
        console.warn(`         Last seen: ${existing.lastSeen?.toISOString()}`)
        console.warn(`         IP: ${existing.localIp}`)
        console.warn(`         Continuing anyway — this instance will take over.`)
        console.warn()
    }

    // 2. Discover or use configured X32 address
    let x32Address = monitorConfig.x32Address
    let x32Port = monitorConfig.x32Port

    console.log("[X32] Scanning network for X32 mixer...")
    const discovered = await X32Client.discover(5000, x32Port)

    if (discovered) {
        console.log(`[X32] ✓ Found ${discovered.name} (${discovered.model}) at ${discovered.address}`)
        console.log(`[X32]   Firmware: ${discovered.firmware}`)
        x32Address = discovered.address

        // Update Firestore config if address changed
        if (discovered.address !== monitorConfig.x32Address) {
            console.log(`[X32]   Updating saved address: ${monitorConfig.x32Address} → ${discovered.address}`)
            await config.updateX32Address(discovered.address)
        }
    } else {
        console.log(`[X32] ✗ No X32 found via broadcast — falling back to configured address: ${x32Address}`)
    }

    // 3. Connect to X32
    const x32 = new X32Client({
        address: x32Address,
        port: x32Port,
    })

    try {
        await x32.connect()
    } catch (err) {
        console.error("\n❌ Could not connect to X32!")
        console.error("   Check that:")
        console.error(`   • The X32 is powered on and at ${x32Address}`)
        console.error(`   • Port ${x32Port} is accessible (default: 10023)`)
        console.error(`   • This PC is on the same network as the X32`)
        console.error()
        console.error("   The bridge will start anyway and retry when iPads connect.")
        console.error("   Update the X32 IP in the CentralReform admin panel.\n")
    }

    // 4. Sync full mixer state
    if (x32.isConnected()) {
        await x32.syncFullState(monitorConfig.monitorBuses)
    }

    // 5. Start WebSocket server
    const ws = new BridgeWSServer(WS_PORT, x32, config)

    // 5b. Publish this bridge's URL to Firestore so iPads find it automatically
    let currentIp = getLocalIp()
    if (currentIp) {
        const bridgeUrl = `ws://${currentIp}:${WS_PORT}`
        await config.updateBridgeUrl(bridgeUrl)
    } else {
        console.warn("[Bridge] ⚠ Could not detect local IP — iPads will use the last saved bridge URL")
    }

    // 5c. X32 reconnect handling — re-sync state when mixer comes back
    x32.on("disconnected", () => {
        console.warn("[Bridge] X32 connection lost — fader changes will not work until reconnected")
    })
    x32.on("reconnected", async () => {
        console.log("[Bridge] X32 reconnected — resyncing mixer state")
        await x32.syncFullState(monitorConfig.monitorBuses)
    })

    // ── Heartbeat + DHCP Guard + Sleep Detection (shared 60s loop) ──

    let lastTick = Date.now()

    const heartbeatLoop = async () => {
        const now = Date.now()
        const elapsed = now - lastTick
        lastTick = now

        // Sleep/wake detection: if >90s since last tick, we probably slept
        if (elapsed > 90_000) {
            console.log(`[Bridge] ⏰ Wake detected (${Math.round(elapsed / 1000)}s gap) — reinitializing`)

            // Re-detect IP
            const newIp = getLocalIp()
            if (newIp && newIp !== currentIp) {
                currentIp = newIp
                await config.updateBridgeUrl(`ws://${currentIp}:${WS_PORT}`)
                console.log(`[Bridge] IP changed after wake: ${currentIp}`)
            }

            // X32 will reconnect via its own health check loop
            // Just log the wake event
        }

        // DHCP guard: check if IP changed
        const newIp = getLocalIp()
        if (newIp && newIp !== currentIp) {
            console.log(`[Bridge] 🔄 IP changed: ${currentIp} → ${newIp}`)
            currentIp = newIp
            await config.updateBridgeUrl(`ws://${currentIp}:${WS_PORT}`)
        }

        // Heartbeat: write status to Firestore
        await config.writeHeartbeat({
            x32Connected: x32.isConnected(),
            clients: ws.getConnectedCount(),
            localIp: currentIp,
        })
    }

    // First heartbeat immediately
    await heartbeatLoop()
    // Then every 60 seconds
    const heartbeatInterval = setInterval(heartbeatLoop, 60_000)

    // 6. Watch for config changes
    config.startWatching()

    // Re-sync when monitor buses change
    config.onChange(async (newConfig) => {
        if (x32.isConnected()) {
            console.log("[Bridge] Config changed — resyncing buses:", newConfig.monitorBuses)
            await x32.syncFullState(newConfig.monitorBuses)
        }
    })

    // 6. Start HTTP API (for admin panel scan + status)
    const http = require("http")
    const HTTP_PORT = parseInt(process.env.HTTP_PORT || "9001")
    const httpServer = http.createServer(async (req: { method: string; url: string }, res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }) => {
        // CORS for admin panel
        res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Content-Type": "application/json",
        })

        if (req.method === "OPTIONS") {
            res.end("")
            return
        }

        if (req.url === "/scan") {
            console.log("[HTTP] Scan requested from admin panel")
            const result = await X32Client.discover(5000)
            if (result) {
                console.log(`[HTTP] Found: ${result.name} at ${result.address}`)
                res.end(JSON.stringify({ found: true, ...result }))
            } else {
                res.end(JSON.stringify({ found: false }))
            }
            return
        }

        if (req.url === "/health") {
            // Simple health check for Docker/monitoring — returns 200 if running
            const uptime = process.uptime()
            res.end(JSON.stringify({
                status: "ok",
                version: process.env.BRIDGE_VERSION || "1.1.0",
                uptime: Math.round(uptime),
                x32Connected: x32.isConnected(),
                clients: ws.getConnectedCount(),
                ip: currentIp,
            }))
            return
        }

        if (req.url === "/status") {
            res.end(JSON.stringify({
                x32Connected: x32.isConnected(),
                x32Address,
                connectedClients: ws.getConnectedCount(),
                monitorBuses: monitorConfig.monitorBuses,
            }))
            return
        }

        res.end(JSON.stringify({ error: "Not found" }))
    })
    httpServer.listen(HTTP_PORT, () => {
        console.log(`[HTTP] API on port ${HTTP_PORT} (scan: http://0.0.0.0:${HTTP_PORT}/scan)`)
    })

    // 7. Status logging
    setInterval(() => {
        const connected = ws.getConnectedCount()
        if (connected > 0) {
            console.log(`[Bridge] ${connected} iPad(s) connected | X32: ${x32.isConnected() ? "✓" : "✗"}`)
        }
    }, 30000)

    // Graceful shutdown
    const shutdown = async () => {
        console.log("\n[Bridge] Shutting down...")
        clearInterval(heartbeatInterval)
        await config.writeOffline()
        config.stopWatching()
        x32.disconnect()
        ws.close()
        httpServer.close()
        process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    console.log()
    console.log(`[Bridge] Ready!`)
    console.log(`  WebSocket: ws://${currentIp || "0.0.0.0"}:${WS_PORT}`)
    console.log(`  HTTP API:  http://${currentIp || "0.0.0.0"}:${HTTP_PORT}`)
    console.log(`  X32:       ${x32Address}:${x32Port}`)
    console.log(`  Buses:     ${monitorConfig.monitorBuses.join(", ")}`)
    console.log(`  Heartbeat: Every 60s → Firestore`)
    console.log(`  DHCP Guard: Monitoring IP changes`)
    if (currentIp) {
        console.log(`  Published: iPads will auto-connect via Firestore`)
    }
    console.log()
}

export { main }

// Auto-run when executed directly (not when required by launcher)
if (require.main === module) {
    main().catch((err) => {
        console.error("Fatal error:", err)
        process.exit(1)
    })
}
