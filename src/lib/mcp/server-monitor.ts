import type {
    BusAssignment,
    MixerSnapshot,
    MonitorConfig,
} from "@/types/monitor"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"

/**
 * Admin-SDK helpers shared by the MCP monitor tools.
 *
 * Mirrors the iPad client's transport model (see `firestore-monitor-client.ts`):
 *  - Reads come from `config/monitor` (assignments, bridge status) and
 *    `monitor-live/state` (the live mixer snapshot the bridge writes).
 *  - Writes are command docs appended to `monitor-live/commands/pending`; the
 *    bridge consumes and deletes them. The wire schema (and rule-enforced
 *    allow-list) lives in `src/types/monitor.ts :: ClientMessage`.
 *
 * Access model mirrors `useMonitorAccess`:
 *   hasAccess = isAdmin || soundEngineer flag || has at least one assigned bus.
 * Matrix outputs and writes that touch buses you don't own require admin OR
 * the soundEngineer flag — "FOH territory" for ride-faders during a service.
 */

type DB = FirebaseFirestore.Firestore

export interface MonitorUser {
    role: string | undefined
    soundEngineer: boolean
}

export async function loadMonitorUser(db: DB, uid: string): Promise<MonitorUser> {
    const snap = await db.collection("users").doc(uid).get()
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    return {
        role: typeof d.role === "string" ? d.role : undefined,
        soundEngineer: d.soundEngineer === true,
    }
}

export async function loadMonitorConfig(db: DB): Promise<MonitorConfig | null> {
    const snap = await db.collection("config").doc("monitor").get()
    return snap.exists ? (snap.data() as MonitorConfig) : null
}

export interface MixerStateMeta {
    /** The mixer snapshot, or null when the bridge has never written state. */
    snapshot: MixerSnapshot | null
    /**
     * Raw `updatedAt` off the state doc (FirestoreDate-ish), or null. The
     * bridge stamps this on every write but `MixerSnapshot` doesn't model it.
     */
    updatedAt: unknown
}

/**
 * Load `monitor-live/state` returning BOTH the typed snapshot and the doc's
 * raw `updatedAt`. Single Firestore read; `loadMixerState` delegates here so
 * its existing callers' contract is unchanged. Cast mirrors the iPad client
 * (`firestore-monitor-client.ts`), which also reads `updatedAt` off the side.
 */
export async function loadMixerStateMeta(db: DB): Promise<MixerStateMeta> {
    const snap = await db.collection("monitor-live").doc("state").get()
    if (!snap.exists) return { snapshot: null, updatedAt: null }
    const data = snap.data() as MixerSnapshot & { updatedAt?: unknown }
    return { snapshot: data, updatedAt: data.updatedAt ?? null }
}

export async function loadMixerState(db: DB): Promise<MixerSnapshot | null> {
    return (await loadMixerStateMeta(db)).snapshot
}

/**
 * Staleness threshold for the live mixer snapshot (`monitor-live/state`).
 *
 * Why 90s: the bridge's `config/monitor` heartbeat advances every ~60s, but
 * `monitor-live/state` (the fader/mute values get_mix/list_monitor_buses
 * surface) is refreshed only on live X32 OSC echoes. After the v10.0.0 / BR-02
 * change removed the idle false-disconnect resync — the only thing that
 * periodically rewrote state on an idle desk — an idle desk's state stops
 * advancing while the heartbeat stays green ("green health + dead writes",
 * coder-2 F-1 FINDINGS). 90s leaves a comfortable margin over the 60s
 * heartbeat so a desk that IS refreshing state never reads stale; once a
 * bridge-side mixer-state heartbeat ships it will refresh well inside 90s.
 * Until then an idle desk reads stale — which is CORRECT and honest. Callers
 * also get the raw `stateAgeSeconds` to apply their own judgment.
 */
export const STALE_STATE_THRESHOLD_SECONDS = 90

