import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { forbiddenRoleEnvelope } from "@/lib/mcp/error-envelopes"
import { readUserRole } from "@/lib/mcp/server-tracks-write"

/**
 * Bridge-housekeeping MCP wrappers (FINDINGS §4 Lane #7 — TOP-10 #9 + Feat-A1
 * closure post bridge-v1005-accumulator item 3).
 *
 * The bridge keeps two short-lived Firestore SUBCOLLECTIONS under
 * `monitor-live/commands/`:
 *
 *   - `pending/{id}` — each iPad write that the bridge dispatcher reads,
 *     applies to the X32, and deletes (`firestore-transport.ts:processCommand-
 *     Batch`). When the bridge is in STANDBY (another bridge holds the
 *     lease) the standby instance drops queued pending docs and writes
 *     `rejected:bridge-standby` acks (post `b5583eb90`); but if the active
 *     bridge crashes mid-burst OR a write lands while no bridge is alive,
 *     the pending docs can pile up with nobody to drain them.
 *   - `acks/{commandId}` — each command's terminal receipt
 *     (`applied`/`rejected`/`timeout`), TTL-swept by the bridge every cycle
 *     (`ack-writer.ts:ACK_TTL_MS = 5min`). The dispatch prompt §1 wording
 *     "`monitor-live/state.acks` map" is incorrect — acks are a SUB-
 *     COLLECTION, never a map on the state doc. We sweep the subcollection
 *     here, matching the bridge's own sweep shape.
 *
 * And one ring-buffer doc:
 *
 *   - `monitor-live/bridgeLog` — capped log doc (`remote-log.ts` ringSize 50)
 *     holding the most-recent error/warn lines + running errCount + lastError.
 *
 * These three wrappers let an admin do remote housekeeping (forensic read +
 * queue / receipt cleanup) without juggling Firebase MCP. All are admin-only
 * because they're maintenance ops on a shared singleton — band_leader's
 * standing scope is monitor MIX, not bridge operations.
 *
 * Failure mode contract — every wrapper wraps Firestore I/O in try/catch and
 * returns a rich `internal_error` envelope on throw (NEVER throws past the
 * boundary). Matches the existing `bridge-recovery.ts` shape per
 * `[[feedback_mcp_validation_shape]]`.
 */

/** Path to the acks subcollection. Mirrors `bridge/src/ack-writer.ts:ACKS_COLLECTION`. */
const ACKS_COLLECTION = "monitor-live/commands/acks"
/** Path to the pending-commands subcollection. Mirrors `bridge/src/firestore-transport.ts`. */
const PENDING_COLLECTION = "monitor-live/commands/pending"
/** Path to the ring-buffer log doc. Mirrors `bridge/src/remote-log.ts:docPath`. */
const BRIDGE_LOG_DOC = "monitor-live/bridgeLog"

/**
 * Firestore batched writes max out at 500 ops, but the bridge surfaces are
 * small (acks TTL-swept @ 5min, pending normally drained on-the-fly). 250
 * leaves headroom for any field-level metadata writes within the same batch
 * later without bumping into the 500 cap.
 */
const BATCH_SIZE = 250

export interface BridgeClearResult {
    ok: true
    /** Which housekeeping op ran. */
    action: "clear_acks" | "clear_pending_commands"
    /** How many docs were deleted (0 on a no-op). */
    cleared: number
}

export interface BridgeLogEntry {
    level: "error" | "warn"
    msg: string
    ts: number
}

export interface BridgeGetLogResult {
    ok: true
    /**
     * The ring buffer of recent error/warn lines (most-recent at end). Empty
     * array when `monitor-live/bridgeLog` doesn't exist yet (cold bridge, no
     * recorded lines).
     */
    entries: BridgeLogEntry[]
    /** Running count of error/warn lines since the bridge started, post startup-noise filter. */
    errCount: number
    /** The most-recent post-filter error/warn line, or null when none. */
    lastError: { msg: string; ts: number } | null
    /** Bridge version that wrote the log (forensics). */
    bridgeVersion: string | null
}

/**
 * Admin-only role gate. Mirrors `bridge-recovery.ts:assertAdmin` but lives
 * here so the housekeeping module is self-contained — keeps the bridge-
 * recovery surface read-only from this file (per the lane prompt's "no
 * touching `bridge-recovery.ts` core" boundary).
 */
