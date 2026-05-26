import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"

/**
 * Monitor Overhaul Phase 2 — command processing: acks (B6), server-relative
 * timing (B4), ordering/idempotency (B5), client count (B13), and the
 * single-writer gate (B10).
 *
 * firebase-admin is mocked so we capture every ack write
 * (monitor-live/acks/items/{id}), every state write, and the command batch's
 * delete/update ops. The command listener's onSnapshot callback is captured so
 * we can feed commands; the X32 is an EventEmitter stub whose setters are spies
 * and whose change events we emit to simulate the C2 read-back confirmation.
 */

interface SetCall {
    path: string
    data: Record<string, unknown>
}
const stateSetCalls: SetCall[] = []
const ackSetCalls: SetCall[] = []
const batchDeletes: Array<{ id: string }> = []
const batchUpdates: Array<{ ref: { id: string }; data: Record<string, unknown> }> = []

let commandCb: ((snap: { docChanges: () => unknown[] }) => void) | null = null
let usersMap: Record<string, { role?: string; soundEngineer?: boolean }> = {}

vi.mock("firebase-admin", () => {
    const makeDoc = (path: string) => ({
        set: (data: Record<string, unknown>) => {
            if (path === "monitor-live/state") stateSetCalls.push({ path, data })
            else if (path.startsWith("monitor-live/commands/acks/")) ackSetCalls.push({ path, data })
            return Promise.resolve()
        },
        get: () => Promise.resolve({ exists: false, data: () => ({}) }),
    })
    const usersCollection = {
        doc: (uid: string) => ({
            get: () =>
                Promise.resolve(
                    usersMap[uid]
                        ? { exists: true, data: () => usersMap[uid] }
                        : { exists: false, data: () => undefined },
                ),
        }),
    }
    const emptyQuery = {
        where: () => ({ limit: () => ({ get: () => Promise.resolve({ empty: true, size: 0, docs: [] }) }) }),
    }
    const makeCollection = (path: string) => {
        if (path === "users") return usersCollection
        if (path === "monitor-live/commands/pending") {
            return {
                orderBy: () => ({
                    onSnapshot: (cb: (snap: { docChanges: () => unknown[] }) => void) => {
                        commandCb = cb
                        return () => {}
                    },
                }),
                ...emptyQuery,
            }
        }
        return emptyQuery
    }
    const firestore = Object.assign(
        vi.fn(() => ({
            doc: (p: string) => makeDoc(p),
            collection: (p: string) => makeCollection(p),
            batch: () => ({
                delete: (ref: { id: string }) => batchDeletes.push(ref),
                update: (ref: { id: string }, data: Record<string, unknown>) => batchUpdates.push({ ref, data }),
                commit: () => Promise.resolve(),
            }),
        })),
        { FieldValue: { serverTimestamp: () => "<server-ts>" } },
    )
    return { apps: [{ name: "[DEFAULT]" }], firestore }
})

import { FirestoreTransport } from "../firestore-transport"
import type { X32Client } from "../x32-client"
import type { ConfigManager } from "../config"

function makeX32() {
    const e = new EventEmitter() as unknown as X32Client & EventEmitter & Record<string, unknown>
    e.channels = []
    e.buses = []
    e.matrices = []
    ;(e as Record<string, unknown>).getUnconfirmed = () => []
    ;(e as Record<string, unknown>).isConnected = () => true
    ;(e as Record<string, unknown>).syncFullState = vi.fn().mockResolvedValue(undefined)
    ;(e as Record<string, unknown>).setBusFader = vi.fn()
    ;(e as Record<string, unknown>).setBusOn = vi.fn()
    ;(e as Record<string, unknown>).setSendLevel = vi.fn()
    ;(e as Record<string, unknown>).setSendOn = vi.fn()
    ;(e as Record<string, unknown>).setMatrixFader = vi.fn()
    ;(e as Record<string, unknown>).setMatrixOn = vi.fn()
    return e
}

function makeConfig(getUserBus: (uid: string) => number | null): ConfigManager {
    return {
        getUserBus,
        getConfig: () => ({ monitorBuses: [1, 2, 3, 4, 5] }),
    } as unknown as ConfigManager
}

interface CmdInput {
    type: string
    busIndex?: number
    channelIndex?: number
    matrixIndex?: number
    value?: number | boolean
    uid: string
    createdAt?: number
    id: string
    createMs?: number
}

