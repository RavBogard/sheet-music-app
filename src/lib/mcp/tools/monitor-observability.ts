import { FieldPath } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import {
    assertMonitorAccess,
    coerceCommandAck,
    commandAckRef,
    computeBusAssignmentAdd,
    computeBusAssignmentRemove,
    loadMonitorConfig,
    MONITOR_BUS_MAX,
    MONITOR_BUS_MIN,
    type CommandAck,
} from "@/lib/mcp/server-monitor"
import type { BusAssignment } from "@/types/monitor"

/**
 * Monitor Overhaul Phase 2 — MCP observability + bus-assignment tools (Lane
 * P2-B). Kept in a NEW file (not tools/monitor.ts) so the Phase-2 surface
 * lands disjoint from the bridge (P2-A) + iPad (P3-A) planes with no merge
 * contention. Server helpers live in server-monitor.ts; errors flow through
 * the canonical rich envelope ([[feedback_mcp_validation_shape]]).
 *
 *  - get_command_status (MCP-D3): reads the bridge's per-command ack doc.
 *  - assign_monitor_bus / unassign_monitor_bus (MCP-D4): write the
 *    config/monitor.busAssignments array-form the in-app BusAssignmentPanel
 *    writes — so Daniel + David can grant IEM buses via Claude (the ~5/29
 *    rollout) without opening the /monitor admin UI.
 */

const VALID_MONITOR_BUS_INDICES = Array.from(
    { length: MONITOR_BUS_MAX - MONITOR_BUS_MIN + 1 },
    (_, i) => MONITOR_BUS_MIN + i,
)

function isValidBusIndex(busIndex: unknown): busIndex is number {
    return (
        typeof busIndex === "number" &&
        Number.isInteger(busIndex) &&
        busIndex >= MONITOR_BUS_MIN &&
        busIndex <= MONITOR_BUS_MAX
    )
}

function invalidBusIndexError(busIndex: unknown): RichErrorEnvelope {
    return richError(
        "invalid_bus_index",
        `busIndex must be an integer in [${MONITOR_BUS_MIN}..${MONITOR_BUS_MAX}].`,
        {
            busIndex: typeof busIndex === "number" ? busIndex : null,
            validBusIndices: VALID_MONITOR_BUS_INDICES,
        },
        "Personal-IEM monitor buses are 1-5; pass one of those.",
    )
}

// ─── get_command_status (MCP-D3) ─────────────────────────────────────────────

export interface GetCommandStatusArgs {
    /** The commandId returned by a monitor write tool (set_bus_fader, etc). */
    commandId: string
}

/**
 * Read the result of a previously-issued monitor command. The monitor write
 * tools are fire-and-forget — they return `confidence:"queued"`, not whether
 * the X32 actually applied the change. Once the bridge's query-after-command
 * confirmation (P1-A's C2) resolves, it writes an ack doc the bridge keys by
 * commandId; this tool reads it so an agent can close the loop ("did my fader
 * move land?").
 *
 * Same monitor-access gating as the other monitor READ tools (admin OR sound
 * engineer OR has-an-assigned-bus). Never throws — a malformed or absent ack
 * degrades to a clean `pending`/`unknown` result via `coerceCommandAck`.
 *
 * **Ack surface is LIVE** (the bridge ack-writer shipped in the v10.0.3 bridge
 * release; see bridge/src/ack-writer.ts). A real `applied`/`rejected`/`timeout`
 * ack normally lands within a couple of seconds of the command; until the bridge
 * reports (or if it's offline) this returns `{status:'pending', found:false}`.
 * Acks are TTL-swept after ~5 minutes, so read the status promptly.
 */
export async function getCommandStatus(
    uid: string,
    args: GetCommandStatusArgs,
): Promise<({ ok: true; commandId: string } & CommandAck) | RichErrorEnvelope> {
    try {
        if (!args?.commandId || typeof args.commandId !== "string") {
            return richError(
                "invalid_argument",
                "`commandId` must be a non-empty string.",
                { field: "commandId" },
                "Pass the commandId a monitor write tool returned (e.g. set_bus_fader).",
            )
        }
        initAdmin()
        const db = getFirestore()

        const access = await assertMonitorAccess(db, uid)
        if (!access.ok) return access

        const snap = await commandAckRef(db, args.commandId).get()
        const ack = coerceCommandAck(
            snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
        )
        return { ok: true, commandId: args.commandId, ...ack }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `get_command_status internal error: ${msg}`,
            { tool: "get_command_status" },
            "Retry; if the error persists, check the bridge connection.",
        )
    }
}

