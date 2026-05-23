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
import { randomUUID } from "crypto"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { FirestoreTransport } from "./firestore-transport"
import { RemoteLogger } from "./remote-log"
import { BridgeControlDispatcher, collectDiagnostics } from "./bridge-control"
import type { BridgeControl, MonitorConfig } from "./types"

/**
 * R4 — process-restart hook. main.ts (Electron) injects
 * `() => { app.relaunch(); app.exit(0) }` via setRestartHandler so a remote
 * `bridgeControl.action === "restart"` can relaunch the unattended bridge. Off
 * Electron (dev / tests) it stays null and the dispatcher logs a no-op.
 */
let restartHandler: (() => void) | null = null
export function setRestartHandler(fn: () => void): void {
    restartHandler = fn
}

/**
 * Max age of the last successful monitor-live/state write before the bridge is
 * considered unhealthy even with a live socket (C5/B3). Generously above the 10s
 * state heartbeat so a healthy idle desk never trips it; it fires only when the
 * state-write path is actually wedged while the config heartbeat still runs.
 */
const STATE_LIVENESS_THRESHOLD_MS = 30_000

/**
 * B10 — single-writer lease (election). The active bridge holds a lease at
 * config/monitor.bridgeLease for LEASE_TTL_MS and renews every LEASE_RENEW_MS;
 * a bridge that can't hold it stands by (listens but does not drain commands or
 * write state). TTL ≫ renew interval so one missed renewal doesn't drop it; TTL
 * also ≫ realistic NTP skew between two PCs.
 */
