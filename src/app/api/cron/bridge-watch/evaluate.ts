/**
 * Pure bridge-health verdict logic, extracted from `route.ts`.
 *
 * A Next.js App Router `route.ts` may export ONLY HTTP handlers and the
 * route-segment config fields; exporting `evaluateBridge` from it type-checks
 * under `tsc` but fails `next build` with "not a valid Route export field".
 * That is how it reached master unnoticed: `tsc --noEmit` is clean, and a full
 * local `npm run build` cannot COMPLETE here (`.env.local` carries no
 * NEXT_PUBLIC_FIREBASE_* and page-data collection throws), so the wave was
 * gated on tsc alone and the violation only surfaced on Vercel. The local
 * build's TypeScript phase DOES run to completion, and that phase is the one
 * that catches this — it is worth running even though the build then dies.
 *
 * The verdict function is unit-tested, so it needs a home the tests can import
 * from; a `route.ts` cannot be that home.
 */

/** Two missed 60s heartbeats. Mirrors `BRIDGE_ALIVE_THRESHOLD_SECONDS`. */
const ALIVE_THRESHOLD_S = 120

/**
 * Live-state staleness. Mirrors the client's and the MCP's 90s threshold — the
 * three surfaces intentionally share one number so "stale" means one thing.
 */
const STATE_STALE_THRESHOLD_S = 90

/** Tolerant Firestore timestamp → ms. Same shape-tolerance as admin-consistency's. */
export function toMillis(raw: unknown): number | null {
    if (raw == null) return null
    if (raw instanceof Date) return raw.getTime()
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
    if (typeof raw === "string") {
        const parsed = Date.parse(raw)
        return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof raw === "object") {
        const o = raw as { toMillis?: unknown; toDate?: unknown; seconds?: unknown }
        if (typeof o.toMillis === "function") {
            try {
                const ms = (o.toMillis as () => number).call(o)
                return Number.isFinite(ms) ? ms : null
            } catch {
                return null
            }
        }
        if (typeof o.toDate === "function") {
            try {
                return (o.toDate as () => Date).call(o).getTime()
            } catch {
                return null
            }
        }
        if (typeof o.seconds === "number") return o.seconds * 1000
    }
    return null
}

export interface BridgeHeartbeat {
    status?: "online" | "offline"
    lastSeen?: unknown
    x32Connected?: boolean
    socketAlive?: boolean
    version?: string
    errCount?: number
    lastError?: { msg?: string; ts?: number }
}

export interface BridgeVerdict {
    healthy: boolean
    /** One line per thing that is wrong, in the order a human should read them. */
    problems: string[]
    /** The single action to take now. Empty when healthy. */
    remedy: string
    /** Stable identity of THIS problem set, for the re-notify guard. */
    signature: string
    lastSeenAgeS: number | null
    stateAgeS: number | null
    alive: boolean
    mixerReachable: boolean | null
    leaseExpired: boolean | null
}

/**
 * Pure verdict function — no Firestore, no notifications, so it is unit-testable
 * and so the wording of an alert can be pinned by test rather than by hope.
 *
 * Ordering matters: a dead bridge subsumes everything downstream (a dead process
 * cannot have a reachable mixer), so we report the ROOT cause and one remedy
 * rather than a wall of consequences.
 */
export function evaluateBridge(input: {
    bridge: BridgeHeartbeat | undefined
    stateUpdatedAt: unknown
    leaseExpiresAt: number | null
    now: number
}): BridgeVerdict {
    const { bridge, stateUpdatedAt, leaseExpiresAt, now } = input

    const lastSeenMs = toMillis(bridge?.lastSeen)
    const lastSeenAgeS = lastSeenMs != null ? Math.max(0, Math.round((now - lastSeenMs) / 1000)) : null
    const stateMs = toMillis(stateUpdatedAt)
    const stateAgeS = stateMs != null ? Math.max(0, Math.round((now - stateMs) / 1000)) : null
    const leaseExpired = leaseExpiresAt != null ? leaseExpiresAt < now : null

    // `socketAlive` is the raw OSC socket (bridge v10.0.4+); `x32Connected` is the
    // folded bit and can read false purely because state writes are stalling, so
    // it is only a fallback for older bridges.
    const mixerReachable =
        typeof bridge?.socketAlive === "boolean"
            ? bridge.socketAlive
            : typeof bridge?.x32Connected === "boolean"
              ? bridge.x32Connected
              : null

    const alive = lastSeenAgeS != null && lastSeenAgeS <= ALIVE_THRESHOLD_S

    const problems: string[] = []
    const parts: string[] = []
    let remedy = ""

    if (!bridge) {
        problems.push("The bridge has never written a heartbeat (config/monitor.bridge is absent).")
        remedy = "Check that the bridge app is installed and running on the venue PC, and that its credentials are provisioned."
        parts.push("no-heartbeat")
    } else if (!alive) {
        const ageText = lastSeenAgeS == null ? "never" : `${Math.round(lastSeenAgeS / 60)} min ago`
        problems.push(
            `The bridge is DOWN — last heartbeat ${ageText}. ` +
            `Its status field still reads "${bridge.status ?? "unknown"}", which is last-write-wins and cannot be trusted.`,
        )
        remedy = "Restart the bridge app on the venue PC (or run bridge_restart). Musicians' iPads cannot control anything until it is back."
        parts.push("down")
    } else {
        // Alive — now the subtler failures, which only mean something on a live process.
        if (mixerReachable === false) {
            problems.push("The bridge is running but cannot reach the X32 — the desk is powered off, on another network, or its IP changed.")
            remedy = "Check the X32 is powered on and on the same LAN, then run bridge_reconnect."
            parts.push("mixer-unreachable")
        }
        if (stateAgeS != null && stateAgeS > STATE_STALE_THRESHOLD_S) {
            problems.push(
                `Live mixer state is stale (${stateAgeS}s old) even though the bridge is heartbeating — the state-write path is wedged.`,
            )
            if (!remedy) remedy = "Run bridge_resync; if the state age does not drop, run bridge_restart."
            parts.push("state-stale")
        }
        if (stateAgeS == null) {
            problems.push("The bridge is heartbeating but has never published a mixer snapshot.")
            if (!remedy) remedy = "Run bridge_resync to force a full desk read."
            parts.push("no-state")
        }
        if (leaseExpired === true) {
            problems.push(
                "The single-writer lease has expired while the bridge is alive — it may be stuck in standby and draining no commands.",
            )
            if (!remedy) remedy = "Run bridge_restart; a standby bridge writes no state and applies no fader moves."
            parts.push("lease-expired")
        }
        if (bridge.status === "offline") {
            problems.push("The bridge reports itself offline (graceful shutdown) but is still heartbeating.")
            if (!remedy) remedy = "Restart the bridge app on the venue PC."
            parts.push("self-reported-offline")
        }
    }

    return {
        healthy: problems.length === 0,
        problems,
        remedy,
        signature: parts.sort().join("+"),
        lastSeenAgeS,
        stateAgeS,
        alive,
        mixerReachable,
        leaseExpired,
    }
}
