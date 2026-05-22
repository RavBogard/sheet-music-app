/**
 * Firestore Transport
 *
 * Replaces the WebSocket server entirely. Instead of iPads connecting
 * directly to the bridge via WSS (which requires TLS certificates and
 * manual trust on every iPad), we use Firestore as the message bus.
 *
 * The bridge and iPads already have authenticated Firestore connections,
 * so this "just works" — zero configuration on iPads.
 *
 * Data flow:
 *   iPad writes command → Firestore → Bridge reads & executes → X32
 *   X32 state change → Bridge writes state → Firestore → iPad reads
 *
 * Collections:
 *   monitor-live/state     — Full mixer snapshot, written by bridge
 *   monitor-live/commands/* — Individual commands from iPads, processed & deleted
 */

import * as admin from "firebase-admin"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { AckWriter } from "./ack-writer"

/** monitor-live/state schema version (C4). Bump on any shape change. */
const STATE_SCHEMA_VERSION = 1

interface PendingCommand {
    type: string
    busIndex?: number
    channelIndex?: number
    matrixIndex?: number
    value?: number | boolean
    uid: string
    createdAt: number
}

export class FirestoreTransport {
    private db: admin.firestore.Firestore
    private x32: X32Client
    private config: ConfigManager
    private ackWriter: AckWriter
    private commandUnsub: (() => void) | null = null

    // B10 — single-writer gate. Only the lease-holding ("active") bridge drains
    // commands and writes state; a standby bridge listens but leaves the work to
    // the active one (prevents two PCs both consuming `pending` → double-apply).
    // Defaults to always-active so single-bridge deployments + unit tests are
    // unaffected; index.ts wires this to the Firestore lease.
    private isActiveBridge: () => boolean

    // ── State-write path (Monitor Overhaul Phase 1, C1/C3) ──
    // ONE throttled full-state `.set()` writer. The dot-path delta writer that
    // converted the `buses` ARRAY into a MAP (R3) is deleted. Every trigger —
    // inbound X32 echo, query-after-command confirm reply, startup sync, and the
    // two heartbeats — funnels through scheduleStateWrite → writeFullState.
    private stateWriteTimer: ReturnType<typeof setTimeout> | null = null
    private lastStateWrite = 0
    private lastSuccessfulStateWriteAt = 0
    private stateSeq = 0
    private readonly STATE_WRITE_INTERVAL = 100 // throttle: ≤10 writes/sec

    // C3 — two-tier heartbeat timers.
    private stateHeartbeatTimer: ReturnType<typeof setInterval> | null = null
    private fullRequeryTimer: ReturnType<typeof setInterval> | null = null
    private readonly STATE_HEARTBEAT_MS = 10_000 // cheap re-.set() of cached snapshot (idle never freezes — R2)
    private readonly FULL_REQUERY_MS = 30_000 // authoritative syncFullState resync (catch drift / missed echoes)

    // Track the latest command time for each target to discard obsolete delayed
    // commands. Keyed by command target ("set_bus_master:1", "set_send_level:1:5").
    // VALUES are SERVER-relative times (B4) — the Firestore doc createTime, one
    // clock for all clients — NOT the iPad wall-clock `createdAt`, which skews
    // across machines and broke ordering + the staleness cutoff.
    private latestCommandTimestamps: Map<string, number> = new Map();
    // Batch processing state. `serverCreateMs` is the B4 server-relative receipt
    // time captured from the command doc's createTime.
    private pendingCommandQueue: { cmd: PendingCommand, ref: admin.firestore.DocumentReference, serverCreateMs: number }[] = [];
    private commandBatchTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly COMMAND_BATCH_WINDOW = 20; // ms to accumulate commands before processing
    private readonly STALE_COMMAND_MS = 10_000; // discard commands older than this (B4, server-relative)

    // B5 — idempotency. CommandIds already given a verdict, with the time they
    // were processed. A re-delivered command (listener re-establish, etc.) is
    // skipped so it can't double-apply on the X32. Pruned by TTL.
    private processedCommandIds: Map<string, number> = new Map();
    private readonly PROCESSED_TTL_MS = 60_000;

