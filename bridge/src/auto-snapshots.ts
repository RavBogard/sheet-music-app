/**
 * Auto snapshots of each owned monitor bus (BET-4, saved mixes).
 *
 * Every wedge mix that people actually used gets remembered, so a musician can
 * recall "last Friday's mix" and a desk reset never wipes everyone. The bridge
 * writes one snapshot per OWNED bus (a bus with at least one person assigned):
 *
 *   - at service end: 2 hours after `startsAt` of each of today's services in
 *     the public `today.json` (the same feed the band's surfaces read);
 *   - or nightly at 23:00 local (this PC's clock) when today has no service with
 *     a start time, or `today.json` can't be read.
 *
 * Path (the shared data model, BET-4-wedge-safety.md):
 *   monitor-live/snapshots/buses/{busIndex}/items/{snapshotId}
 *   { busIndex, kind: "auto", serviceType?, createdAt, sends: [{channelIndex,
 *     channelName, level, on}], master }
 *
 * The snapshot id is deterministic per slot (`auto-<date>-<setlistId|nightly>`)
 * and written with `create()`, so a bridge restart inside the window never
 * writes the same slot twice. Only the last AUTO_KEEP auto snapshots per bus are
 * kept; named snapshots (written by the web) are never touched.
 *
 * Fail-open throughout: a snapshot is a convenience, never worth an exception
 * in the bridge.
 */

import * as admin from "firebase-admin"
import type { BusAssignment, BusInfo, ChannelInfo } from "./types"

export const SERVICE_END_OFFSET_MS = 2 * 60 * 60_000
export const NIGHTLY_HOUR_LOCAL = 23
/** A slot is still taken this long after it fell due (bridge down, desk off at the moment). */
export const SLOT_GRACE_MS = 2 * 60 * 60_000
export const AUTO_KEEP = 10
export const TODAY_REFRESH_MS = 15 * 60_000
export const DEFAULT_TODAY_URL = "https://www.centralreform.live/today.json"

export interface TodayServiceLite {
    setlistId: string
    serviceType?: string
    startsAt?: string
}

export interface SnapshotSlot {
    id: string
    dueMs: number
    serviceType?: string
}

export interface SnapshotSend {
    channelIndex: number
    channelName: string
    level: number
    on: boolean
}

export interface AutoSnapshotDoc {
    busIndex: number
    kind: "auto"
    serviceType?: string
    createdAt: admin.firestore.Timestamp
    sends: SnapshotSend[]
    master: number
}