// ─── assign_monitor_bus (MCP-D4) ─────────────────────────────────────────────

export interface AssignMonitorBusArgs {
    busIndex: number
    uid: string
    /** When true, return the plan without writing config/monitor. */
    dryRun?: boolean
}

export interface AssignMonitorBusResult {
    ok: true
    busIndex: number
    uid: string
    userName: string
    /** The resulting assignment list for this bus after the (planned) write. */
    assignedTo: Array<{ userId: string; userName: string }>
    /** The uid was already assigned to this bus before this call. */
    alreadyAssigned: boolean
    /** The write changed something (false ⇒ idempotent no-op). */
    changed: boolean
    /** The bus is in config.monitorBuses (a configured monitor bus). */
    configuredBus: boolean
    dryRun: boolean
    committed: boolean
    /** Present when the bus is valid (1-5) but not in config.monitorBuses. */
    warning?: string
}

/**
 * Assign a user to a personal-IEM monitor bus — writes
 * `config/monitor.busAssignments` in the array form the in-app
 * BusAssignmentPanel uses (co-ownership supported: a bus may hold several
 * users). Trusted-leader gated (admin + band_leader, via `assertEditor`).
 * Validates the bus is 1-5 and the uid is a real user (admin-SDK
 * `users/{uid}` lookup; the assignee's `displayName` is denormalized into the
 * assignment, matching the UI). Idempotent: re-assigning an already-assigned
 * user is a no-op (`changed:false`) except to refresh a changed displayName.
 *
 * `dryRun:true` returns the full plan without writing
 * ([[feedback_dryrun_is_observability]]). It defaults to FALSE (commit) —
 * unlike assign_musician, a bus assignment fires NO email/SMS/push cascade and
 * is trivially reversible via unassign_monitor_bus, so the rollout ergonomic
 * ("assign David to bus 4") shouldn't require a second forcing call. The
 * config-write itself only touches the one bus's slot (FieldPath update), so it
 * can't clobber a concurrent edit to another bus.
 */
export async function assignMonitorBus(
    callerUid: string,
    args: AssignMonitorBusArgs,
): Promise<AssignMonitorBusResult | RichErrorEnvelope> {
    try {
        if (!isValidBusIndex(args?.busIndex)) {
            return invalidBusIndexError(args?.busIndex)
        }
        if (!args?.uid || typeof args.uid !== "string") {
            return richError(
                "invalid_argument",
                "`uid` must be a non-empty string.",
                { field: "uid" },
                "Discover candidate uids via list_musicians.",
            )
        }
        initAdmin()
        const db = getFirestore()

        const gate = await assertEditor(db, callerUid)
        if (!gate.ok) return gate

        // Validate the assignee is a real user (admin-SDK lookup) + resolve the
        // denormalized display name the UI/iPad consumers read off the bus.
        const userSnap = await db.collection("users").doc(args.uid).get()
        if (!userSnap.exists) {
            return richError(
                "user_not_found",
                `User '${args.uid}' was not found.`,
                { uid: args.uid },
                "Verify the uid via list_musicians; only existing users can be assigned a bus.",
            )
        }
        const userData = userSnap.data() ?? {}
        const userName =
            typeof userData.displayName === "string" &&
            userData.displayName.trim()
                ? userData.displayName
                : "Unknown"

        const config = await loadMonitorConfig(db)
        if (!config) {
            return richError(
                "monitor_unconfigured",
                "Monitor system is not configured for this deployment.",
                undefined,
                "Ask an admin to provision config/monitor before assigning buses.",
            )
        }

        const entry: BusAssignment = { userId: args.uid, userName }
        const mutation = computeBusAssignmentAdd(
            config.busAssignments?.[String(args.busIndex)],
            entry,
        )
        const configuredBuses = Array.isArray(config.monitorBuses)
            ? config.monitorBuses
            : []
        const configuredBus = configuredBuses.includes(args.busIndex)
        const warning = configuredBus
            ? undefined
            : `Bus ${args.busIndex} is valid (1-5) but is not in config.monitorBuses${
                  configuredBuses.length ? ` [${configuredBuses.join(", ")}]` : ""
              }; the assignment was still recorded. Add it to monitorBuses if it should appear as a configured bus.`

        const base = {
            ok: true as const,
            busIndex: args.busIndex,
            uid: args.uid,
            userName,
            assignedTo: mutation.next.map((a) => ({
                userId: a.userId,
                userName: a.userName,
            })),
            alreadyAssigned: mutation.matched,
            changed: mutation.changed,
            configuredBus,
            ...(warning ? { warning } : {}),
        }

        const dryRun = args.dryRun === true
        if (dryRun) {
            return { ...base, dryRun: true, committed: false }
        }
        if (mutation.changed) {
            await writeBusAssignmentSlot(db, args.busIndex, mutation.next)
        }
        return { ...base, dryRun: false, committed: true }
    } catch (err: unknown) {
        return internalError("assign_monitor_bus", err)
    }
}

