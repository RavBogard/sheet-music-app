import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    assertEditor,
    readUserRole,
} from "@/lib/mcp/server-tracks-write"
import { forbiddenRoleEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Bridge-recovery MCP wrappers (v10.0.5 — bridge-v1005-accumulator item 3).
 *
 * The bridge already exposes a `config/monitor.bridgeControl` channel that the
 * bridge's snapshot listener picks up + dispatches by action, deduped by nonce
 * (`bridge/src/bridge-control.ts`). These wrappers let a trusted-leader drive
 * that channel from Claude Desktop instead of hand-shaping a Firestore write —
 * which used to mean opening Firebase MCP and remembering the exact field
 * names. One MCP call now mints the nonce + requestedAt server-side and writes
 * the doc atomically.
 *
 * Gating:
 *   - bridge_resync / bridge_reconnect / bridge_selftest — trusted-leader
 *     (admin + band_leader, via `assertEditor`). These are safe ops: re-read
 *     the desk / re-establish the socket / write a diag snapshot. No outage.
 *   - bridge_restart — admin ONLY. Relaunches the bridge process — a brief
 *     monitor outage. Daniel-ratified 2026-05-23: not band_leader.
 *
 * v10.0.5 cross-process boot-loop dovetail (item 1 dispatcher fix): every
 * wrapper populates `requestedAt: FieldValue.serverTimestamp()`. The
 * dispatcher's `processStartedAt` skip-guard in `bridge-control.ts` reads
 * that timestamp and rejects any request whose `requestedAt` predates the
 * bridge's current boot — so even if a post-restart config snapshot
 * re-delivers one of OUR writes, the new dispatcher process correctly
 * ignores it. The `clearBridgeControl()` doc-clear from item 1 is the
 * primary defense; `requestedAt` is the cross-process backstop.
 *
 * No new types — `BridgeControl` in `bridge/src/types.ts` already includes
 * `requestedAt?: FirestoreDate` (added in v10.0.4); the dispatcher honors it
 * as of item 1.
 */

export interface BridgeRecoveryResult {
    ok: true
    /** The action we wrote — confirms what the bridge will see on next snapshot. */
    action: "resync" | "reconnect" | "restart" | "selftest"
    /** The server-minted dedup nonce — surface it for debug / log correlation. */
    nonce: string
    /**
     * Human one-line note on what to expect. Brief because the bridge does the
     * work asynchronously — verify outcome via `get_bridge_health` or by
     * reading `monitor-live/selftest`.
     */
    note: string
}

type RoleGate = "trusted-leader" | "admin"

const NOTES: Record<BridgeRecoveryResult["action"], string> = {
    resync:
        "Bridge will re-read the desk and re-publish state. No socket reconnect, no outage. Verify via get_bridge_health (stateAgeS should drop within a few seconds).",
    reconnect:
        "Bridge will drop and re-establish the X32 socket. Brief gap (~1s) where no fader writes apply; existing fader values persist on the desk. Verify x32Connected via get_bridge_health.",
    restart:
        "Bridge process will relaunch (Electron app.relaunch + exit). Brief monitor outage (~3–8s). Bridge re-mints lastSeen on next heartbeat; verify via get_bridge_health.",
    selftest:
        "Bridge will write a diagnostic snapshot to monitor-live/selftest. Non-disruptive. Read the doc to see the result.",
}

/**
 * Admin-only role gate (band_leader NOT accepted). assertEditor accepts both
 * admin + band_leader; this is the stricter variant for `bridge_restart`.
 */
async function assertAdmin(
    db: ReturnType<typeof getFirestore>,
    uid: string,
): Promise<{ ok: true } | ReturnType<typeof forbiddenRoleEnvelope>> {
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: "bridge_restart is admin-only (relaunches the bridge process).",
        hint:
            "If the bridge needs a softer recovery, use bridge_resync or bridge_reconnect — both are trusted-leader-gated (admin + band_leader).",
    })
}

async function dispatchBridgeControl(
    uid: string,
    action: BridgeRecoveryResult["action"],
    gate: RoleGate,
): Promise<BridgeRecoveryResult | RichErrorEnvelope> {
    try {
        initAdmin()
        const db = getFirestore()
        const check =
            gate === "admin"
                ? await assertAdmin(db, uid)
                : await assertEditor(db, uid)
        if (!check.ok) return check

        const nonce = crypto.randomUUID()
        await db.doc("config/monitor").set(
            {
                bridgeControl: {
                    action,
                    nonce,
                    requestedAt: FieldValue.serverTimestamp(),
                    requestedBy: uid,
                },
            },
            { merge: true },
        )

        return { ok: true, action, nonce, note: NOTES[action] }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `bridge_${action} internal error: ${msg}`,
            { tool: `bridge_${action}` },
            "Retry; if the error persists, check config/monitor write permissions for the admin SDK.",
        )
    }
}

export function bridgeResync(uid: string) {
    return dispatchBridgeControl(uid, "resync", "trusted-leader")
}

export function bridgeReconnect(uid: string) {
    return dispatchBridgeControl(uid, "reconnect", "trusted-leader")
}

export function bridgeSelftest(uid: string) {
    return dispatchBridgeControl(uid, "selftest", "trusted-leader")
}

export function bridgeRestart(uid: string) {
    return dispatchBridgeControl(uid, "restart", "admin")
}

/**
 * Internal — only exported so tests can verify the admin-only branch without
 * re-implementing the role-read. Not meant for tool callers.
 *
 * @internal
 */
export { assertAdmin as _assertAdminForTests }
