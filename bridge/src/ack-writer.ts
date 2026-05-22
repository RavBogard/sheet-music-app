/**
 * Command Ack Writer (Monitor Overhaul Phase 2 — B6 / MCP-D3)
 *
 * Writes a per-command acknowledgement so callers (MCP `get_command_status`,
 * the iPad C-9 "command rejected because X" UI) can tell whether a monitor
 * command actually applied on the X32, was refused, or never confirmed.
 *
 * Before this, command results were written back onto the command doc itself
 * (which is `read: if false` in firestore.rules → no consumer could read them):
 * the "no ack/confirmation surface" defect (B6). The bridge now writes a
 * dedicated, client-readable ack doc instead.
 *
 * ── Path ──────────────────────────────────────────────────────────────────
 * `monitor-live/commands/acks/{commandId}`. The P1-A C4 comment reserved this as
 * "monitor-live/acks/{commandId}", but that literal is an INVALID Firestore
 * document path (3 segments = a collection). The concrete path is the one P2-B's
 * `commandAckRef` (src/lib/mcp/server-monitor.ts) designated as the single source
 * of truth: collection `monitor-live` → doc `commands` → subcollection `acks` →
 * the ack doc — a sibling to the existing `pending` subcollection, keeping all
 * command-lifecycle data under one container. **P2-B `get_command_status` reads
 * this exact path; keep the two in lockstep.**
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────
 * Server-write (admin SDK, bypasses rules) / client-read. TTL-swept by
 * `sweep()` (called from the transport's periodic cleanup) so the subcollection
 * doesn't grow without bound — acks are a short-lived receipt, not a log.
 */

import * as admin from "firebase-admin"

/** Terminal outcome of a monitor command. */
export type AckStatus = "applied" | "rejected" | "timeout"

/**
 * The ack document shape. `confirmedValue`/`reason` are present only when
 * meaningful (Firestore rejects `undefined`, so they are omitted, not nulled).
 * `at` is a server timestamp for consumers; `createdAtMs` is a plain number the
 * sweep queries on.
 */
export interface CommandAck {
    commandId: string
    status: AckStatus
    confirmedValue?: number | boolean
    reason?: string
    at: admin.firestore.FieldValue
    createdAtMs: number
}

/**
 * Collection holding the ack docs (one per commandId). MUST match P2-B's
 * `commandAckRef` in src/lib/mcp/server-monitor.ts.
 */
export const ACKS_COLLECTION = "monitor-live/commands/acks"

/** Acks older than this are swept (a receipt is short-lived, not a log). */
const ACK_TTL_MS = 5 * 60_000

export class AckWriter {
    private db: admin.firestore.Firestore

    constructor(db: admin.firestore.Firestore) {
        this.db = db
    }

    /**
     * Write (overwrite) the ack for a command. Fire-and-forget safe: never
     * throws — a failed ack write must not break command processing. Undefined
     * optional fields are stripped so the `.set()` doesn't reject.
     */
    async write(
        commandId: string,
        status: AckStatus,
        opts: { confirmedValue?: number | boolean; reason?: string } = {},
    ): Promise<void> {
        if (!commandId) return
        const doc: CommandAck = {
            commandId,
            status,
            at: admin.firestore.FieldValue.serverTimestamp(),
            createdAtMs: Date.now(),
        }
        if (opts.confirmedValue !== undefined) doc.confirmedValue = opts.confirmedValue
        if (opts.reason !== undefined) doc.reason = opts.reason
        try {
            await this.db.doc(`${ACKS_COLLECTION}/${commandId}`).set(doc)
        } catch (err) {
            console.error("[Ack] Failed to write ack:", (err as Error).message)
        }
    }

    /**
     * Delete acks older than ACK_TTL_MS (best-effort, bounded batch). Called
     * periodically from the transport's cleanup so the ack subcollection stays
     * small. Swept on the plain numeric `createdAtMs` (server timestamps can't
     * be range-compared against `Date.now()` reliably under skew).
     */
    async sweep(): Promise<void> {
        try {
            const cutoff = Date.now() - ACK_TTL_MS
            const stale = await this.db
                .collection(ACKS_COLLECTION)
                .where("createdAtMs", "<", cutoff)
                .limit(100)
                .get()
            if (stale.empty) return
            const batch = this.db.batch()
            stale.docs.forEach((d) => batch.delete(d.ref))
            await batch.commit()
            console.log(`[Ack] Swept ${stale.size} stale acks`)
        } catch {
            // Best effort — never let ack housekeeping crash the bridge.
        }
    }
}