    // B6 — pending command acks awaiting the C2 read-back confirmation. Keyed by
    // the X32 confirm key ("bus_fader:5", "send_level:2:5"). On the matching
    // change event we write an `applied` ack with the confirmed value; if none
    // arrives within ACK_CONFIRM_TIMEOUT_MS we write a `timeout` ack.
    private pendingAcks: Map<string, { commandId: string; timer: ReturnType<typeof setTimeout> }> = new Map();
    private readonly ACK_CONFIRM_TIMEOUT_MS = 1_500;

    // B13 — real connected-client count. With the Firestore transport there is no
    // socket to count, so "active clients" = distinct uids that sent a command in
    // the last CLIENT_ACTIVE_WINDOW_MS (the only client-presence signal the bridge
    // observes). Replaces the hardcoded 0 in the heartbeat.
    private recentClients: Map<string, number> = new Map();
    private readonly CLIENT_ACTIVE_WINDOW_MS = 60_000;

    // BR-01: cache each user's admin/soundEngineer ("engineer") flag so the
    // authz check does NOT read users/{uid} from Firestore on every fader tick
    // (the dominant avoidable latency + the dominant per-command read cost).
    // role/soundEngineer change rarely; a short TTL keeps the gate correct
    // within seconds of a role change. Only the SOURCE of the flag changes —
    // the authorization logic in isCommandAuthorized is unchanged.
    private engineerCache: Map<string, { isEngineer: boolean; expiresAt: number }> = new Map();
    private readonly ENGINEER_CACHE_TTL_MS = 30_000;

    constructor(x32: X32Client, config: ConfigManager, isActiveBridge: () => boolean = () => true) {
        this.x32 = x32
        this.config = config
        this.isActiveBridge = isActiveBridge
        this.db = admin.firestore()
        this.ackWriter = new AckWriter(this.db)
    }

    /**
     * Start listening for commands and broadcasting state.
     */
    start(): void {
        this.listenForCommands()
        this.setupX32Listeners()

        // C3 — cheap state-write heartbeat: re-.set() the cached snapshot so
        // monitor-live/state.updatedAt advances even on a fully idle desk (kills
        // R2). No X32 traffic — just republishes what's already in cache.
        this.stateHeartbeatTimer = setInterval(
            () => this.scheduleStateWrite(),
            this.STATE_HEARTBEAT_MS,
        )
        // C3 — authoritative re-query resync: periodically re-read the desk to
        // catch any drift or echo we missed. Restores (intentionally, at a sane
        // cadence) the periodic resync BR-02 had removed as a side effect.
        this.fullRequeryTimer = setInterval(() => {
            if (this.x32.isConnected()) {
                this.x32
                    .syncFullState(this.config.getConfig().monitorBuses)
                    .catch((err) =>
                        console.error("[Transport] Full re-query failed:", (err as Error).message),
                    )
            }
        }, this.FULL_REQUERY_MS)

        console.log("[Transport] Firestore transport active — iPads connect via Firestore")
    }