/**
 * Coerce a FirestoreDate-ish value (admin Timestamp | Date | ISO string |
 * epoch millis | raw `{seconds, nanoseconds}`) to epoch millis; null when
 * absent or uncoercible.
 */
function firestoreDateToMillis(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "string") {
        const ms = Date.parse(v)
        return Number.isNaN(ms) ? null : ms
    }
    if (typeof v === "object") {
        const o = v as {
            toMillis?: () => number
            toDate?: () => Date
            seconds?: number
            nanoseconds?: number
        }
        if (typeof o.toMillis === "function") {
            try {
                return o.toMillis()
            } catch {
                return null
            }
        }
        if (typeof o.toDate === "function") {
            try {
                return o.toDate().getTime()
            } catch {
                return null
            }
        }
        if (typeof o.seconds === "number") {
            const nanos = typeof o.nanoseconds === "number" ? o.nanoseconds : 0
            return o.seconds * 1000 + Math.floor(nanos / 1e6)
        }
    }
    return null
}

/**
 * Age of the live mixer snapshot in whole seconds = (now − state.updatedAt).
 * Returns null when `updatedAt` is missing or uncoercible — the caller treats
 * null as stale (no timestamp ⇒ freshness can't be proven). `now` is
 * injectable for deterministic tests. Pure.
 */
export function computeStateAgeSeconds(
    updatedAt: unknown,
    now: number = Date.now(),
): number | null {
    const ms = firestoreDateToMillis(updatedAt)
    if (ms == null) return null
    return Math.round((now - ms) / 1000)
}

/** A snapshot with no timestamp, or older than the threshold, is stale. */
export function isStateStale(ageSeconds: number | null): boolean {
    return ageSeconds == null || ageSeconds > STALE_STATE_THRESHOLD_SECONDS
}

/**
 * Bus indices the user owns. `busAssignments` is keyed by bus index (as
 * stringified number) and each value is one or more BusAssignment objects.
 * A user may own multiple buses; a bus may be co-owned by multiple users.
 */
export function getOwnedBuses(config: MonitorConfig, uid: string): number[] {
    const out: number[] = []
    const assignments = config.busAssignments || {}
    for (const [key, val] of Object.entries(assignments)) {
        if (!val) continue
        const list: BusAssignment[] = Array.isArray(val) ? val : [val]
        if (list.some((a) => a.userId === uid)) {
            const idx = Number(key)
            if (!Number.isNaN(idx)) out.push(idx)
        }
    }
    return out.sort((a, b) => a - b)
}

/**
 * Authoritative set of bus indices a caller may target, DECOUPLED from the
 * (corruptible) live snapshot. Union of:
 *   - configured monitor buses (`config.monitorBuses`),
 *   - buses the caller owns (`getOwnedBuses` — passed in by the caller),
 *   - buses currently present in the live snapshot (additive evidence only).
 *
 * The live snapshot is NEVER the sole gate. Under bridge bug R3 the dot-path
 * delta writer corrupts `buses` ARRAY→MAP and drops owned/configured buses, so
 * gating writes/reads on it falsely refused `invalid_bus_index` for a bus the
 * caller genuinely owns and the command queue can still reach (DEFECT-REGISTER
 * C-5 / MCP-D2; caught live by the P0-B2 probe). Validate against THIS set
 * instead; demote live-snapshot absence to a soft warning. Sorted, unique, pure.
 */
export function validBusIndicesFor(
    config: MonitorConfig,
    ownedBuses: number[],
    liveBusIndices: number[] = [],
): number[] {
    const set = new Set<number>()
    const configured = Array.isArray(config.monitorBuses)
        ? config.monitorBuses
        : []
    for (const b of configured) if (typeof b === "number") set.add(b)
    for (const b of ownedBuses) set.add(b)
    for (const b of liveBusIndices) set.add(b)
    return [...set].sort((a, b) => a - b)
}

