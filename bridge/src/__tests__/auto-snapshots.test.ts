import { describe, it, expect, vi } from "vitest"

vi.mock("firebase-admin", () => ({
    firestore: {
        Timestamp: {
            fromMillis: (ms: number) => ({ toMillis: () => ms, _ms: ms }),
        },
    },
}))

import {
    AUTO_KEEP,
    AutoSnapshotWriter,
    buildSnapshot,
    dueSlots,
    localDateKey,
    ownedBuses,
    slotsAt,
    snapshotItemsPath,
    SERVICE_END_OFFSET_MS,
    type TodayServiceLite,
} from "../auto-snapshots"

/** A local-clock instant on 2026-10-30 at hh:mm. */
function at(hh: number, mm = 0, day = 30): number {
    return new Date(2026, 9, day, hh, mm, 0, 0).getTime()
}

const state = {
    channels: [
        { index: 1, name: "Vox Daniel", color: 0 },
        { index: 2, name: "Bass", color: 0 },
    ],
    buses: [
        { index: 2, name: "David", fader: 0.7, sends: [{ channelIndex: 1, level: 0.5, on: true }, { channelIndex: 2, level: 0.4, on: false }] },
        { index: 5, name: "Daniel", fader: 0.6, sends: [{ channelIndex: 1, level: 0.65, on: true }] },
    ],
}
const assignments = {
    "2": [{ userId: "david", userName: "David" }],
    "3": [],
    "4": null,
    "5": { userId: "daniel", userName: "Daniel" },
}

/** In-memory Firestore covering exactly what the writer uses. */
function fakeDb() {
    const store = new Map<string, Record<string, unknown>>()
    const db = {
        collection: (coll: string) => ({
            doc: (id: string) => ({
                create: async (data: Record<string, unknown>) => {
                    const key = `${coll}/${id}`
                    if (store.has(key)) throw Object.assign(new Error("exists"), { code: 6 })
                    store.set(key, data)
                },
            }),
            where: (field: string, _op: string, value: unknown) => ({
                get: async () => ({
                    docs: [...store.entries()]
                        .filter(([k, v]) => k.startsWith(`${coll}/`) && v[field] === value)
                        .map(([k, v]) => ({ ref: { key: k }, data: () => v })),
                }),
            }),
        }),
        batch: () => {
            const dels: string[] = []
            return {
                delete: (ref: { key: string }) => dels.push(ref.key),
                commit: async () => dels.forEach((k) => store.delete(k)),
            }
        },
    }
    return { db: db as unknown as import("firebase-admin").firestore.Firestore, store }
}

describe("auto snapshots (BET-4)", () => {
    it("service-end slot is 2h after today's startsAt; no nightly slot on a service day", () => {
        const start = at(9, 30)
        const services: TodayServiceLite[] = [
            { setlistId: "s1", serviceType: "shabbat_morning", startsAt: new Date(start).toISOString() },
        ]
        const slots = slotsAt(at(8), services)
        expect(slots).toHaveLength(1)
        expect(slots[0]).toMatchObject({ dueMs: start + SERVICE_END_OFFSET_MS, serviceType: "shabbat_morning" })
        expect(slots[0].id).toBe(`auto-${localDateKey(start)}-s1`)
        expect(dueSlots(at(11, 29), slots)).toHaveLength(0)
        expect(dueSlots(at(11, 30), slots)).toHaveLength(1)
    })

    it("no setlist today (or today.json unreadable) → one nightly slot at 23:00 local", () => {
        for (const services of [null, [], [{ setlistId: "x", startsAt: new Date(at(10, 0, 31)).toISOString() }]]) {
            const slots = slotsAt(at(12), services)
            const nightly = slots.find((s) => s.id.endsWith("-nightly"))
            expect(nightly?.dueMs).toBe(at(23))
        }
    })

    it("ownedBuses counts only buses with someone assigned (single, array, empty, null)", () => {
        expect(ownedBuses(assignments)).toEqual([2, 5])
        expect(ownedBuses(undefined)).toEqual([])
    })

    it("buildSnapshot stores channel name AND index, levels, mutes and the master", () => {
        const doc = buildSnapshot(2, state, at(23), "friday_night")!
        expect(doc).toMatchObject({ busIndex: 2, kind: "auto", master: 0.7, serviceType: "friday_night" })
        expect(doc.sends).toEqual([
            { channelIndex: 1, channelName: "Vox Daniel", level: 0.5, on: true },
            { channelIndex: 2, channelName: "Bass", level: 0.4, on: false },
        ])
        expect(buildSnapshot(9, state, at(23))).toBeNull()
    })

    it("writer: writes one snapshot per owned bus when due, only once per slot, and not while the desk is offline", async () => {
        const { db, store } = fakeDb()
        let now = at(22, 59)
        let connected = false
        const w = new AutoSnapshotWriter({
            db,
            isConnected: () => connected,
            getState: () => state,
            getBusAssignments: () => assignments,
            fetchToday: async () => [],
            now: () => now,
        })
        expect(await w.tick()).toEqual([]) // not due yet
        now = at(23, 1)
        expect(await w.tick()).toEqual([]) // due, but the desk is off: retry later
        connected = true
        const written = await w.tick()
        expect(written.sort()).toEqual([`auto-${localDateKey(now)}-nightly:2`, `auto-${localDateKey(now)}-nightly:5`])
        expect(store.has(`${snapshotItemsPath(5)}/auto-${localDateKey(now)}-nightly`)).toBe(true)
        expect(await w.tick()).toEqual([]) // same slot never twice

        // A restarted bridge (fresh writer) inside the window doesn't duplicate either.
        const w2 = new AutoSnapshotWriter({
            db,
            isConnected: () => true,
            getState: () => state,
            getBusAssignments: () => assignments,
            fetchToday: async () => null,
            now: () => now,
        })
        expect(await w2.tick()).toEqual([])
        expect(store.size).toBe(2)
    })

    it("prune keeps the newest AUTO_KEEP auto snapshots per bus and never touches named ones", async () => {
        const { db, store } = fakeDb()
        const coll = snapshotItemsPath(5)
        for (let i = 0; i < AUTO_KEEP + 3; i++) {
            store.set(`${coll}/a${i}`, { kind: "auto", createdAt: { toMillis: () => i } })
        }
        store.set(`${coll}/mine`, { kind: "named", createdAt: { toMillis: () => -1 } })
        const w = new AutoSnapshotWriter({
            db,
            isConnected: () => true,
            getState: () => state,
            getBusAssignments: () => assignments,
            fetchToday: async () => null,
        })
        expect(await w.prune(5)).toBe(3)
        expect(store.has(`${coll}/a0`)).toBe(false)
        expect(store.has(`${coll}/a2`)).toBe(false)
        expect(store.has(`${coll}/a3`)).toBe(true)
        expect(store.has(`${coll}/mine`)).toBe(true)
    })
})