// ─── unassign_monitor_bus (MCP-D4) ───────────────────────────────────────────

export interface UnassignMonitorBusArgs {
    busIndex: number
    uid: string
    /** When true, return the plan without writing config/monitor. */
    dryRun?: boolean
}

export interface UnassignMonitorBusResult {
    ok: true
    busIndex: number
    uid: string
    /** The resulting assignment list for this bus after the (planned) write. */
    assignedTo: Array<{ userId: string; userName: string }>
    /** The uid was assigned to this bus before this call. */
    previouslyAssigned: boolean
    /** The write changed something (false ⇒ idempotent no-op). */
    changed: boolean
    dryRun: boolean
    committed: boolean
}

/**
 * Remove a user from a personal-IEM monitor bus. Trusted-leader gated. The
 * assignee is NOT existence-checked (so you can clean up an orphaned
 * assignment for a deleted user). Idempotent: removing a uid that isn't
 * assigned is a safe no-op (`changed:false`). `dryRun:true` previews without
 * writing; defaults to FALSE (commit) — symmetric with assign_monitor_bus.
 * Writes only the one bus's slot (FieldPath), clearing it to `null` when the
 * last user is removed (mirrors BusAssignmentPanel).
 */
export async function unassignMonitorBus(
    callerUid: string,
    args: UnassignMonitorBusArgs,
): Promise<UnassignMonitorBusResult | RichErrorEnvelope> {
    try {
        if (!isValidBusIndex(args?.busIndex)) {
            return invalidBusIndexError(args?.busIndex)
        }
        if (!args?.uid || typeof args.uid !== "string") {
            return richError(
                "invalid_argument",
                "`uid` must be a non-empty string.",
                { field: "uid" },
                "Pass the uid currently assigned to this bus (see list_monitor_buses).",
            )
        }
        initAdmin()
        const db = getFirestore()

        const gate = await assertEditor(db, callerUid)
        if (!gate.ok) return gate

        const config = await loadMonitorConfig(db)
        if (!config) {
            return richError(
                "monitor_unconfigured",
                "Monitor system is not configured for this deployment.",
                undefined,
                "Ask an admin to provision config/monitor before changing assignments.",
            )
        }

        const mutation = computeBusAssignmentRemove(
            config.busAssignments?.[String(args.busIndex)],
            args.uid,
        )

        const base = {
            ok: true as const,
            busIndex: args.busIndex,
            uid: args.uid,
            assignedTo: mutation.next.map((a) => ({
                userId: a.userId,
                userName: a.userName,
            })),
            previouslyAssigned: mutation.matched,
            changed: mutation.changed,
        }

        const dryRun = args.dryRun === true
        if (dryRun) {
            return { ...base, dryRun: true, committed: false }
        }
        if (mutation.changed) {
            await writeBusAssignmentSlot(db, args.busIndex, mutation.next)
        }
        return { ...base, dryRun: false, committed: true }
    } catch (err: unknown) {
        return internalError("unassign_monitor_bus", err)
    }
}

// ─── shared write + error helpers ────────────────────────────────────────────

/**
 * Write a single bus's assignment slot on `config/monitor`, targeting ONLY
 * that bus's field path so a concurrent edit to another bus can't be clobbered.
 * Empty list → `null` (mirrors the in-app BusAssignmentPanel's null-when-empty).
 */
async function writeBusAssignmentSlot(
    db: FirebaseFirestore.Firestore,
    busIndex: number,
    next: BusAssignment[],
): Promise<void> {
    await db
        .collection("config")
        .doc("monitor")
        .update(
            new FieldPath("busAssignments", String(busIndex)),
            next.length ? next : null,
        )
}

function internalError(tool: string, err: unknown): RichErrorEnvelope {
    const msg = err instanceof Error ? err.message : String(err)
    return richError(
        "internal_error",
        `${tool} internal error: ${msg}`,
        { tool },
        "Retry; if the error persists, check config/monitor.",
    )
}
