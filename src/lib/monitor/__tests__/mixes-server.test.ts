// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * BET-4 server rules for limits and saved mixes (shared by the MCP tools and
 * /api/monitor): ownership, privacy of named mixes, the engineer-only limits
 * write, and recall going through the ordinary command queue under the
 * caller's uid. A tiny path-keyed fake stands in for the admin Firestore.
 */

const roles = vi.hoisted(() => ({
    byUid: {} as Record<string, { effectiveRole: string | null; soundEngineer: boolean }>,
}))
vi.mock("@/lib/org/access", () => ({
    getTenantAccess: vi.fn(async (uid: string) => roles.byUid[uid] ?? { effectiveRole: null, soundEngineer: false }),
}))

type Data = Record<string, unknown>

class Fake {
    docs = new Map<string, Data>()
    private seq = 0
    collection(path: string) {
        return new Coll(this, path)
    }
    batch() {
        const ops: Array<() => void> = []
        return {
            set: (ref: Doc, data: Data) => void ops.push(() => this.docs.set(ref.path, { ...data })),
            commit: async () => ops.forEach((o) => o()),
        }
    }
    nextId() {
        return `id${++this.seq}`
    }
    under(path: string) {
        return [...this.docs.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/"))
    }
}
class Doc {
    constructor(readonly db: Fake, readonly path: string) {}
    get id() {
        return this.path.split("/").pop()!
    }
    collection(name: string) {
        return new Coll(this.db, `${this.path}/${name}`)
    }
    async get() {
        const d = this.db.docs.get(this.path)
        return { exists: !!d, id: this.id, data: () => d, get: (f: string) => d?.[f] }
    }
    async set(data: Data) {
        this.db.docs.set(this.path, { ...data })
    }
    async update(data: Data) {
        this.db.docs.set(this.path, { ...(this.db.docs.get(this.path) ?? {}), ...data })
    }
}
class Coll {
    constructor(readonly db: Fake, readonly path: string, private filters: Array<[string, unknown]> = []) {}
    doc(id?: string) {
        return new Doc(this.db, `${this.path}/${id ?? this.db.nextId()}`)
    }
    async add(data: Data) {
        const ref = this.doc()
        await ref.set(data)
        return ref
    }
    where(field: string, _op: string, value: unknown) {
        return new Coll(this.db, this.path, [...this.filters, [field, value]])
    }
    async get() {
        const docs = this.db
            .under(this.path)
            .filter(([, d]) => this.filters.every(([f, v]) => d[f] === v))
            .map(([p, d]) => ({ id: p.split("/").pop()!, data: () => d, get: (f: string) => d[f] }))
        return { docs, empty: docs.length === 0 }
    }
}

const SNAPS = "monitor-live/snapshots/buses"
const PENDING = "monitor-live/commands/pending"

let db: Fake
const asDb = () => db as unknown as FirebaseFirestore.Firestore

beforeEach(() => {
    db = new Fake()
    roles.byUid = {
        drew: { effectiveRole: "musician", soundEngineer: true },
        admin: { effectiveRole: "admin", soundEngineer: false },
        david: { effectiveRole: "musician", soundEngineer: false },
        daniel: { effectiveRole: "musician", soundEngineer: false },
        member: { effectiveRole: "member", soundEngineer: false },
    }
    db.docs.set("config/monitor", {
        monitorBuses: [1, 2, 3, 4, 5],
        busAssignments: { "2": [{ userId: "david", userName: "David" }], "5": [{ userId: "daniel", userName: "Daniel" }] },
    })
    db.docs.set("monitor-live/state", {
        channels: [{ index: 1, name: "Bass" }, { index: 2, name: "Vox" }],
        buses: [
            { index: 2, fader: 0.5, sends: [{ channelIndex: 1, level: 0.4, on: true }, { channelIndex: 2, level: 0.2, on: true }] },
            { index: 5, fader: 0.6, sends: [{ channelIndex: 1, level: 0.1, on: true }, { channelIndex: 2, level: 0.5, on: true }] },
        ],
        updatedAt: Date.now(),
    })
    db.docs.set(`${SNAPS}/2/items/davidNamed`, {
        busIndex: 2, kind: "named", name: "Fri", ownerUid: "david", createdAt: 100,
        sends: [{ channelIndex: 1, channelName: "Bass", level: 0.65, on: true }, { channelIndex: 2, channelName: "Vox", level: 0.95, on: true }],
        master: 0.66,
    })
    db.docs.set(`${SNAPS}/2/items/auto1`, {
        busIndex: 2, kind: "auto", createdAt: 50,
        sends: [{ channelIndex: 1, channelName: "Bass", level: 0.3, on: true }], master: 0.5,
    })
})

const server = () => import("@/lib/monitor/mixes-server")

describe("saved mixes: ownership and privacy", () => {
    it("a musician lists their own bus: their named mixes and the auto snapshots, plus home levels", async () => {
        const { listSavedMixes } = await server()
        const r = (await listSavedMixes(asDb(), "david", {})) as { busIndex: number; named: { id: string }[]; auto: { id: string }[]; home: unknown }
        expect(r.busIndex).toBe(2)
        expect(r.named.map((m) => m.id)).toEqual(["davidNamed"])
        expect(r.auto.map((m) => m.id)).toEqual(["auto1"])
        expect(r.home).toMatchObject({ master: 0.66, sends: { "1": 0.65 } })
    })

    it("a musician cannot list, save or recall on someone else's bus", async () => {
        const { listSavedMixes, saveMix, recallMix } = await server()
        for (const r of [
            await listSavedMixes(asDb(), "daniel", { busIndex: 2 }),
            await saveMix(asDb(), "daniel", { busIndex: 2, name: "x" }),
            await recallMix(asDb(), "daniel", { busIndex: 2, snapshotId: "auto1", dryRun: false }),
        ]) {
            expect(r).toMatchObject({ ok: false, error: { machine_code: "monitor_bus_forbidden" } })
        }
        expect(db.under(PENDING)).toHaveLength(0)
    })

    it("someone with no monitor access gets nothing", async () => {
        const { listSavedMixes } = await server()
        expect(await listSavedMixes(asDb(), "member", { busIndex: 2 })).toMatchObject({ ok: false, error: { machine_code: "monitor_access_denied" } })
    })

    it("the engineer may ride any bus but never sees or recalls another person's named mix", async () => {
        const { listSavedMixes, recallMix } = await server()
        const list = (await listSavedMixes(asDb(), "drew", { busIndex: 2 })) as { named: unknown[]; auto: { id: string }[] }
        expect(list.named).toEqual([])
        expect(list.auto.map((m) => m.id)).toEqual(["auto1"])
        expect(await recallMix(asDb(), "drew", { busIndex: 2, snapshotId: "davidNamed" })).toMatchObject({
            ok: false,
            error: { machine_code: "mix_not_found" },
        })
    })

    it("save stores the live levels with channel names, owned by the caller", async () => {
        const { saveMix } = await server()
        const r = (await saveMix(asDb(), "daniel", { name: "  Shabbat Morning ", serviceType: "shabbat_morning" })) as { id: string; busIndex: number }
        expect(r.busIndex).toBe(5)
        expect(db.docs.get(`${SNAPS}/5/items/${r.id}`)).toMatchObject({
            kind: "named",
            name: "Shabbat Morning",
            ownerUid: "daniel",
            master: 0.6,
            sends: [
                { channelIndex: 1, channelName: "Bass", level: 0.1, on: true },
                { channelIndex: 2, channelName: "Vox", level: 0.5, on: true },
            ],
        })
    })
})

describe("recall", () => {
    it("dry run (the default) plans before/after in dB and writes nothing", async () => {
        const { recallMix } = await server()
        const r = (await recallMix(asDb(), "david", { snapshotId: "davidNamed" })) as {
            dryRun: boolean
            changes: Array<{ target: string; channelName: string; before: { db: number }; after: { level: number; db: number }; heldAtLimit: boolean }>
        }
        expect(r.dryRun).toBe(true)
        const vox = r.changes.find((c) => c.channelName === "Vox")!
        expect(vox.after).toMatchObject({ level: 0.7, db: -2 }) // held to the default 0.70
        expect(vox.heldAtLimit).toBe(true)
        expect(db.under(PENDING)).toHaveLength(0)
    })

    it("a confirmed recall writes ramped commands to the pending queue under the caller's uid", async () => {
        const { recallMix } = await server()
        const r = (await recallMix(asDb(), "david", { snapshotId: "davidNamed", dryRun: false }, { stepMs: 0 })) as {
            committed: boolean
            commandCount: number
        } & Record<string, unknown>
        expect(r.committed).toBe(true)
        const cmds = db.under(PENDING).map(([, d]) => d)
        expect(cmds.length).toBe(r.commandCount)
        expect(cmds.every((c) => c.uid === "david" && c.busIndex === 2 && typeof c.createdAt === "number")).toBe(true)
        for (const c of cmds) expect(typeof c.value === "number" ? Number.isFinite(c.value) && c.value >= 0 && c.value <= 1 : true).toBe(true)
        const finalVox = cmds.filter((c) => c.channelIndex === 2).pop()
        expect(finalVox?.value).toBe(0.7)
    })
})

describe("limits", () => {
    it("anyone with monitor access reads them; defaults apply when none are stored", async () => {
        const { getMonitorLimits } = await server()
        const r = (await getMonitorLimits(asDb(), "david")) as { source: string; default: { send: { level: number; db: number } } }
        expect(r.source).toBe("defaults")
        expect(r.default.send).toEqual({ level: 0.7, db: -2 })
    })

    it("only the sound engineer or an admin may change them", async () => {
        const { setMonitorLimits } = await server()
        expect(await setMonitorLimits(asDb(), "david", { default: { send: 0.9 } })).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_limits_forbidden" },
        })
        expect((db.docs.get("config/monitor") as Data).ceilings).toBeUndefined()
        for (const uid of ["drew", "admin"]) {
            const r = await setMonitorLimits(asDb(), uid, { default: { send: 0.68 }, perBus: { "2": { master: 0.6 } } })
            expect(r).toMatchObject({ ok: true, committed: true })
            expect((db.docs.get("config/monitor") as Data).ceilings).toMatchObject({
                default: { send: 0.68, master: 0.7 },
                perBus: { "2": { master: 0.6 } },
                updatedBy: uid,
            })
        }
    })

    it("a bad value is refused and nothing is written", async () => {
        const { setMonitorLimits } = await server()
        expect(await setMonitorLimits(asDb(), "drew", { default: { send: 2 } })).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
        expect((db.docs.get("config/monitor") as Data).ceilings).toBeUndefined()
    })
})