function changeFor(c: CmdInput) {
    const createdAt = c.createdAt ?? Date.now()
    const createMs = c.createMs ?? createdAt
    const data = {
        type: c.type,
        busIndex: c.busIndex,
        channelIndex: c.channelIndex,
        matrixIndex: c.matrixIndex,
        value: c.value,
        uid: c.uid,
        createdAt,
    }
    return {
        type: "added",
        doc: {
            data: () => data,
            ref: { id: c.id, path: `monitor-live/commands/pending/${c.id}` },
            createTime: { toMillis: () => createMs },
        },
    }
}

function ackFor(id: string): Record<string, unknown> | undefined {
    return ackSetCalls.find((a) => a.path === `monitor-live/commands/acks/${id}`)?.data
}

describe("FirestoreTransport — command acks + robustness (Phase 2 B4/B5/B6/B10/B13)", () => {
    beforeEach(() => {
        stateSetCalls.length = 0
        ackSetCalls.length = 0
        batchDeletes.length = 0
        batchUpdates.length = 0
        commandCb = null
        usersMap = {}
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function start(getUserBus: (uid: string) => number | null, isActive = true) {
        const x32 = makeX32()
        const t = new FirestoreTransport(x32, makeConfig(getUserBus), () => isActive)
        t.start()
        return { x32, t }
    }

    async function feed(cmds: CmdInput[]) {
        if (!commandCb) throw new Error("command listener not registered")
        commandCb({ docChanges: () => cmds.map(changeFor) })
    }
    async function runBatch() {
        await vi.advanceTimersByTimeAsync(25) // > COMMAND_BATCH_WINDOW (20ms)
    }

    it("B6: an authorized command that confirms from the desk gets an APPLIED ack with the confirmedValue", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-keys", id: "c-applied" }])
        await runBatch()

        // SET reached the desk; no ack yet (awaiting C2 read-back).
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).toHaveBeenCalledWith(5, 0.2)
        expect(ackFor("c-applied")).toBeUndefined()

        // The C2 read-back arrives as a change event with the confirmed value.
        ;(x32 as unknown as EventEmitter).emit("bus_fader", 5, 0.2)
        const ack = ackFor("c-applied")
        expect(ack?.status).toBe("applied")
        expect(ack?.confirmedValue).toBeCloseTo(0.2, 5)
        t.stop()
    })

    it("B6: an unauthorized command gets a REJECTED ack (reason: unauthorized) and is not sent to the desk", async () => {
        const { x32, t } = start(() => null) // owns no bus
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.9, uid: "intruder", id: "c-unauth" }])
        await runBatch()
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).not.toHaveBeenCalled()
        const ack = ackFor("c-unauth")
        expect(ack?.status).toBe("rejected")
        expect(ack?.reason).toBe("unauthorized")
        t.stop()
    })

    it("B6: an applied command with no read-back confirmation times out (TIMEOUT ack) after the window", async () => {
        const { t } = start((uid) => (uid === "u-keys" ? 5 : null))
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.3, uid: "u-keys", id: "c-toa" }])
        await runBatch()
        expect(ackFor("c-toa")).toBeUndefined() // still pending

        await vi.advanceTimersByTimeAsync(1500) // ACK_CONFIRM_TIMEOUT_MS
        const ack = ackFor("c-toa")
        expect(ack?.status).toBe("timeout")
        expect(String(ack?.reason)).toContain("no read-back confirmation")
        t.stop()
    })

    it("B6: an unknown command type (but authorized target) gets a REJECTED ack", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        await feed([{ type: "set_bogus", busIndex: 5, value: 0.5, uid: "u-keys", id: "c-bogus" }])
        await runBatch()
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).not.toHaveBeenCalled()
        const ack = ackFor("c-bogus")
        expect(ack?.status).toBe("rejected")
        expect(String(ack?.reason)).toContain("unknown or malformed")
        t.stop()
    })

    it("B4: staleness uses the SERVER createTime — a fresh client clock + old server time → TIMEOUT", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        const now = Date.now()
        await feed([
            { type: "set_bus_master", busIndex: 5, value: 0.4, uid: "u-keys", id: "c-skew-old", createdAt: now, createMs: now - 20_000 },
        ])
        await runBatch()
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).not.toHaveBeenCalled()
        const ack = ackFor("c-skew-old")
        expect(ack?.status).toBe("timeout")
        expect(String(ack?.reason)).toContain("expired")
        t.stop()
    })

    it("B4: a skewed-OLD client clock does NOT falsely reject when the server createTime is fresh", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        const now = Date.now()
        await feed([
            { type: "set_bus_master", busIndex: 5, value: 0.6, uid: "u-keys", id: "c-skew-new", createdAt: now - 60_000, createMs: now },
        ])
        await runBatch()
        // createTime is fresh → applied path, sent to the desk despite the stale client createdAt.
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).toHaveBeenCalledWith(5, 0.6)
        t.stop()
    })

    it("B5 idempotency: a re-delivered commandId is applied to the desk only ONCE", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        const setBusFader = (x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-keys", id: "c-dup" }])
        await runBatch()
        expect(setBusFader).toHaveBeenCalledTimes(1)

        // Same commandId redelivered (listener re-establish).
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-keys", id: "c-dup" }])
        await runBatch()
        expect(setBusFader).toHaveBeenCalledTimes(1) // not re-applied
        t.stop()
    })

    it("B5 ordering: an older command for a target already advanced by a newer one is REJECTED as superseded", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        const setBusFader = (x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader
        const now = Date.now()
        // Newer command first (server time 200).
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.9, uid: "u-keys", id: "c-new", createMs: now + 200 }])
        await runBatch()
        expect(setBusFader).toHaveBeenLastCalledWith(5, 0.9)

        // Then an OLDER command (server time 100) for the same target arrives late.
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.1, uid: "u-keys", id: "c-old", createMs: now + 100 }])
        await runBatch()
        // It must NOT clobber the newer value on the desk…
        expect(setBusFader).not.toHaveBeenCalledWith(5, 0.1)
        // …and is acked rejected/superseded.
        const ack = ackFor("c-old")
        expect(ack?.status).toBe("rejected")
        expect(String(ack?.reason)).toContain("superseded")
        t.stop()
    })

    it("B13: getActiveClientCount counts distinct recently-commanding clients", async () => {
        const { t } = start(() => 5)
        await feed([
            { type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-a", id: "c-a" },
            { type: "set_bus_master", busIndex: 5, value: 0.3, uid: "u-b", id: "c-b" },
            { type: "set_bus_master", busIndex: 5, value: 0.4, uid: "u-a", id: "c-a2" },
        ])
        expect(t.getActiveClientCount()).toBe(2) // u-a + u-b (distinct)
        t.stop()
    })

    it("B10 + B-A4: a STANDBY bridge does not drain commands or write state, but DOES write a rejection ack (reason: bridge-standby) so iPad clients aren't stranded waiting for the ACK_CONFIRM_TIMEOUT_MS fallback", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null), /* isActive */ false)
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-keys", id: "c-standby" }])
        await runBatch()
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).not.toHaveBeenCalled()
        expect(batchDeletes).toHaveLength(0) // leaves pending docs for the active bridge
        const ack = ackFor("c-standby")
        expect(ack?.status).toBe("rejected")
        expect(ack?.reason).toBe("bridge-standby")

        await t.writeFullState()
        expect(stateSetCalls).toHaveLength(0) // standby never writes state
        t.stop()
    })

    it("B-A4: a STANDBY bridge writes ONE rejection ack per queued command (N commands → N acks, each reason: bridge-standby)", async () => {
        const { t } = start((uid) => (uid === "u-keys" ? 5 : null), /* isActive */ false)
        const ids = ["c-sb-1", "c-sb-2", "c-sb-3", "c-sb-4", "c-sb-5"]
        await feed(
            ids.map((id, i) => ({ type: "set_bus_master", busIndex: 5, value: 0.1 * (i + 1), uid: "u-keys", id })),
        )
        await runBatch()
        for (const id of ids) {
            const ack = ackFor(id)
            expect(ack?.status, `${id} must be rejected`).toBe("rejected")
            expect(ack?.reason, `${id} reason`).toBe("bridge-standby")
        }
        expect(ackSetCalls.filter((a) => (a.data as { reason?: string }).reason === "bridge-standby")).toHaveLength(5)
        t.stop()
    })

    it("B-A4: an empty-queue tick on a STANDBY bridge writes zero acks (no spurious writes when nothing was queued)", async () => {
        const { t } = start(() => 5, /* isActive */ false)
        // No feed() — queue stays empty. Advance past COMMAND_BATCH_WINDOW so the
        // periodic processCommandBatch path would fire if it were going to.
        await runBatch()
        expect(ackSetCalls).toHaveLength(0)
        t.stop()
    })

    it("B-A4 regression guard: the ACTIVE-mode success path never writes a bridge-standby rejection ack (only the standby-drop branch uses that reason)", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null), /* isActive */ true)
        await feed([{ type: "set_bus_master", busIndex: 5, value: 0.2, uid: "u-keys", id: "c-active" }])
        await runBatch()
        expect((x32 as unknown as { setBusFader: ReturnType<typeof vi.fn> }).setBusFader).toHaveBeenCalledWith(5, 0.2)
        ;(x32 as unknown as EventEmitter).emit("bus_fader", 5, 0.2)
        const ack = ackFor("c-active")
        expect(ack?.status).toBe("applied")
        expect(ack?.reason).toBeUndefined()
        // And no other ack write in this run carried the standby reason.
        expect(ackSetCalls.filter((a) => (a.data as { reason?: string }).reason === "bridge-standby")).toHaveLength(0)
        t.stop()
    })

    it("B6 matrix: an engineer's matrix command confirms to an APPLIED ack with a boolean value", async () => {
        usersMap = { "u-eng": { soundEngineer: true } }
        const { x32, t } = start(() => null) // not bus-owner; engineer via users doc
        await feed([{ type: "set_matrix_on", matrixIndex: 2, value: false, uid: "u-eng", id: "c-mtx" }])
        await runBatch()
        expect((x32 as unknown as { setMatrixOn: ReturnType<typeof vi.fn> }).setMatrixOn).toHaveBeenCalledWith(2, false)

        ;(x32 as unknown as EventEmitter).emit("matrix_on", 2, false)
        const ack = ackFor("c-mtx")
        expect(ack?.status).toBe("applied")
        expect(ack?.confirmedValue).toBe(false)
        t.stop()
    })

    // ─── monitor-master-mute-fix — set_bus_on round-trip mirror of set_matrix_on ──
    it("B6 bus_on: an authorized bus-owner master-mute command confirms to APPLIED with bool value", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        await feed([{ type: "set_bus_on", busIndex: 5, value: false, uid: "u-keys", id: "c-busmute" }])
        await runBatch()
        // SET reached the desk via setBusOn(5, false)
        expect((x32 as unknown as { setBusOn: ReturnType<typeof vi.fn> }).setBusOn).toHaveBeenCalledWith(5, false)
        // No ack yet — awaiting C2 read-back on /bus/05/mix/on
        expect(ackFor("c-busmute")).toBeUndefined()

        // The C2 read-back arrives as a `bus_on` change event with the confirmed value.
        ;(x32 as unknown as EventEmitter).emit("bus_on", 5, false)
        const ack = ackFor("c-busmute")
        expect(ack?.status).toBe("applied")
        expect(ack?.confirmedValue).toBe(false)
        t.stop()
    })

    it("B6 bus_on: an unauthorized non-owner master-mute command is REJECTED and not sent to the desk", async () => {
        const { x32, t } = start(() => null) // owns no bus, not engineer
        await feed([{ type: "set_bus_on", busIndex: 5, value: false, uid: "intruder", id: "c-busmute-unauth" }])
        await runBatch()
        expect((x32 as unknown as { setBusOn: ReturnType<typeof vi.fn> }).setBusOn).not.toHaveBeenCalled()
        const ack = ackFor("c-busmute-unauth")
        expect(ack?.status).toBe("rejected")
        expect(ack?.reason).toBe("unauthorized")
        t.stop()
    })

    it("B6 bus_on: a malformed bus_on (missing value) gets REJECTED via confirmKeyFor null branch", async () => {
        const { x32, t } = start((uid) => (uid === "u-keys" ? 5 : null))
        await feed([{ type: "set_bus_on", busIndex: 5, uid: "u-keys", id: "c-busmute-malformed" }])
        await runBatch()
        expect((x32 as unknown as { setBusOn: ReturnType<typeof vi.fn> }).setBusOn).not.toHaveBeenCalled()
        const ack = ackFor("c-busmute-malformed")
        expect(ack?.status).toBe("rejected")
        expect(String(ack?.reason)).toContain("unknown or malformed")
        t.stop()
    })

    it("B6 bus_on: an engineer can master-mute any bus regardless of bus-ownership (mirrors set_bus_master)", async () => {
        usersMap = { "u-eng": { soundEngineer: true } }
        const { x32, t } = start(() => null) // not bus-owner; engineer via users doc
        await feed([{ type: "set_bus_on", busIndex: 3, value: true, uid: "u-eng", id: "c-busmute-eng" }])
        await runBatch()
        expect((x32 as unknown as { setBusOn: ReturnType<typeof vi.fn> }).setBusOn).toHaveBeenCalledWith(3, true)
        ;(x32 as unknown as EventEmitter).emit("bus_on", 3, true)
        const ack = ackFor("c-busmute-eng")
        expect(ack?.status).toBe("applied")
        expect(ack?.confirmedValue).toBe(true)
        t.stop()
    })
})
