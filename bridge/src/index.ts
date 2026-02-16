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

import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { BridgeWSServer } from "./ws-server"

const WS_PORT = parseInt(process.env.WS_PORT || "9000")

async function main() {
    console.log("╔═══════════════════════════════════════════╗")
    console.log("║  CentralReform X32 Monitor Bridge v1.0   ║")
    console.log("╚═══════════════════════════════════════════╝")
    console.log()

    // 1. Load config from Firestore
    const config = new ConfigManager()
    const monitorConfig = await config.loadConfig()

    // 2. Connect to X32
    const x32 = new X32Client({
        address: monitorConfig.x32Address,
        port: monitorConfig.x32Port,
    })

    try {
        await x32.connect()
    } catch (err) {
        console.error("\n❌ Could not connect to X32!")
        console.error("   Check that:")
        console.error(`   • The X32 is powered on and at ${monitorConfig.x32Address}`)
        console.error(`   • Port ${monitorConfig.x32Port} is accessible (default: 10023)`)
        console.error(`   • This PC is on the same network as the X32`)
        console.error()
        console.error("   The bridge will start anyway and retry when iPads connect.")
        console.error("   Update the X32 IP in the CentralReform admin panel.\n")
    }

    // 3. Sync full mixer state
    if (x32.isConnected()) {
        await x32.syncFullState(monitorConfig.monitorBuses)
    }

    // 4. Start WebSocket server
    const ws = new BridgeWSServer(WS_PORT, x32, config)

    // 5. Watch for config changes
    config.startWatching()

    // Re-sync when monitor buses change
    config.onChange(async (newConfig) => {
        if (x32.isConnected()) {
            console.log("[Bridge] Config changed — resyncing buses:", newConfig.monitorBuses)
            await x32.syncFullState(newConfig.monitorBuses)
        }
    })

    // 6. Status logging
    setInterval(() => {
        const connected = ws.getConnectedCount()
        if (connected > 0) {
            console.log(`[Bridge] ${connected} iPad(s) connected | X32: ${x32.isConnected() ? "✓" : "✗"}`)
        }
    }, 30000)

    // Graceful shutdown
    const shutdown = () => {
        console.log("\n[Bridge] Shutting down...")
        config.stopWatching()
        x32.disconnect()
        ws.close()
        process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    console.log()
    console.log(`[Bridge] Ready!`)
    console.log(`  WebSocket: ws://0.0.0.0:${WS_PORT}`)
    console.log(`  X32:       ${monitorConfig.x32Address}:${monitorConfig.x32Port}`)
    console.log(`  Buses:     ${monitorConfig.monitorBuses.join(", ")}`)
    console.log()
}

main().catch((err) => {
    console.error("Fatal error:", err)
    process.exit(1)
})