const LEASE_TTL_MS = 90_000
const LEASE_RENEW_MS = 20_000

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
    const startedAt = Date.now()
    const version = process.env.BRIDGE_VERSION || "2.0.0"
    console.log("╔═══════════════════════════════════════════╗")
    console.log(`║  CentralReform X32 Monitor Bridge v${version}  ║`)
    console.log("╚═══════════════════════════════════════════╝")
    console.log()

    // 1. Load config from Firestore
    const config = new ConfigManager()
    // The ConfigManager constructor initializes firebase-admin, so the admin SDK
    // is available from here on.
    const adminRef = config.getAdmin()
    const db = adminRef.firestore()

    // O1 — remote error/event ring buffer. Wrap console.error/warn to ALSO record
    // into a bounded, rate-limited, fail-open Firestore log so a crash/error at
    // hour 30 of the unattended window leaves a remote trace (the bridge's only
    // diagnostics are otherwise console-only → local Electron UI). The wrap
    // composes on top of main.ts's UI redirect: each saves the current console.*
    // and calls it, so both the UI send and the ring capture happen.
    const remoteLogger = new RemoteLogger(db)
    const baseError = console.error.bind(console)
    const baseWarn = console.warn.bind(console)
    console.error = (...args: unknown[]) => {
        baseError(...args)
        try { remoteLogger.record("error", args.map(String).join(" ")) } catch { /* fail-open */ }
    }
    console.warn = (...args: unknown[]) => {
        baseWarn(...args)
        try { remoteLogger.record("warn", args.map(String).join(" ")) } catch { /* fail-open */ }
    }

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
    const x32Port = monitorConfig.x32Port

    console.log("[X32] Scanning network for X32 mixer...")
    const discovered = await X32Client.discover(5000, x32Port)

    if (discovered) {
        console.log(`[X32] ✓ Found ${discovered.name} (${discovered.model}) at ${discovered.address}`)
        console.log(`[X32]   Firmware: ${discovered.firmware}`)
        x32Address = discovered.address
        internalStatus.x32Address = x32Address;

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

    // 3b. B10 — acquire the single-writer lease. If another bridge already holds
    //     it, this one starts in STANDBY: it still listens, but won't drain
    //     commands or write state (the transport's isActiveBridge gate). The renew
    //     loop below promotes it to active if the lease later frees up.
    const bridgeInstanceId = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`
    let leaseHeld = await config.acquireOrRenewLease(bridgeInstanceId, LEASE_TTL_MS)
    if (leaseHeld) {
        console.log(`[Bridge] Single-writer lease ACQUIRED (${bridgeInstanceId}) — this bridge is ACTIVE`)
    } else {
        console.warn(`[Bridge] Single-writer lease held by another bridge — entering STANDBY (will not drive the X32)`)
    }

    // 4. Start the Firestore transport FIRST (B2) so its state_synced listener is
    //    attached BEFORE syncFullState emits — otherwise the initial event is lost.
    //    iPads read state from and write commands to Firestore — zero config on devices.
    //    B10 — the transport drains commands + writes state only while we hold the lease.
    const transport = new FirestoreTransport(x32, config, () => leaseHeld)
    transport.start()

    // 4b. Sync full mixer state, then publish it. The first full-state `.set()`
    //     also HEALS any corrupted (array→map) live state left by the old delta writer.
    if (x32.isConnected()) {
        await x32.syncFullState(monitorConfig.monitorBuses)
        await transport.writeFullState()
    }

    // Publish this bridge's URL to Firestore so iPads find it automatically
    let currentIp = getLocalIp()
    if (currentIp) {
        // Since we no longer use WSS, we'll establish a pseudo-url to identify this instance
        const bridgeUrl = `firestore://${currentIp}`
        internalStatus.bridgeUrl = bridgeUrl
        await config.updateBridgeUrl(bridgeUrl)
    } else {
        console.warn("[Bridge] ⚠ Could not detect local IP — iPads will use the last saved bridge URL")
    }

    // 5. X32 reconnect handling — re-sync state when mixer comes back
    // B1 — CRASH GUARD. An EventEmitter "error" with NO listener THROWS → uncaught
    // → the bridge process crashes with no relaunch. The most plausible unattended
    // trigger is exactly this window's scenario: the board powers off while the
    // bridge keeps probing it, Windows delivers UDP ECONNRESET to the socket, and
    // x32-client emits "error" (x32-client.ts socket "error" handler). Attaching a
    // listener turns that fatal path into a swallowed log; the keepalive/health
    // loop + reconnect machinery handle the actual recovery. Pure-additive, zero
    // behavior change when healthy. Highest-value fix in this build.
    x32.on("error", (err: Error) => {
        console.error(
            "[Bridge] X32 socket error (swallowed — reconnect loop will recover):",
            err?.message ?? String(err),
        )
    })
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
                await config.updateBridgeUrl(`firestore://${currentIp}`)
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
            await config.updateBridgeUrl(`firestore://${currentIp}`)
        }

        // C5/B3 — liveness from (socket-alive AND state-fresh), not socket chatter
        // alone. The bridge can hold a live socket while the state-write path is
        // wedged; publishing x32Connected=true then is the "green health + dead
        // writes" trap. state-age cross-checks that writes are actually flowing.
        // B3 (verify-only): this state-age cross-check IS the state-freshness
        // liveness B3 asked for (landed in P1-A's C5) — no further change needed.
        const socketAlive = x32.isConnected()
        const stateFresh = transport.getStateAgeMs() < STATE_LIVENESS_THRESHOLD_MS
        const healthy = socketAlive && stateFresh

        // B13 — real connected-client count (distinct recently-commanding clients),
        // replacing the hardcoded 0 that misled dashboards.
        const clients = transport.getActiveClientCount()

        // Local Electron UI shows the raw socket state ("connected to X32").
        internalStatus.x32Connected = socketAlive
        internalStatus.connectedClients = clients

        // B10 — only the ACTIVE (lease-holding) bridge publishes the heartbeat and
        // cleans up commands; a standby must not claim "online" or delete another
        // bridge's pending docs.
        if (leaseHeld) {
            // O2 — additive diagnostics (raw socketAlive, stateAgeMs, unconfirmed
            // count, last OSC rx / state write, uptime, queue depth, error count +
            // last error). Pure reads of state the bridge already holds; lets a
            // remote observer split socket-dead from state-wedged at a glance.
            const diagnostics = collectDiagnostics({ x32, transport, logger: remoteLogger, startedAt })

            // Consumers (iPad / MCP) read the cross-checked health.
            await config.writeHeartbeat({
                x32Connected: healthy,
                clients,
                localIp: currentIp,
                diagnostics,
            })

            // Clean up stale commands (safety net) + TTL-sweep acks.
            await transport.cleanupStaleCommands()
        }
    }

    // First heartbeat immediately
    await heartbeatLoop()
    // Then every 60 seconds
    const heartbeatInterval = setInterval(heartbeatLoop, 60_000)

    // B10 — renew (or, if standing by, try to acquire) the single-writer lease.
    // On a standby→active transition, resync the desk so the now-active bridge
    // publishes fresh state instead of waiting for the 30s re-query.
    const leaseInterval = setInterval(async () => {
        const held = await config.acquireOrRenewLease(bridgeInstanceId, LEASE_TTL_MS)
        if (held && !leaseHeld) {
            console.log("[Bridge] Single-writer lease ACQUIRED — promoting to ACTIVE")
            if (x32.isConnected()) {
                await x32.syncFullState(config.getConfig().monitorBuses)
                await transport.writeFullState()
            }
        } else if (!held && leaseHeld) {
            console.warn("[Bridge] Single-writer lease LOST — another bridge is ACTIVE; standing by")
        }
        leaseHeld = held
    }, LEASE_RENEW_MS)

    // R1 — remote control & diagnostics channel. The dispatcher rides the EXISTING
    // config listener (below): an admin writes config/monitor.bridgeControl
    // {action, nonce, ...} and the bridge dispatches by action, deduped by nonce.
    // This is the only remote lever for a box that is ON but physically unreachable.
    const controlDispatcher = new BridgeControlDispatcher({
        x32,
        transport,
        logger: remoteLogger,
        getMonitorBuses: () => config.getConfig().monitorBuses,
        // R4 — relaunch via the Electron app (injected by main.ts); no-op off Electron.
        restart: () => {
            if (restartHandler) restartHandler()
            else console.warn("[Control] restart requested but no restart handler (non-Electron context)")
        },
        // O4 — selftest snapshot target (valid 2-segment doc path). Fail-open.
        writeSelftest: async (snapshot) => {
            try {
                await db.doc("monitor-live/selftest").set({
                    ...snapshot,
                    updatedAt: adminRef.firestore.FieldValue.serverTimestamp(),
                })
            } catch (err) {
                console.error("[Control] selftest write failed:", (err as Error).message)
            }
        },
        startedAt,
    })

    // 6. Watch for config changes
    config.startWatching()

    // Re-sync only when X32-relevant config changes (not heartbeat, defaultChannels, etc.)
    config.onChange(async (newConfig, prevConfig) => {
        if (!x32.isConnected()) return

        const busesChanged = JSON.stringify(newConfig.monitorBuses) !== JSON.stringify(prevConfig.monitorBuses)
        const x32Changed = newConfig.x32Address !== prevConfig.x32Address || newConfig.x32Port !== prevConfig.x32Port

        if (busesChanged || x32Changed) {
            console.log("[Bridge] X32-relevant config changed — resyncing buses:", newConfig.monitorBuses)
            await x32.syncFullState(newConfig.monitorBuses)
        }
    })

    // R1 — dispatch the remote control channel on every config snapshot. The
    // bridge's own 60s heartbeat re-fires this listener with the SAME
    // bridgeControl, so the dispatcher's nonce dedup (not this callback) is what
    // makes it idempotent. bridgeControl is bridge-only, read off the live doc via
    // a cast rather than widening the canonical MonitorConfig.
    config.onChange((newConfig) => {
        const ctrl = (newConfig as MonitorConfig & { bridgeControl?: BridgeControl }).bridgeControl
        void controlDispatcher.handle(ctrl).catch((err) =>
            console.error("[Control] bridgeControl dispatch failed:", (err as Error).message),
        )
    })

    // Status logging
    setInterval(() => {
        console.log(`[Bridge] Monitor Active | X32: ${x32.isConnected() ? "✓" : "✗"}`)
    }, 60000)

    // Graceful shutdown
    const shutdown = async () => {
        console.log("\n[Bridge] Shutting down...")
        clearInterval(heartbeatInterval)
        clearInterval(leaseInterval)
        transport.stop()
        remoteLogger.stop()
        await config.writeOffline()
        // B10 — release the lease so a standby bridge can take over immediately
        // (rather than waiting out the TTL).
        if (leaseHeld) await config.releaseLease(bridgeInstanceId)
        config.stopWatching()
        x32.disconnect()
        process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    console.log()
    console.log(`[Bridge] Ready!`)
    console.log(`  X32:       ${x32Address}:${x32Port}`)
    console.log(`  Buses:     ${monitorConfig.monitorBuses.join(", ")}`)
    console.log(`  Heartbeat: Every 60s → Firestore`)
    console.log(`  DHCP Guard: Monitoring IP changes`)
    if (currentIp) {
        console.log(`  Published: iPads will auto-connect via Firestore`)
        console.log(`  Transport: Firestore (zero iPad config required)`)
    }
    console.log()
}

export interface BridgeInternalStatus {
    x32Connected: boolean;
    x32Address: string;
    connectedClients: number;
    bridgeUrl: string | null;
}

const internalStatus: BridgeInternalStatus = {
    x32Connected: false,
    x32Address: 'Not Scanned',
    connectedClients: 0,
    bridgeUrl: null
};

export function getBridgeStatus() {
    return internalStatus;
}

export { main }

// Auto-run when executed directly (not when required by launcher or electron)
if (require.main === module) {
    main().catch((err) => {
        console.error("Fatal error:", err)
        process.exit(1)
    })
}
