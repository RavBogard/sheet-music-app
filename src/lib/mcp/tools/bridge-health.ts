import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import {
    computeStateAgeSeconds,
    isStateStale,
    loadMixerStateMeta,
    loadMonitorConfig,
    serializeLastSeen,
} from "@/lib/mcp/server-monitor"

/**
 * get_bridge_health (v10.0.4 — O3). A dedicated, one-call remote health probe
 * for the X32 monitor bridge — APP-SIDE, so it ships independent of the bridge
 * install.
 *
 * Why it exists: the bridge's published `status` / `x32Connected` are
 * last-write-wins fields with NO server-side TTL — after the bridge dies they
 * stay "online" / true forever (live-confirmed 13.5h stale + still "online" in
 * the OBSERVABILITY audit). The ONLY honest liveness signal is `now − lastSeen`
 * math. This tool does that math (+ the same for the live mixer-state doc) and
 * returns a derived `alive` verdict so a caller is never fooled by the stale
 * booleans. It also surfaces the v10.0.4 additive heartbeat diagnostics
 * (socketAlive / unconfirmedCount / queueDepth / uptime / errCount / lastError)
 * when present — these read `null` against an older bridge that doesn't write them.
 *
 * Gate: trusted-leader (admin / band_leader, via assertEditor) — an ops probe,
 * NOT bus-scoped, so an admin can call it WITHOUT a bus assignment (clean probe).
 */

/** Last heartbeat older than this ⇒ the bridge is presumed down (2 missed 60s beats). */
const BRIDGE_ALIVE_THRESHOLD_SECONDS = 120

/**
 * The `config/monitor.bridge` heartbeat shape AFTER v10.0.4 — the canonical
 * BridgeStatus plus the additive O2 diagnostics. Read defensively (all optional)
 * so an older bridge (pre-v10.0.4) simply yields nulls for the new fields.
 */
interface ExtendedBridgeStatus {
    status?: "online" | "offline"
    x32Connected?: boolean
    lastSeen?: unknown
    clients?: number
    version?: string
    socketAlive?: boolean
    stateAgeMs?: number | null
    unconfirmedCount?: number
    lastOscRxAt?: number | null
    lastStateWriteAt?: number | null
    startedAt?: number
    uptimeMs?: number
    queueDepth?: number
    errCount?: number
    lastError?: unknown
}

export interface GetBridgeHealthResult {
    ok: true
    /** Derived from (now − lastSeen) ≤ threshold — the ONLY trustworthy liveness. */
    alive: boolean
    lastSeenAgeS: number | null
    lastSeenIso: string | null
    /** Age of the live mixer snapshot (monitor-live/state); null when timestampless. */
    stateAgeS: number | null
    stateStale: boolean
    /** Whether the single-writer lease has expired; null when no lease present. */
    leaseExpired: boolean | null
    /**
     * R1 (bridge v10.0.8) — a bridge that is UP but not elected. `null` means no
     * standby marker, which now genuinely means "nothing standing by" rather than
     * "we can't tell": a standby publishes `config/monitor.bridgeStandby` every
     * ≤15s. A live standby alongside `alive: false` is the crash-relaunch/takeover
     * signature — someone IS at the venue PC, they just don't hold the lease yet.
     * Null against a pre-v10.0.8 bridge, which wrote nothing while standing by.
     */
    standby: { ageS: number | null; instanceId: string | null; machineId: string | null } | null
    /** Raw last-write-wins heartbeat fields (may LIE once the bridge is down). */
    status: "online" | "offline" | null
    x32Connected: boolean | null
    /** v10.0.4 additive diagnostics — null against an older bridge. */
    socketAlive: boolean | null
    unconfirmedCount: number | null
    queueDepth: number | null
    version: string | null
    clients: number | null
    uptimeMs: number | null
    errCount: number | null
    lastError: { msg: string; ts: number } | null
    /** Human one-line verdict for quick reading. */
    summary: string
}

function coerceLastError(raw: unknown): { msg: string; ts: number } | null {
    if (!raw || typeof raw !== "object") return null
    const o = raw as { msg?: unknown; ts?: unknown }
    if (typeof o.msg !== "string") return null
    return { msg: o.msg, ts: typeof o.ts === "number" ? o.ts : 0 }
}