/** `YYYY-MM-DD` of an instant on this PC's local clock. */
export function localDateKey(ms: number): string {
    const d = new Date(ms)
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${d.getFullYear()}-${mm}-${dd}`
}

function safeId(s: string): string {
    return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100)
}

/**
 * The snapshot slots relevant at `now`: one per service whose end (start + 2h)
 * falls within [now - grace, now + 24h], or, when none of today's services has a
 * start time, tonight's 23:00 nightly slot.
 */
export function slotsAt(now: number, services: TodayServiceLite[] | null): SnapshotSlot[] {
    const today = localDateKey(now)
    const slots: SnapshotSlot[] = []
    let serviceToday = false
    for (const s of services ?? []) {
        if (!s || typeof s.setlistId !== "string" || typeof s.startsAt !== "string") continue
        const start = Date.parse(s.startsAt)
        if (!Number.isFinite(start)) continue
        if (localDateKey(start) === today) serviceToday = true
        const dueMs = start + SERVICE_END_OFFSET_MS
        if (dueMs < now - SLOT_GRACE_MS || dueMs > now + 24 * 60 * 60_000) continue
        const slot: SnapshotSlot = { id: `auto-${localDateKey(start)}-${safeId(s.setlistId)}`, dueMs }
        if (typeof s.serviceType === "string" && s.serviceType) slot.serviceType = s.serviceType
        slots.push(slot)
    }
    if (!serviceToday) {
        const d = new Date(now)
        d.setHours(NIGHTLY_HOUR_LOCAL, 0, 0, 0)
        slots.push({ id: `auto-${today}-nightly`, dueMs: d.getTime() })
    }
    return slots
}

/** Slots that are due now (fell due, still inside the grace window). */
export function dueSlots(now: number, slots: SnapshotSlot[]): SnapshotSlot[] {
    return slots.filter((s) => now >= s.dueMs && now < s.dueMs + SLOT_GRACE_MS)
}

/** Buses with at least one person assigned. */
export function ownedBuses(
    busAssignments: Record<string, BusAssignment | BusAssignment[] | null> | undefined,
): number[] {
    const out: number[] = []
    for (const [key, a] of Object.entries(busAssignments ?? {})) {
        if (!a) continue
        const occupants = Array.isArray(a) ? a : [a]
        if (!occupants.some((o) => o && typeof o.userId === "string" && o.userId)) continue
        const n = parseInt(key, 10)
        if (Number.isInteger(n) && n > 0) out.push(n)
    }
    return out.sort((x, y) => x - y)
}

/** Build the snapshot doc for one bus from the bridge's cached desk state, or null. */
export function buildSnapshot(
    busIndex: number,
    state: { channels: ChannelInfo[]; buses: BusInfo[] },
    now: number,
    serviceType?: string,
): AutoSnapshotDoc | null {
    const bus = state.buses.find((b) => b.index === busIndex)
    if (!bus || !Array.isArray(bus.sends)) return null
    const names = new Map(state.channels.map((c) => [c.index, c.name]))
    const doc: AutoSnapshotDoc = {
        busIndex,
        kind: "auto",
        createdAt: admin.firestore.Timestamp.fromMillis(now),
        sends: bus.sends.map((s) => ({
            channelIndex: s.channelIndex,
            channelName: names.get(s.channelIndex) ?? "",
            level: s.level,
            on: s.on,
        })),
        master: bus.fader,
    }
    if (serviceType) doc.serviceType = serviceType
    return doc
}

export function snapshotItemsPath(busIndex: number): string {
    return `monitor-live/snapshots/buses/${busIndex}/items`
}

export interface AutoSnapshotDeps {
    db: admin.firestore.Firestore
    isConnected: () => boolean
    getState: () => { channels: ChannelInfo[]; buses: BusInfo[] }
    getBusAssignments: () => Record<string, BusAssignment | BusAssignment[] | null> | undefined
    /** today.json services; null when unreadable. */
    fetchToday: () => Promise<TodayServiceLite[] | null>
    now?: () => number
}

export class AutoSnapshotWriter {
    private readonly deps: AutoSnapshotDeps
    private readonly now: () => number
    private done = new Set<string>()
    private todayCache: { at: number; services: TodayServiceLite[] | null } | null = null

    constructor(deps: AutoSnapshotDeps) {
        this.deps = deps
        this.now = deps.now ?? Date.now
    }

    private async services(now: number): Promise<TodayServiceLite[] | null> {
        if (this.todayCache && now - this.todayCache.at < TODAY_REFRESH_MS) return this.todayCache.services
        let services: TodayServiceLite[] | null = null
        try {
            services = await this.deps.fetchToday()
        } catch {
            services = null
        }
        // Keep the last good list if this read failed.
        if (services === null && this.todayCache?.services) services = this.todayCache.services
        this.todayCache = { at: now, services }
        return services
    }

    /** Call about once a minute from the ACTIVE bridge. Returns the ids written. */
    async tick(): Promise<string[]> {
        const written: string[] = []
        try {
            const now = this.now()
            const due = dueSlots(now, slotsAt(now, await this.services(now)))
            if (due.length === 0) return written
            if (!this.deps.isConnected()) return written // no trustworthy levels; retry next tick
            const state = this.deps.getState()
            for (const slot of due) {
                for (const bus of ownedBuses(this.deps.getBusAssignments())) {
                    const key = `${slot.id}:${bus}`
                    if (this.done.has(key)) continue
                    const doc = buildSnapshot(bus, state, now, slot.serviceType)
                    if (!doc) continue
                    const ok = await this.createOnce(bus, slot.id, doc)
                    if (ok === "failed") continue
                    this.done.add(key)
                    if (ok === "created") {
                        written.push(key)
                        await this.prune(bus)
                    }
                }
            }
            if (this.done.size > 500) this.done.clear()
        } catch (err) {
            console.warn("[Snapshots] auto snapshot tick failed:", (err as Error)?.message ?? String(err))
        }
        return written
    }

    private async createOnce(
        bus: number,
        id: string,
        doc: AutoSnapshotDoc,
    ): Promise<"created" | "exists" | "failed"> {
        try {
            await this.deps.db.collection(snapshotItemsPath(bus)).doc(id).create(doc)
            console.log(`[Snapshots] Saved ${id} for bus ${bus}`)
            return "created"
        } catch (err) {
            const code = (err as { code?: unknown })?.code
            if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") return "exists"
            console.warn(`[Snapshots] Could not save ${id} for bus ${bus}:`, (err as Error)?.message ?? String(err))
            return "failed"
        }
    }

    /** Keep only the newest AUTO_KEEP auto snapshots on a bus. Named ones are never touched. */
    async prune(bus: number): Promise<number> {
        try {
            const snap = await this.deps.db.collection(snapshotItemsPath(bus)).where("kind", "==", "auto").get()
            const rows = snap.docs
                .map((d) => {
                    const c = d.data()?.createdAt as { toMillis?: () => number } | undefined
                    return { ref: d.ref, ms: typeof c?.toMillis === "function" ? c.toMillis() : 0 }
                })
                .sort((a, b) => b.ms - a.ms)
            const extra = rows.slice(AUTO_KEEP)
            if (extra.length === 0) return 0
            const batch = this.deps.db.batch()
            for (const r of extra) batch.delete(r.ref)
            await batch.commit()
            return extra.length
        } catch {
            return 0
        }
    }
}

/** Fetch `today.json` and return its services, or null. */
export async function fetchTodayServices(
    url: string = process.env.BRIDGE_TODAY_URL || DEFAULT_TODAY_URL,
): Promise<TodayServiceLite[] | null> {
    try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 10_000)
        try {
            const res = await fetch(url, { signal: ctl.signal })
            if (!res.ok) return null
            const body = (await res.json()) as { services?: unknown }
            return Array.isArray(body?.services) ? (body.services as TodayServiceLite[]) : null
        } finally {
            clearTimeout(timer)
        }
    } catch {
        return null
    }
}
