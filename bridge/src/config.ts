/**
 * Config Manager
 * 
 * Reads monitor configuration from Firestore (config/monitor) and watches
 * for live changes. When the admin updates bus assignments or authorized
 * users in the web app, this picks it up instantly.
 */

import * as admin from "firebase-admin"
import { MonitorConfig } from "./types"
import type { BridgeDiagnostics } from "./bridge-control"

const DEFAULT_CONFIG: MonitorConfig = {
    bridgeUrl: "wss://localhost:9001",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4],
    busAssignments: {},
}

export class ConfigManager {
    private db: admin.firestore.Firestore
    private config: MonitorConfig = DEFAULT_CONFIG
    private unsubscribe: (() => void) | null = null
    private listeners: Array<(config: MonitorConfig, prev: MonitorConfig) => void> = []
    // R5 — set true by stopWatching so a pending resubscribe-on-error timer does
    // not re-attach the listener after a graceful shutdown.
    private watchStopped = false

    constructor() {
        // Initialize Firebase Admin
        if (!admin.apps.length) {
            const serviceAccountPath = process.env.FIREBASE_SA_KEY_PATH
            if (serviceAccountPath) {
                const serviceAccount = require(serviceAccountPath)
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                })
            } else {
                // Application Default Credentials (for GCP environments)
                admin.initializeApp()
            }
        }
        this.db = admin.firestore()
    }

    async loadConfig(): Promise<MonitorConfig> {
        const doc = await this.db.collection("config").doc("monitor").get()
        if (doc.exists) {
            const data = doc.data() as Partial<MonitorConfig>
            this.config = { ...DEFAULT_CONFIG, ...data }
        } else {
            // Create default config doc
            await this.db.collection("config").doc("monitor").set(DEFAULT_CONFIG)
            this.config = DEFAULT_CONFIG
        }
        console.log("[Config] Loaded:", JSON.stringify({
            x32: `${this.config.x32Address}:${this.config.x32Port}`,
            buses: this.config.monitorBuses,
        }))
        return this.config
    }

    startWatching(): void {
        this.watchStopped = false
        this.unsubscribe = this.db.collection("config").doc("monitor")
            .onSnapshot((snap) => {
                if (snap.exists) {
                    const data = snap.data() as Partial<MonitorConfig>
                    const prev = this.config
                    this.config = { ...DEFAULT_CONFIG, ...data }
                    console.log("[Config] Updated live — buses:", this.config.monitorBuses)
                    this.listeners.forEach(fn => fn(this.config, prev))
                }
            }, (err) => {
                console.error("[Config] Watch error:", err.message)
                // R5 — the remote-recovery channel (bridgeControl) rides THIS
                // listener; if it dies silently the bridge stops reacting to config
                // changes AND to recovery commands for the rest of the unattended
                // window. Firestore drops the listener on error, so re-establish it
                // after a short delay (mirrors the command-listener resubscribe in
                // firestore-transport.ts). Clear the stale handle first so a later
                // stopWatching can't invoke a dead unsubscribe.
                this.unsubscribe = null
                if (!this.watchStopped) {
                    setTimeout(() => {
                        if (!this.watchStopped) this.startWatching()
                    }, 5000)
                }
            })
    }

    stopWatching(): void {
        this.watchStopped = true
        if (this.unsubscribe) {
            this.unsubscribe()
            this.unsubscribe = null
        }
    }

    getConfig(): MonitorConfig {
        return this.config
    }

    onChange(fn: (config: MonitorConfig, prev: MonitorConfig) => void): void {
        this.listeners.push(fn)
    }

    /**
     * Check if a user is authorized for monitor access.
     * Authorized if: admin role, soundEngineer claim, or has a bus assigned.
     */
    isAuthorized(uid: string, role?: string, soundEngineer?: boolean): boolean {
        if (role === "admin") return true
        if (soundEngineer) return true
        if (this.getUserBus(uid) !== null) return true
        return false
    }

    /**
     * Get which bus is assigned to a user.
     *
     * `busAssignments[bus]` may be a single `BusAssignment`, an ARRAY of them
     * (the shape the in-app BusAssignmentPanel actually writes — supports
     * co-owning a bus), or `null`. Normalize all three so a regular musician's
     * fader command isn't silently rejected (BR-04). Mirrors the canonical
     * `getOwnedBuses` semantics in `src/lib/mcp/server-monitor.ts`.
     *
     * Returns the first matching bus index (a user may own several; the
     * command authorizer checks the specific bus per command).
     */
    getUserBus(uid: string): number | null {
        for (const [busStr, assignment] of Object.entries(this.config.busAssignments)) {
            if (!assignment) continue
            const occupants = Array.isArray(assignment) ? assignment : [assignment]
            if (occupants.some((a) => a?.userId === uid)) {
                return parseInt(busStr)
            }
        }
        return null
    }

    /** Get Firebase Admin instance for other uses */
    getAdmin(): typeof admin {
        return admin
    }

    /** Update the X32 address in Firestore (called after auto-discovery) */
    async updateX32Address(address: string): Promise<void> {
        try {
            await this.db.collection("config").doc("monitor").update({ x32Address: address })
            this.config.x32Address = address
        } catch (err) {
            console.error("[Config] Failed to update X32 address:", err)
        }
    }

    /** Update the bridge URL in Firestore (called on startup with actual IP) */
    async updateBridgeUrl(url: string): Promise<void> {
        try {
            await this.db.collection("config").doc("monitor").update({ bridgeUrl: url })
            this.config.bridgeUrl = url
            console.log(`[Config] Bridge URL published: ${url}`)
        } catch (err) {
            console.error("[Config] Failed to update bridge URL:", err)
        }
    }

    /**
     * Write heartbeat to Firestore. Fire-and-forget with timeout.
     *
     * O2 (v10.0.4): optional `diagnostics` adds extra `bridge.*` map fields so a
     * remote observer can split socket-dead from state-wedged and see uptime /
     * queue-depth / error-count / last-error at a glance. The existing keys
     * (status / x32Connected / clients / version / lastSeen / localIp) keep their
     * exact semantics — consumers depend on them — these are purely additive.
     */
    async writeHeartbeat(data: {
        x32Connected: boolean
        clients: number
        localIp: string | null
        diagnostics?: BridgeDiagnostics
    }): Promise<void> {
        try {
            const update: Record<string, unknown> = {
                "bridge.lastSeen": admin.firestore.FieldValue.serverTimestamp(),
                "bridge.status": "online",
                "bridge.x32Connected": data.x32Connected,
                "bridge.clients": data.clients,
                "bridge.localIp": data.localIp,
                "bridge.version": process.env.BRIDGE_VERSION || "2.0.0",
            }
            const d = data.diagnostics
            if (d) {
                // All values are pre-sanitized for Firestore by collectDiagnostics
                // (no Infinity/NaN/undefined; null is allowed).
                update["bridge.socketAlive"] = d.socketAlive
                update["bridge.stateAgeMs"] = d.stateAgeMs
                update["bridge.unconfirmedCount"] = d.unconfirmedCount
                update["bridge.lastOscRxAt"] = d.lastOscRxAt
                update["bridge.lastStateWriteAt"] = d.lastStateWriteAt
                update["bridge.startedAt"] = d.startedAt
                update["bridge.uptimeMs"] = d.uptimeMs
                update["bridge.queueDepth"] = d.queueDepth
                update["bridge.errCount"] = d.errCount
                update["bridge.lastError"] = d.lastError
            }
            // 5s timeout — never let heartbeat block the bridge
            await Promise.race([
                this.db.collection("config").doc("monitor").update(update),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
            ])
        } catch (err) {
            // Swallow — heartbeat failure should never crash the bridge
            console.warn("[Heartbeat] Write failed:", (err as Error).message)
        }
    }

    /** Mark bridge as offline in Firestore (graceful shutdown). */
    async writeOffline(): Promise<void> {
        try {
            await Promise.race([
                this.db.collection("config").doc("monitor").update({
                    "bridge.status": "offline",
                    "bridge.lastSeen": admin.firestore.FieldValue.serverTimestamp(),
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
            ])
        } catch {
            // Best-effort on shutdown
        }
    }

    /** Check if another bridge instance is running (recent heartbeat). */
    async checkForRunningInstance(): Promise<{ running: boolean; lastSeen?: Date; localIp?: string }> {
        try {
            const doc = await this.db.collection("config").doc("monitor").get()
            if (!doc.exists) return { running: false }
            const data = doc.data()
            const bridge = data?.bridge
            if (!bridge?.lastSeen) return { running: false }

            const lastSeen = bridge.lastSeen.toDate ? bridge.lastSeen.toDate() : new Date(bridge.lastSeen)
            const age = Date.now() - lastSeen.getTime()

            // If heartbeat is < 2 minutes old and status is "online", another instance is running
            return {
                running: age < 120_000 && bridge.status === "online",
                lastSeen,
                localIp: bridge.localIp,
            }
        } catch {
            return { running: false }
        }
    }

    /**
     * B10 — single-writer lease (election). `checkForRunningInstance` only WARNS;
     * two bridges on different PCs would then both drain `pending` and double-apply
     * commands. This acquires/renews an atomic lease at `config/monitor.bridgeLease`
     * via a Firestore transaction:
     *   - free / expired / already-ours  → acquire (write owner + new expiry), true
     *   - held by another, still live     → refuse, false (caller stays standby)
     *
     * Renew on an interval shorter than `ttlMs`; only the holder drains commands +
     * writes state. The expiry is wall-clock (`Date.now()`); the large TTL (≫ NTP
     * skew between two NTP-synced PCs) keeps this correct for the studio's
     * single-PC-with-accidental-second-bridge case it guards. Fails CLOSED (false)
     * on any transaction error so a bridge never assumes ownership it didn't win.
     */
    async acquireOrRenewLease(ownerId: string, ttlMs: number): Promise<boolean> {
        const ref = this.db.collection("config").doc("monitor")
        try {
            return await this.db.runTransaction(async (tx) => {
                const snap = await tx.get(ref)
                const lease = snap.exists
                    ? (snap.data()?.bridgeLease as { ownerId?: string; expiresAt?: number } | undefined)
                    : undefined
                const now = Date.now()
                const heldByOther =
                    !!lease &&
                    lease.ownerId !== ownerId &&
                    typeof lease.expiresAt === "number" &&
                    lease.expiresAt > now
                if (heldByOther) return false
                tx.set(
                    ref,
                    { bridgeLease: { ownerId, acquiredAt: now, expiresAt: now + ttlMs } },
                    { merge: true },
                )
                return true
            })
        } catch (err) {
            console.error("[Lease] Acquire/renew failed:", (err as Error).message)
            return false
        }
    }

    /** B10 — release the lease iff we still own it (best-effort, on shutdown). */
    async releaseLease(ownerId: string): Promise<void> {
        const ref = this.db.collection("config").doc("monitor")
        try {
            await this.db.runTransaction(async (tx) => {
                const snap = await tx.get(ref)
                const lease = snap.data()?.bridgeLease as { ownerId?: string } | undefined
                if (lease?.ownerId === ownerId) {
                    tx.set(ref, { bridgeLease: admin.firestore.FieldValue.delete() }, { merge: true })
                }
            })
        } catch {
            // Best-effort on shutdown.
        }
    }
}