    /**
     * Write the FULL mixer state snapshot to monitor-live/state via `.set()`
     * (C1 — never a dot-path `.update()`, which corrupted the buses ARRAY into a
     * MAP = R3). Carries light freshness/identity fields (C4): schemaVersion,
     * bridgeVersion, stateSeq (monotonic), updatedAt, and the B11 `unconfirmed`
     * list. Does NOT embed `config` — consumers read config/monitor directly;
     * the embedded copy went stale and was the misleading bridge.version:"2.0.0"
     * source.
     */
    async writeFullState(): Promise<void> {
        // B10 — a standby bridge must not write state (the active bridge owns
        // monitor-live/state; two writers would fight over it).
        if (!this.isActiveBridge()) return
        this.lastStateWrite = Date.now()
        try {
            await this.db.doc("monitor-live/state").set({
                schemaVersion: STATE_SCHEMA_VERSION,
                channels: this.x32.channels,
                buses: this.x32.buses,
                matrices: this.x32.matrices,
                unconfirmed: this.x32.getUnconfirmed(),
                bridgeVersion: process.env.BRIDGE_VERSION || "2.0.0",
                stateSeq: ++this.stateSeq,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            this.lastSuccessfulStateWriteAt = Date.now()
        } catch (err) {
            console.error("[Transport] Failed to write state:", (err as Error).message)
        }
    }

    /**
     * Throttled full-state write (≤10/s). Coalesces rapid changes: a write that
     * is already scheduled captures the latest cache when it fires, so callers
     * never track per-field dirtiness. ALL state-write triggers route here (C1/C5).
     */
    private scheduleStateWrite(): void {
        if (this.stateWriteTimer) return
        const elapsed = Date.now() - this.lastStateWrite
        if (elapsed >= this.STATE_WRITE_INTERVAL) {
            void this.writeFullState()
        } else {
            this.stateWriteTimer = setTimeout(() => {
                this.stateWriteTimer = null
                void this.writeFullState()
            }, this.STATE_WRITE_INTERVAL - elapsed)
        }
    }

    /**
     * Age in ms since the last SUCCESSFUL state write (Infinity if never).
     * Lets the bridge heartbeat derive liveness from state-freshness, not just
     * socket chatter (B3/C5).
     */
    getStateAgeMs(): number {
        return this.lastSuccessfulStateWriteAt === 0
            ? Infinity
            : Date.now() - this.lastSuccessfulStateWriteAt
    }

    /**
     * Listen for commands from iPads via Firestore.
     */
    private listenForCommands(): void {
        const commandsRef = this.db.collection("monitor-live/commands/pending")

        this.commandUnsub = commandsRef
            .orderBy("createdAt")
            .onSnapshot(
                (snap) => {
                    for (const change of snap.docChanges()) {
                        if (change.type === "added") {
                            const data = change.doc.data() as PendingCommand
                            // B4 — capture the Firestore server-assigned create time
                            // (one clock for every client) as the authoritative
                            // ordering/staleness basis. Fall back to the client
                            // `createdAt` only if createTime is unavailable.
                            const serverCreateMs =
                                change.doc.createTime?.toMillis?.() ?? data.createdAt
                            this.queueCommand(data, change.doc.ref, serverCreateMs)
                        }
                    }
                },
                (err) => {
                    console.error("[Transport] Command listener error:", err.message)
                    // Re-establish listener after a delay
                    setTimeout(() => this.listenForCommands(), 5000)
                }
            )

        console.log("[Transport] Listening for iPad commands")
    }

    private queueCommand(cmd: PendingCommand, ref: admin.firestore.DocumentReference, serverCreateMs: number): void {
        // B13 — record client presence on every received command (even ones we'll
        // refuse — the device is demonstrably active).
        this.recordClientActivity(cmd.uid);
        this.pendingCommandQueue.push({ cmd, ref, serverCreateMs });
        if (!this.commandBatchTimer) {
            this.commandBatchTimer = setTimeout(() => this.processCommandBatch(), this.COMMAND_BATCH_WINDOW);
        }
    }

    private async processCommandBatch(): Promise<void> {
        this.commandBatchTimer = null;
        if (this.pendingCommandQueue.length === 0) return;

        // B10 — only the active (lease-holding) bridge drains commands. A standby
        // bridge drops its local copy and leaves the docs in Firestore for the
        // active bridge's own listener to process (no double-apply, no deletes).
        if (!this.isActiveBridge()) {
            this.pendingCommandQueue = [];
            return;
        }

        const batchToProcess = [...this.pendingCommandQueue];
        this.pendingCommandQueue = [];

        // B5 — order by the SERVER-relative create time (B4), not the skew-prone
        // client `createdAt`, so concurrent multi-client commands apply in a
        // single well-defined order.
        batchToProcess.sort((a, b) => a.serverCreateMs - b.serverCreateMs);

        const firestoreBatch = this.db.batch();
        let batchCount = 0;

        for (const { cmd, ref, serverCreateMs } of batchToProcess) {
            await this.processCommand(cmd, ref, firestoreBatch, serverCreateMs);
            batchCount++;

            // Firestore batches have a limit of 500 operations. 
            // We do 1 delete/update per command, so commit at 400 for safety.
            if (batchCount >= 400) {
                try { await firestoreBatch.commit(); } catch (e) { console.error("[Transport] Batch commit error", e); }
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            try { await firestoreBatch.commit(); } catch (e) { console.error("[Transport] Batch commit error", e); }
        }
    }

    // B6 — per-command ack surface. After a command reaches a verdict the bridge
    // writes monitor-live/commands/acks/{commandId} (see ack-writer.ts; path is
    // P2-B's commandAckRef single source of truth):
    //   • rejected — unauthorized / superseded / unknown-or-malformed / X32 error
    //   • timeout  — too old to apply, OR applied but the C2 read-back never
    //                confirmed within ACK_CONFIRM_TIMEOUT_MS
    //   • applied  — confirmed from the desk via the C2 query-after-command
    //                (carries the confirmedValue)
    // This is the read target for P2-B get_command_status (closes B6/MCP-D3).

    /**
     * Process a single command from an iPad. Does not delete immediately; adds delete to a batch.
     * Confirmation of the applied value happens via the X32Client's
     * query-after-command (C2): the SET schedules a debounced read-back whose
     * reply routes back as a change event; setupX32Listeners resolves the pending
     * ack with the confirmed value (B6).
     */
    private async processCommand(
        cmd: PendingCommand,
        ref: admin.firestore.DocumentReference,
        batch: admin.firestore.WriteBatch,
        serverCreateMs: number
    ): Promise<void> {
        const commandId = ref.id
        try {
            // B5 — idempotency. A re-delivered command (e.g. listener
            // re-establish) was already given a verdict + ack; never re-apply it
            // to the desk. Just ensure the doc is cleaned up.
            if (this.processedCommandIds.has(commandId)) {
                batch.delete(ref)
                return
            }
            // Mark BEFORE executing: retrying a fire-and-forget OSC SET can't
            // recover and risks a double-apply, so a command gets exactly one shot.
            this.processedCommandIds.set(commandId, Date.now())

            // Verify authorization
            const authorized = await this.isCommandAuthorized(cmd);
            if (!authorized) {
                console.warn(`[Transport] Unauthorized command from ${cmd.uid}: ${cmd.type}`)
                void this.ackWriter.write(commandId, "rejected", { reason: "unauthorized" })
                batch.update(ref, { error: "Unauthorized", processedAt: Date.now() })
                return
            }

            // B4 — discard stale commands on the SERVER-relative create time, not
            // the iPad wall-clock (skew could make a fresh command look old or an
            // old one look fresh).
            if (Date.now() - serverCreateMs > this.STALE_COMMAND_MS) {
                void this.ackWriter.write(commandId, "timeout", {
                    reason: `command expired (age > ${this.STALE_COMMAND_MS}ms)`,
                })
                batch.update(ref, { error: "Timeout", processedAt: Date.now() })
                return
            }

            // Generate a target key to track command freshness
            let targetKey = cmd.type;
            if (cmd.busIndex !== undefined) targetKey += `:${cmd.busIndex}`;
            if (cmd.channelIndex !== undefined) targetKey += `:${cmd.channelIndex}`;
            if (cmd.matrixIndex !== undefined) targetKey += `:${cmd.matrixIndex}`;

            const lastCmdTime = this.latestCommandTimestamps.get(targetKey) || 0;

            // B5 — if a NEWER command for this exact target already ran, this one
            // is obsolete (Firestore reordering jitter / batch reorder). Compared
            // on the server-relative time so cross-client ordering is consistent.
            if (serverCreateMs < lastCmdTime) {
                void this.ackWriter.write(commandId, "rejected", {
                    reason: "superseded by a newer command for the same target",
                })
                batch.delete(ref)
                return
            }

            // Record this as the latest command for this target
            this.latestCommandTimestamps.set(targetKey, serverCreateMs);

            // Validate shape + derive the C2 confirm key (B6). null = unknown type
            // or missing required fields → a rejection, never sent to the desk.
            const confirmKey = this.confirmKeyFor(cmd)
            if (!confirmKey) {
                console.warn(`[Transport] Unknown or malformed command: ${cmd.type}`)
                void this.ackWriter.write(commandId, "rejected", {
                    reason: `unknown or malformed command: ${cmd.type}`,
                })
                batch.delete(ref)
                return
            }

            // Execute the command on the X32
            switch (cmd.type) {
                case "set_bus_master":
                    this.x32.setBusFader(cmd.busIndex!, cmd.value as number)
                    break
                case "set_send_level":
                    this.x32.setSendLevel(cmd.channelIndex!, cmd.busIndex!, cmd.value as number)
                    break
                case "set_send_on":
                    this.x32.setSendOn(cmd.channelIndex!, cmd.busIndex!, cmd.value as boolean)
                    break
                case "set_matrix_fader":
                    this.x32.setMatrixFader(cmd.matrixIndex!, cmd.value as number)
                    break
                case "set_matrix_on":
                    this.x32.setMatrixOn(cmd.matrixIndex!, cmd.value as boolean)
                    break
            }

            // B6 — await the C2 read-back: an `applied` ack (with the confirmed
            // value) on the matching change event, or a `timeout` ack if none
            // arrives within the window.
            this.registerPendingAck(confirmKey, commandId)

            // Mark for deletion after successful execution
            batch.delete(ref)
        } catch (err) {
            console.error(`[Transport] Command error:`, (err as Error).message)
            void this.ackWriter.write(commandId, "rejected", { reason: (err as Error).message })
            batch.update(ref, { error: (err as Error).message, processedAt: Date.now() })
        }
    }

    /**
     * Map a command to the X32 confirm key used by both the C2 read-back
     * (x32-client scheduleConfirm) and the change-event handler (B6 ack
     * resolution). Returns null for an unknown type or one missing its required
     * fields — the caller treats that as a rejection.
     */
    private confirmKeyFor(cmd: PendingCommand): string | null {
        switch (cmd.type) {
            case "set_bus_master":
                return cmd.busIndex !== undefined && cmd.value !== undefined
                    ? `bus_fader:${cmd.busIndex}`
                    : null
            case "set_send_level":
                return cmd.busIndex !== undefined && cmd.channelIndex !== undefined && cmd.value !== undefined
                    ? `send_level:${cmd.channelIndex}:${cmd.busIndex}`
                    : null
            case "set_send_on":
                return cmd.busIndex !== undefined && cmd.channelIndex !== undefined && cmd.value !== undefined
                    ? `send_on:${cmd.channelIndex}:${cmd.busIndex}`
                    : null
            case "set_matrix_fader":
                return cmd.matrixIndex !== undefined && cmd.value !== undefined
                    ? `matrix_fader:${cmd.matrixIndex}`
                    : null
            case "set_matrix_on":
                return cmd.matrixIndex !== undefined && cmd.value !== undefined
                    ? `matrix_on:${cmd.matrixIndex}`
                    : null
            default:
                return null
        }
    }

    /**
     * B6 — register a command awaiting C2 read-back confirmation, keyed by its
     * X32 confirm key. A newer command for the same target supersedes an older
     * still-pending one: the older was sent to the desk (so it's `applied`), but
     * the newer command's read-back carries the authoritative value. If no
     * confirmation arrives within ACK_CONFIRM_TIMEOUT_MS we write a `timeout`.
     */
    private registerPendingAck(confirmKey: string, commandId: string): void {
        const existing = this.pendingAcks.get(confirmKey)
        if (existing) {
            clearTimeout(existing.timer)
            void this.ackWriter.write(existing.commandId, "applied", {
                reason: "superseded by a newer command for the same target",
            })
        }
        const timer = setTimeout(() => {
            this.pendingAcks.delete(confirmKey)
            void this.ackWriter.write(commandId, "timeout", {
                reason: `no read-back confirmation within ${this.ACK_CONFIRM_TIMEOUT_MS}ms`,
            })
        }, this.ACK_CONFIRM_TIMEOUT_MS)
        this.pendingAcks.set(confirmKey, { commandId, timer })
    }

    /**
     * B6 — resolve a pending ack from the desk's confirmed value (the C2
     * read-back reply, surfaced as a change event). Writes the `applied` ack and
     * cancels the timeout. A change event with no pending ack (a manual desk move)
     * is ignored here.
     */
    private resolvePendingAck(confirmKey: string, confirmedValue: number | boolean): void {
        const pending = this.pendingAcks.get(confirmKey)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pendingAcks.delete(confirmKey)
        void this.ackWriter.write(pending.commandId, "applied", { confirmedValue })
    }

    /** B13 — record that a client is active (sent a command). */
    private recordClientActivity(uid: string): void {
        if (uid) this.recentClients.set(uid, Date.now())
    }

    /**
     * B13 — count distinct clients active within the window (sent a command).
     * The only client-presence signal the bridge has under the Firestore
     * transport. Prunes expired entries as it counts.
     */
    getActiveClientCount(): number {
        const cutoff = Date.now() - this.CLIENT_ACTIVE_WINDOW_MS
        let active = 0
        for (const [uid, last] of this.recentClients) {
            if (last >= cutoff) active++
            else this.recentClients.delete(uid)
        }
        return active
    }

    /**
     * Check if a user is authorized to execute this command.
     */
    private async isCommandAuthorized(cmd: PendingCommand): Promise<boolean> {
        // This is the AUTHORITATIVE bus-ownership / privilege gate. firestore.rules
        // does NOT enforce per-bus ownership (it only checks membership, self-
        // attribution, the command shape, and admin/SE-gates the FOH matrix
        // primitives — see firestore.rules monitor-live/commands/pending). So this
        // check is the only thing verifying a user owns the bus they're driving;
        // if it is removed or weakened, any member could control any bus.
        const userBus = this.config.getUserBus(cmd.uid)

        // Admin/sound-engineer privilege (cached — see getIsEngineer / BR-01).
        const isEngineer = await this.getIsEngineer(cmd.uid)

        if (cmd.type === "set_matrix_fader" || cmd.type === "set_matrix_on") {
            return isEngineer
        }

        if (cmd.busIndex !== undefined) {
            return isEngineer || userBus === cmd.busIndex
        }

        return false
    }

    /**
     * Whether a user is an admin or sound engineer, cached in-memory with a
     * short TTL (BR-01). On a cache miss/expiry it reads users/{uid} once and
     * caches the result; subsequent commands within the TTL skip the read
     * entirely. A failed read fails CLOSED (engineer=false) for that command
     * and is NOT cached, so the next command retries — preserving the original
     * per-command behavior on transient Firestore errors. Bus-ownership (via
     * config.getUserBus) is unaffected by a read failure, exactly as before.
     */
    private async getIsEngineer(uid: string): Promise<boolean> {
        const now = Date.now()
        const cached = this.engineerCache.get(uid)
        if (cached && cached.expiresAt > now) {
            return cached.isEngineer
        }

        let isEngineer = false
        try {
            const userDoc = await this.db.collection("users").doc(uid).get()
            if (userDoc.exists) {
                const userData = userDoc.data()
                if (userData?.role === "admin" || userData?.soundEngineer === true) {
                    isEngineer = true
                }
            }
            // Cache successful reads only (including negative results).
            this.engineerCache.set(uid, { isEngineer, expiresAt: now + this.ENGINEER_CACHE_TTL_MS })
        } catch (e) {
            // Fail closed for engineer privilege; do NOT cache an error so the
            // next command re-attempts the read.
            console.error("[Transport] Failed to fetch user role for auth check:", e)
        }
        return isEngineer
    }

    /**
     * Listen for X32 state changes and push to Firestore. Every change — an
     * inbound echo (manual desk move / another client) OR a query-after-command
     * confirm reply (C2) — refreshes the X32Client cache and emits one of these
     * events; we respond with ONE throttled FULL-STATE write (C1). No per-field
     * dot-path deltas (those coerced the array into a map — R3). `state_synced`
     * covers startup, the periodic re-query, reconnect, and config-change syncs.
     */
    private setupX32Listeners(): void {
        const onState = () => this.scheduleStateWrite()
        // Each param change both schedules a full-state write (C1) AND, if it's
        // the C2 read-back for a pending command, resolves that command's ack
        // with the desk's confirmed value (B6). The event arg order matches
        // x32-client's routeParameterChange emits.
        this.x32.on("bus_fader", (idx: number, fader: number) => {
            this.resolvePendingAck(`bus_fader:${idx}`, fader)
            onState()
        })
        this.x32.on("send_level", (busIdx: number, chIdx: number, level: number) => {
            this.resolvePendingAck(`send_level:${chIdx}:${busIdx}`, level)
            onState()
        })
        this.x32.on("send_on", (busIdx: number, chIdx: number, on: boolean) => {
            this.resolvePendingAck(`send_on:${chIdx}:${busIdx}`, on)
            onState()
        })
        this.x32.on("matrix_fader", (idx: number, fader: number) => {
            this.resolvePendingAck(`matrix_fader:${idx}`, fader)
            onState()
        })
        this.x32.on("matrix_on", (idx: number, on: boolean) => {
            this.resolvePendingAck(`matrix_on:${idx}`, on)
            onState()
        })
        this.x32.on("state_synced", onState)
    }

    /**
     * Clean up old commands (safety net for commands that weren't deleted).
     * Call periodically from the heartbeat loop.
     */
    async cleanupStaleCommands(): Promise<void> {
        try {
            // Clean up old commands (both unprocessed and processed errors)
            const stale = await this.db
                .collection("monitor-live/commands/pending")
                .where("createdAt", "<", Date.now() - 30_000)
                .limit(50)
                .get()

            if (!stale.empty) {
                const batch = this.db.batch()
                stale.docs.forEach((doc) => batch.delete(doc.ref))
                await batch.commit()
                console.log(`[Transport] Cleaned ${stale.size} stale commands`)
            }
        } catch {
            // Best effort
        }

        // B6 — TTL-sweep old acks so the subcollection stays small.
        await this.ackWriter.sweep()
        // B5/B13 — prune the idempotency + client-presence maps so they don't
        // grow without bound on a long-running bridge.
        this.pruneExpiredMaps()
    }

    /** Drop expired processed-command + recent-client entries (B5/B13). */
    private pruneExpiredMaps(): void {
        const now = Date.now()
        for (const [id, at] of this.processedCommandIds) {
            if (now - at > this.PROCESSED_TTL_MS) this.processedCommandIds.delete(id)
        }
        const clientCutoff = now - this.CLIENT_ACTIVE_WINDOW_MS
        for (const [uid, last] of this.recentClients) {
            if (last < clientCutoff) this.recentClients.delete(uid)
        }
    }

    stop(): void {
        if (this.commandUnsub) {
            this.commandUnsub()
            this.commandUnsub = null
        }
        if (this.stateWriteTimer) {
            clearTimeout(this.stateWriteTimer)
            this.stateWriteTimer = null
        }
        if (this.stateHeartbeatTimer) {
            clearInterval(this.stateHeartbeatTimer)
            this.stateHeartbeatTimer = null
        }
        if (this.fullRequeryTimer) {
            clearInterval(this.fullRequeryTimer)
            this.fullRequeryTimer = null
        }
        // B6 — drop any pending ack timeout timers.
        for (const { timer } of this.pendingAcks.values()) clearTimeout(timer)
        this.pendingAcks.clear()
    }
}
