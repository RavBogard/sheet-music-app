import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { timedServices, type ServiceLike, type TimedService } from "./service-start"

/**
 * The end-of-service mix snapshot, built on the SERVER from the mirror the
 * bridge keeps in Firestore (`monitor-live/state`: every bus's master and its
 * per-channel sends, plus the channel names). The studio PC is now switched off
 * after each service, so the bridge's own "2 hours after start" snapshot
 * (`bridge/src/auto-snapshots.ts`) often never gets to run. The mirror keeps the
 * last mix the bridge saw, which is exactly the end-of-service mix, so the
 * server can take the snapshot after the PC is off and no bridge release is needed.
 *
 * The result is the SAME snapshot the recall UI already reads:
 *
 *   monitor-live/snapshots/buses/{busIndex}/items/auto-<date>-<setlistId>
 *   { busIndex, kind: "auto", serviceType?, createdAt, sends: [...], master }
 *
 * with the SAME deterministic id the bridge uses, so whichever of the two writes
 * first wins and the other finds the document already there (written with
 * `create()`): one snapshot per service per bus, never two.
 *
 * Pure: no Firestore, no clock.
 */

/** The bridge takes its own snapshot this long after a service starts; so do we. */
export const SERVICE_END_OFFSET_MS = 2 * 60 * 60_000
/** A service stays eligible this long after it fell due; the cron is hourly. */
export const SNAPSHOT_ELIGIBLE_MS = 6 * 60 * 60_000
/** The mirror must have been written no earlier than this before the start, or the bridge was not up for the service. */
export const MIRROR_FRESH_BEFORE_START_MS = 30 * 60_000
/** How many auto snapshots a bus keeps (the bridge keeps the same). */
export const AUTO_KEEP = 10

export interface MirrorState {
    channels?: unknown
    buses?: unknown
}

export interface SnapshotSend {
    channelIndex: number
    channelName: string
    level: number
    on: boolean
}

export interface ServiceSnapshotDoc {
    busIndex: number
    kind: "auto"
    serviceType?: string
    createdAt: Date
    sends: SnapshotSend[]
    master: number
}

function safeId(s: string): string {
    return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100)
}

/** The bridge's id for a service's snapshot: `auto-<local start date>-<setlistId>`. */
export function snapshotIdFor(
    service: Pick<TimedService, "setlistId" | "startMs">,
    timeZone: string = orgTimeZone(DEFAULT_ORG_ID),
): string {
    return `auto-${dayInZone(service.startMs, timeZone)}-${safeId(service.setlistId)}`
}

/** Services whose end (start + 2 h) has passed, within the eligible window, soonest first. */
export function servicesDueForSnapshot(
    services: ServiceLike[],
    now: number,
    timeZone?: string,
): TimedService[] {
    return timedServices(services, timeZone).filter((s) => {
        const due = s.startMs + SERVICE_END_OFFSET_MS
        return now >= due && now < due + SNAPSHOT_ELIGIBLE_MS
    })
}

/**
 * True when the mirror's last write is from around or after the service start,
 * so it holds that service's mix rather than a days-old one from a PC that never
 * came on.
 */
export function mirrorCoversService(mirrorUpdatedMs: number | null, startMs: number): boolean {
    return mirrorUpdatedMs != null && mirrorUpdatedMs >= startMs - MIRROR_FRESH_BEFORE_START_MS
}

/** Buses with at least one person assigned (the same rule as the bridge's `ownedBuses`). */
export function ownedBuses(busAssignments: unknown): number[] {
    const out: number[] = []
    if (!busAssignments || typeof busAssignments !== "object") return out
    for (const [key, a] of Object.entries(busAssignments as Record<string, unknown>)) {
        if (!a) continue
        const occupants = Array.isArray(a) ? a : [a]
        const owned = occupants.some((o) => {
            const uid = (o as { userId?: unknown } | null)?.userId
            return typeof uid === "string" && uid.length > 0
        })
        if (!owned) continue
        const n = parseInt(key, 10)
        if (Number.isInteger(n) && n > 0) out.push(n)
    }
    return out.sort((x, y) => x - y)
}

const isLevel = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1

/**
 * One bus's snapshot from the mirrored desk state, or null when the mirror has
 * nothing usable for that bus. `createdAtMs` is when the mirror was last written
 * (the moment the mix was last seen), not when the cron ran.
 */
export function buildServiceSnapshot(
    busIndex: number,
    state: MirrorState,
    createdAtMs: number,
    serviceType?: string,
): ServiceSnapshotDoc | null {
    const buses = Array.isArray(state.buses) ? (state.buses as Array<Record<string, unknown>>) : []
    const bus = buses.find((b) => b && b.index === busIndex)
    if (!bus || !Array.isArray(bus.sends) || !isLevel(bus.fader)) return null
    const channels = Array.isArray(state.channels) ? (state.channels as Array<Record<string, unknown>>) : []
    const names = new Map<number, string>()
    for (const c of channels) {
        if (c && typeof c.index === "number") names.set(c.index, typeof c.name === "string" ? c.name : "")
    }
    const sends: SnapshotSend[] = []
    for (const s of bus.sends as Array<Record<string, unknown>>) {
        if (!s || typeof s.channelIndex !== "number" || !isLevel(s.level)) continue
        sends.push({
            channelIndex: s.channelIndex,
            channelName: names.get(s.channelIndex) ?? "",
            level: s.level,
            on: s.on !== false,
        })
    }
    if (sends.length === 0) return null
    const doc: ServiceSnapshotDoc = {
        busIndex,
        kind: "auto",
        createdAt: new Date(createdAtMs),
        sends,
        master: bus.fader,
    }
    if (serviceType) doc.serviceType = serviceType
    return doc
}