export async function getBridgeHealth(
    uid: string,
): Promise<GetBridgeHealthResult | RichErrorEnvelope> {
    try {
        initAdmin()
        const db = getFirestore()

        const gate = await assertEditor(db, uid)
        if (!gate.ok) return gate

        const config = await loadMonitorConfig(db)
        if (!config) {
            return richError(
                "monitor_unconfigured",
                "Monitor system is not configured for this deployment.",
                undefined,
                "Ask an admin to provision config/monitor before retrying.",
            )
        }

        const bridge = config.bridge as ExtendedBridgeStatus | undefined
        const lease = (config as { bridgeLease?: { expiresAt?: number } })
            .bridgeLease

        const now = Date.now()
        // computeStateAgeSeconds is generic (now − FirestoreDate); reuse it for the
        // heartbeat's lastSeen as well as the live-state updatedAt.
        const lastSeenAgeS = computeStateAgeSeconds(bridge?.lastSeen, now)
        const { updatedAt } = await loadMixerStateMeta(db)
        const stateAgeS = computeStateAgeSeconds(updatedAt, now)
        const alive =
            lastSeenAgeS != null && lastSeenAgeS <= BRIDGE_ALIVE_THRESHOLD_SECONDS
        const leaseExpired =
            typeof lease?.expiresAt === "number" ? lease.expiresAt < now : null
        const stale = isStateStale(stateAgeS)

        // R1 — standby liveness. Read defensively: absent on every bridge before
        // v10.0.8, and absent (correctly) whenever the local bridge is ACTIVE.
        const standbyRaw = (
            config as {
                bridgeStandby?: {
                    lastSeen?: unknown
                    instanceId?: unknown
                    machineId?: unknown
                }
            }
        ).bridgeStandby
        const standby = standbyRaw
            ? {
                  ageS: computeStateAgeSeconds(standbyRaw.lastSeen, now),
                  instanceId:
                      typeof standbyRaw.instanceId === "string" ? standbyRaw.instanceId : null,
                  machineId:
                      typeof standbyRaw.machineId === "string" ? standbyRaw.machineId : null,
              }
            : null

        const summary = !bridge
            ? "No bridge heartbeat has ever been written (config/monitor.bridge is absent)."
            : alive
              ? `Bridge alive — last seen ${lastSeenAgeS}s ago (v${bridge.version ?? "?"}).` +
                (stale
                    ? " WARNING: live mixer state is STALE; fader/mute values may not be current."
                    : "")
              : `Bridge appears DOWN — last heartbeat ${
                    lastSeenAgeS == null ? "never" : `${lastSeenAgeS}s`
                } ago. The status/x32Connected fields are last-write-wins and may still read "online".` +
                (standby
                    ? ` A STANDBY bridge is present (last marker ${standby.ageS ?? "?"}s ago) — a process IS running at the venue, it just doesn't hold the single-writer lease yet.`
                    : "")

        return {
            ok: true,
            alive,
            lastSeenAgeS,
            lastSeenIso: serializeLastSeen(bridge?.lastSeen),
            stateAgeS,
            stateStale: stale,
            leaseExpired,
            standby,
            status: bridge?.status ?? null,
            x32Connected:
                typeof bridge?.x32Connected === "boolean"
                    ? bridge.x32Connected
                    : null,
            socketAlive:
                typeof bridge?.socketAlive === "boolean"
                    ? bridge.socketAlive
                    : null,
            unconfirmedCount:
                typeof bridge?.unconfirmedCount === "number"
                    ? bridge.unconfirmedCount
                    : null,
            queueDepth:
                typeof bridge?.queueDepth === "number" ? bridge.queueDepth : null,
            version: bridge?.version ?? null,
            clients: typeof bridge?.clients === "number" ? bridge.clients : null,
            uptimeMs:
                typeof bridge?.uptimeMs === "number" ? bridge.uptimeMs : null,
            errCount:
                typeof bridge?.errCount === "number" ? bridge.errCount : null,
            lastError: coerceLastError(bridge?.lastError),
            summary,
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `get_bridge_health internal error: ${msg}`,
            { tool: "get_bridge_health" },
            "Retry; if the error persists, check config/monitor.",
        )
    }
}