async function assertAdmin(
    db: ReturnType<typeof getFirestore>,
    uid: string,
    toolName: string,
): Promise<{ ok: true } | ReturnType<typeof forbiddenRoleEnvelope>> {
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: `${toolName} is admin-only (bridge housekeeping op).`,
        hint:
            "Bridge-housekeeping tools maintain shared singletons (ack receipts / pending-command queue / bridge log) — band_leader's standing scope is mix control, not bridge ops. If you need to recover a wedged bridge from a band_leader, use bridge_resync or bridge_reconnect.",
    })
}

/**
 * Batched-delete every doc in a subcollection. Reads + deletes in chunks of
 * `BATCH_SIZE` so we stay under the Firestore 500-op batch limit even when
 * the subcollection has piled up to hundreds of stale docs. Returns the
 * total number of docs deleted.
 *
 * Per-batch we fetch a fresh page rather than streaming the whole collection
 * into memory — admin-only housekeeping that runs rarely, so optimizing for
 * memory safety > throughput.
 */
async function deleteSubcollection(
    db: ReturnType<typeof getFirestore>,
    path: string,
): Promise<number> {
    let total = 0
    // Iterate until a fetch returns fewer than BATCH_SIZE docs — that's the
    // last page. We never re-page on the same set because deletes shrink it.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const snap = await db.collection(path).limit(BATCH_SIZE).get()
        if (snap.empty) break
        const batch = db.batch()
        for (const doc of snap.docs) batch.delete(doc.ref)
        await batch.commit()
        total += snap.size
        if (snap.size < BATCH_SIZE) break
    }
    return total
}

export async function bridgeClearAcks(
    uid: string,
): Promise<BridgeClearResult | RichErrorEnvelope> {
    try {
        initAdmin()
        const db = getFirestore()
        const check = await assertAdmin(db, uid, "bridge_clear_acks")
        if (!check.ok) return check

        const cleared = await deleteSubcollection(db, ACKS_COLLECTION)
        return { ok: true, action: "clear_acks", cleared }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `bridge_clear_acks internal error: ${msg}`,
            { tool: "bridge_clear_acks" },
            "Retry; if the error persists, check admin SDK write permissions on monitor-live/commands/acks.",
        )
    }
}

export async function bridgeClearPendingCommands(
    uid: string,
): Promise<BridgeClearResult | RichErrorEnvelope> {
    try {
        initAdmin()
        const db = getFirestore()
        const check = await assertAdmin(
            db,
            uid,
            "bridge_clear_pending_commands",
        )
        if (!check.ok) return check

        const cleared = await deleteSubcollection(db, PENDING_COLLECTION)
        return { ok: true, action: "clear_pending_commands", cleared }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `bridge_clear_pending_commands internal error: ${msg}`,
            { tool: "bridge_clear_pending_commands" },
            "Retry; if the error persists, check admin SDK write permissions on monitor-live/commands/pending. Note: this is the manual-flush complement to the bridge's automatic STANDBY drop (post bridge-standby-ack-cleanup `b5583eb90`).",
        )
    }
}

export async function bridgeGetLog(
    uid: string,
): Promise<BridgeGetLogResult | RichErrorEnvelope> {
    try {
        initAdmin()
        const db = getFirestore()
        const check = await assertAdmin(db, uid, "bridge_get_log")
        if (!check.ok) return check

        const snap = await db.doc(BRIDGE_LOG_DOC).get()
        if (!snap.exists) {
            return {
                ok: true,
                entries: [],
                errCount: 0,
                lastError: null,
                bridgeVersion: null,
            }
        }
        const data = snap.data() as {
            entries?: BridgeLogEntry[]
            errCount?: number
            lastError?: { msg: string; ts: number } | null
            bridgeVersion?: string
        }
        return {
            ok: true,
            entries: Array.isArray(data.entries) ? data.entries : [],
            errCount: typeof data.errCount === "number" ? data.errCount : 0,
            lastError: data.lastError ?? null,
            bridgeVersion:
                typeof data.bridgeVersion === "string" ? data.bridgeVersion : null,
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `bridge_get_log internal error: ${msg}`,
            { tool: "bridge_get_log" },
            "Retry; if the error persists, check admin SDK read permissions on monitor-live/bridgeLog.",
        )
    }
}

/**
 * Internal — only exported so tests can verify the admin-only branch directly
 * without re-implementing the role-read. Mirrors bridge-recovery's
 * `_assertAdminForTests`. Not meant for tool callers.
 *
 * @internal
 */
export { assertAdmin as _assertAdminForTests }