/**
 * Server `/monitor` page access gate — the SOLE predicate for whether a user
 * may load the mixer UI. Mirrors the client `useMonitorAccess` hook exactly by
 * reusing `getOwnedBuses` for the has-a-bus check, so the server gate and the
 * client hook (and the perform-toolbar QuickMonitorPanel that uses it) cannot
 * drift. Access = admin OR sound engineer OR owns >= 1 assigned bus.
 *
 * `busAssignments` is keyed by bus-index string, NOT by uid — a prior version
 * indexed it by uid (`busAssignments[uid]`) which never matched, denying every
 * non-privileged musician access to their own IEM bus (AUDIT-consumers C-1).
 */
export function hasMonitorPageAccess(
    privileged: { isAdmin: boolean; isSoundEngineer: boolean },
    config: MonitorConfig | null,
    uid: string,
): boolean {
    if (privileged.isAdmin || privileged.isSoundEngineer) return true
    if (!config) return false
    return getOwnedBuses(config, uid).length > 0
}

export type AccessOk = {
    ok: true
    user: MonitorUser
    ownedBuses: number[]
    config: MonitorConfig
}

/** Any-access gate (admin OR soundEngineer OR has-bus). REG-001b (cycle-2):
 * refusals return the canonical rich envelope so each MCP monitor tool can
 * pass the result straight through `jsonResult` without a prose-lift. */
export async function assertMonitorAccess(
    db: DB,
    uid: string,
): Promise<AccessOk | RichErrorEnvelope> {
    const [user, config] = await Promise.all([
        loadMonitorUser(db, uid),
        loadMonitorConfig(db),
    ])
    if (!config) {
        return richError(
            "monitor_unconfigured",
            "Monitor system is not configured for this deployment.",
            undefined,
            "Ask an admin to provision config/monitor before retrying.",
        )
    }
    const ownedBuses = getOwnedBuses(config, uid)
    if (!isPrivilegedMonitor(user) && ownedBuses.length === 0) {
        return richError(
            "monitor_access_denied",
            "You don't have monitor access — ask an admin to assign you a bus.",
            { callerRole: user.role ?? null, soundEngineer: user.soundEngineer },
            "Ask Rabbi Daniel or an admin to assign you a personal IEM bus.",
        )
    }
    return { ok: true, user, ownedBuses, config }
}

/** Privileged: admin OR sound engineer flag. */
export function isPrivilegedMonitor(user: MonitorUser): boolean {
    return user.role === "admin" || user.soundEngineer === true
}

/** Owns this bus, or is privileged (admin/SE). */
export function canControlBus(
    user: MonitorUser,
    ownedBuses: number[],
    busIndex: number,
): boolean {
    return isPrivilegedMonitor(user) || ownedBuses.includes(busIndex)
}

export type MonitorCommandType =
    | "set_bus_master"
    | "set_send_level"
    | "set_send_on"
    | "set_matrix_fader"
    | "set_matrix_on"

export interface MonitorCommand {
    type: MonitorCommandType
    busIndex?: number
    channelIndex?: number
    matrixIndex?: number
    value: number | boolean
}

/**
 * Append the X32 wire command to `monitor-live/commands/pending`. The bridge
 * consumes and deletes commands; this function does not await acknowledgment.
 * The `uid` + `createdAt` envelope is what the Firestore rules require on the
 * iPad path, mirrored here so the bridge's attribution logic is unchanged.
 */
export async function enqueueCommand(
    db: DB,
    uid: string,
    command: MonitorCommand,
): Promise<{ id: string }> {
    const ref = await db
        .collection("monitor-live")
        .doc("commands")
        .collection("pending")
        .add({
            ...command,
            uid,
            createdAt: Date.now(),
        })
    return { id: ref.id }
}

/** FirestoreDate (Timestamp | string | null) → ISO string | null for tool output. */
export function serializeLastSeen(v: unknown): string | null {
    if (!v) return null
    if (typeof v === "string") return v
    if (typeof v === "object" && v !== null && "toDate" in v) {
        try {
            return (v as { toDate(): Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}
