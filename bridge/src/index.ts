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
import * as https from "https"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { BridgeWSServer } from "./ws-server"
import { loadOrGenerateCert, TLSFiles } from "./cert"

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
    const version = process.env.BRIDGE_VERSION || "2.0.0"
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

    // 5. Load TLS certificate for secure WebSocket (wss://)
    //    Browsers block ws:// from https:// pages (mixed content).
    let tlsCert: TLSFiles | null = null
    try {
        tlsCert = loadOrGenerateCert()
    } catch (err) {
        console.warn("[Bridge] ⚠ Could not load/generate TLS certificate:", (err as Error).message)
        console.warn("[Bridge]   Falling back to plain ws:// — may not work from HTTPS pages")
    }

    // 6. Start HTTPS server (serves both WSS and the status/cert-trust API)
    const HTTP_PORT = parseInt(process.env.HTTP_PORT || "9001")
    let httpsServer: https.Server | null = null

    if (tlsCert) {
        httpsServer = https.createServer(
            { cert: tlsCert.cert, key: tlsCert.key },
            (req, res) => {
                // CORS for admin panel
                res.setHeader("Access-Control-Allow-Origin", "*")
                res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")

                if (req.method === "OPTIONS") {
                    res.writeHead(200)
                    res.end("")
                    return
                }

                // Cert trust landing page — users visit this URL to accept the self-signed cert
                if (req.url === "/" || req.url === "/trust") {
                    res.writeHead(200, { "Content-Type": "text/html" })
                    res.end(`<!DOCTYPE html>
<html><head><title>CentralReform Bridge</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;max-width:480px;margin:40px auto;padding:20px;background:#111;color:#eee}
h1{color:#8b5cf6}code{background:#333;padding:2px 6px;border-radius:4px}
.ok{color:#22c55e;font-size:2em}</style></head>
<body>
<h1>CentralReform Bridge</h1>
<p class="ok">✓ Connection Secure</p>
<p>Your device now trusts the bridge certificate.
You can close this tab and return to the app — monitor controls will connect automatically.</p>
<p><small>Bridge v${version} | ${x32.isConnected() ? "X32 connected" : "X32 not connected"}</small></p>
</body></html>`)
                    return
                }

                res.setHeader("Content-Type", "application/json")

                if (req.url === "/scan") {
                    console.log("[HTTPS] Scan requested from admin panel")
                    X32Client.discover(5000).then(result => {
                        if (result) {
                            console.log(`[HTTPS] Found: ${result.name} at ${result.address}`)
                            res.end(JSON.stringify({ found: true, ...result }))
                        } else {
                            res.end(JSON.stringify({ found: false }))
                        }
                    }).catch(() => res.end(JSON.stringify({ found: false })))
                    return
                }

                if (req.url === "/health") {
                    res.writeHead(200)
                    res.end(JSON.stringify({
                        status: "ok",
                        version: process.env.BRIDGE_VERSION || "2.0.0",
                        uptime: Math.round(process.uptime()),
                        x32Connected: x32.isConnected(),
                        clients: ws.getConnectedCount(),
                        ip: currentIp,
                    }))
                    return
                }

                if (req.url === "/status") {
                    res.writeHead(200)
                    res.end(JSON.stringify({
                        x32Connected: x32.isConnected(),
                        x32Address,
                        connectedClients: ws.getConnectedCount(),
                        monitorBuses: monitorConfig.monitorBuses,
                    }))
                    return
                }

                res.writeHead(404)
                res.end(JSON.stringify({ error: "Not found" }))
            }
        )

        httpsServer.listen(HTTP_PORT, () => {
            console.log(`[HTTPS] API on port ${HTTP_PORT} (https://0.0.0.0:${HTTP_PORT})`)
        })
    }

    // 7. Start WebSocket server — secure (wss://) if cert available, plain (ws://) as fallback
    const ws = tlsCert && httpsServer
        ? new BridgeWSServer({ server: httpsServer }, x32, config)
        : new BridgeWSServer({ port: WS_PORT }, x32, config)

    // 7b. Publish this bridge's URL to Firestore so iPads find it automatically
    let currentIp = getLocalIp()
    if (currentIp) {
        // Use wss:// when TLS is available (required for HTTPS-served web apps)
        const protocol = tlsCert ? "wss" : "ws"
        const port = tlsCert ? HTTP_PORT : WS_PORT
        const bridgeUrl = `${protocol}://${currentIp}:${port}`
        await config.updateBridgeUrl(bridgeUrl)
    } else {
        console.warn("[Bridge] ⚠ Could not detect local IP — iPads will use the last saved bridge URL")
    }

    // 7c. X32 reconnect handling — re-sync state when mixer comes back
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
                const protocol = tlsCert ? "wss" : "ws"
                const port = tlsCert ? HTTP_PORT : WS_PORT
                await config.updateBridgeUrl(`${protocol}://${currentIp}:${port}`)
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
            const protocol = tlsCert ? "wss" : "ws"
            const port = tlsCert ? HTTP_PORT : WS_PORT
            await config.updateBridgeUrl(`${protocol}://${currentIp}:${port}`)
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

    // Status logging
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
        if (httpsServer) httpsServer.close()
        process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    const protocol = tlsCert ? "wss" : "ws"
    const wsPort = tlsCert ? HTTP_PORT : WS_PORT
    console.log()
    console.log(`[Bridge] Ready!`)
    console.log(`  WebSocket: ${protocol}://${currentIp || "0.0.0.0"}:${wsPort}`)
    console.log(`  HTTPS API: https://${currentIp || "0.0.0.0"}:${HTTP_PORT}`)
    console.log(`  X32:       ${x32Address}:${x32Port}`)
    console.log(`  Buses:     ${monitorConfig.monitorBuses.join(", ")}`)
    console.log(`  Heartbeat: Every 60s → Firestore`)
    console.log(`  DHCP Guard: Monitoring IP changes`)
    if (currentIp) {
        console.log(`  Published: iPads will auto-connect via Firestore`)
        if (tlsCert) {
            console.log(`  Cert trust: https://${currentIp}:${HTTP_PORT}/trust`)
        }
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
