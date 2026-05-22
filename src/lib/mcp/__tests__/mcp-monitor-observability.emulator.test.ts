import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    getCommandStatus,
    assignMonitorBus,
    unassignMonitorBus,
} from "../tools/monitor-observability"

/**
 * P2-B observability + bus-assignment MCP tools against the Firebase emulator.
 *
 * Covers:
 *  - get_command_status (MCP-D3): monitor-access gating, invalid_argument,
 *    pending when no ack doc, and applied/rejected/timeout/unknown shapes read
 *    from the reserved `monitor-live/commands/acks/{commandId}` doc.
 *  - assign_monitor_bus / unassign_monitor_bus (MCP-D4): trusted-leader gating
 *    (admin/band_leader ALLOW, musician DENY), bus-range + uid validation,
 *    dryRun-preview vs. commit, array-form write, idempotency, co-ownership,
 *    and the not-in-monitorBuses soft warning.
 */
describe("MCP monitor observability + assignment tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-band-leader"
    const MUSICIAN = "guitar-player-uid" // owns bus 1
    const TARGET = "target-musician-uid" // assignable user

    function db() {
        return getFirestore(app)
    }

    async function ackDoc(commandId: string, data: Record<string, unknown>) {
        await db()
            .collection("monitor-live")
            .doc("commands")
            .collection("acks")
            .doc(commandId)
            .set(data)
    }

    async function readConfig() {
        const snap = await db().collection("config").doc("monitor").get()
        return snap.data() as Record<string, unknown>
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-monitor-obs" })

        await db().collection("users").doc(ADMIN).set({
            displayName: "Rabbi Daniel",
            role: "admin",
        })
        await db().collection("users").doc(BAND_LEADER).set({
            displayName: "David Lazaroff",
            role: "band_leader",
        })
        await db().collection("users").doc(MUSICIAN).set({
            displayName: "Guitar Player",
            role: "musician",
        })
        await db().collection("users").doc(TARGET).set({
            displayName: "Target Musician",
            role: "musician",
        })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        await db()
            .collection("config")
            .doc("monitor")
            .set({
                bridgeUrl: "wss://bridge.example/monitor",
                x32Address: "10.0.0.2",
                x32Port: 10023,
                monitorBuses: [1, 2, 3, 4, 5],
                busAssignments: {
                    "1": [{ userId: MUSICIAN, userName: "Guitar Player" }],
                },
            })
        // Clear any ack docs from a prior test.
        const acks = await db()
            .collection("monitor-live")
            .doc("commands")
            .collection("acks")
            .get()
        await Promise.all(acks.docs.map((d) => d.ref.delete()))
    })

    // ─── get_command_status (MCP-D3) ─────────────────────────────────────

    it("denies a user with no monitor access", async () => {
        // BAND_LEADER has no assigned bus + isn't admin/SE → no monitor access.
        const r = await getCommandStatus(BAND_LEADER, { commandId: "cmd-1" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_access_denied" },
        })
    })

    it("rejects an empty commandId with invalid_argument", async () => {
        const r = await getCommandStatus(ADMIN, { commandId: "" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument", code: 400 },
        })
    })

    it("returns a clean pending result when no ack doc exists (never throws)", async () => {
        const r = (await getCommandStatus(ADMIN, { commandId: "never-acked" })) as {
            ok: true
            commandId: string
            status: string
            found: boolean
            confirmedValue: unknown
        }
        expect(r.ok).toBe(true)
        expect(r.commandId).toBe("never-acked")
        expect(r.status).toBe("pending")
        expect(r.found).toBe(false)
        expect(r.confirmedValue).toBeNull()
    })

    it("reads an APPLIED ack with confirmedValue + at", async () => {
        const at = Timestamp.fromMillis(Date.UTC(2026, 4, 22, 1, 30, 0))
        await ackDoc("cmd-applied", {
            commandId: "cmd-applied",
            status: "applied",
            confirmedValue: 0.66,
            at,
        })
        const r = (await getCommandStatus(MUSICIAN, {
            commandId: "cmd-applied",
        })) as { status: string; confirmedValue: number; at: string; found: boolean }
        expect(r.status).toBe("applied")
        expect(r.confirmedValue).toBe(0.66)
        expect(r.found).toBe(true)
        expect(r.at).toBe(at.toDate().toISOString())
    })

    it("reads a REJECTED ack with a reason and a TIMEOUT ack", async () => {
        await ackDoc("cmd-rej", { status: "rejected", reason: "bus not owned" })
        await ackDoc("cmd-to", { status: "timeout" })
        const rej = (await getCommandStatus(ADMIN, { commandId: "cmd-rej" })) as {
            status: string
            reason: string
        }
        expect(rej.status).toBe("rejected")
        expect(rej.reason).toBe("bus not owned")
        const to = (await getCommandStatus(ADMIN, { commandId: "cmd-to" })) as {
            status: string
        }
        expect(to.status).toBe("timeout")
    })

    it("maps an unrecognized stored status to unknown (found stays true)", async () => {
        await ackDoc("cmd-weird", { status: "in_progress" })
        const r = (await getCommandStatus(ADMIN, { commandId: "cmd-weird" })) as {
            status: string
            found: boolean
        }
        expect(r.status).toBe("unknown")
        expect(r.found).toBe(true)
    })

    // ─── assign_monitor_bus (MCP-D4) — gating + validation ───────────────

    it("musician is DENIED (trusted-leader only)", async () => {
        const r = await assignMonitorBus(MUSICIAN, {
            busIndex: 2,
            uid: TARGET,
            dryRun: true,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role", code: 403 },
        })
    })

    it("admin AND band_leader are both allowed (dryRun)", async () => {
        const a = (await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: TARGET,
            dryRun: true,
        })) as { ok: true; committed: boolean }
        expect(a.ok).toBe(true)
        const b = (await assignMonitorBus(BAND_LEADER, {
            busIndex: 2,
            uid: TARGET,
            dryRun: true,
        })) as { ok: true; committed: boolean }
        expect(b.ok).toBe(true)
    })

    it("rejects an out-of-range busIndex (0, 6, non-int)", async () => {
        for (const busIndex of [0, 6, 2.5]) {
            const r = await assignMonitorBus(ADMIN, { busIndex, uid: TARGET })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "invalid_bus_index", code: 400 },
            })
        }
    })

    it("rejects an empty uid with invalid_argument", async () => {
        const r = await assignMonitorBus(ADMIN, { busIndex: 2, uid: "" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("rejects a non-existent uid with user_not_found", async () => {
        const r = await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: "ghost-user",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "user_not_found", code: 404 },
        })
        // No write happened.
        const cfg = await readConfig()
        expect((cfg.busAssignments as Record<string, unknown>)["2"]).toBeUndefined()
    })

    // ─── assign_monitor_bus (MCP-D4) — dryRun vs commit ──────────────────

    it("dryRun returns the plan WITHOUT writing", async () => {
        const r = (await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: TARGET,
            dryRun: true,
        })) as {
            ok: true
            committed: boolean
            dryRun: boolean
            assignedTo: Array<{ userId: string; userName: string }>
            userName: string
        }
        expect(r.dryRun).toBe(true)
        expect(r.committed).toBe(false)
        expect(r.userName).toBe("Target Musician")
        expect(r.assignedTo).toEqual([
            { userId: TARGET, userName: "Target Musician" },
        ])
        const cfg = await readConfig()
        expect((cfg.busAssignments as Record<string, unknown>)["2"]).toBeUndefined()
    })

    it("commits by default (dryRun omitted) and writes the array form", async () => {
        const r = (await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: TARGET,
        })) as { ok: true; committed: boolean; changed: boolean }
        expect(r.committed).toBe(true)
        expect(r.changed).toBe(true)
        const cfg = await readConfig()
        expect((cfg.busAssignments as Record<string, unknown>)["2"]).toEqual([
            { userId: TARGET, userName: "Target Musician" },
        ])
    })

    it("is idempotent — re-assigning the same user is a no-op", async () => {
        await assignMonitorBus(ADMIN, { busIndex: 2, uid: TARGET })
        const again = (await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: TARGET,
        })) as { ok: true; alreadyAssigned: boolean; changed: boolean }
        expect(again.alreadyAssigned).toBe(true)
        expect(again.changed).toBe(false)
    })

    it("supports co-ownership — second user appends to the same bus", async () => {
        // bus 1 already has MUSICIAN; add TARGET.
        const r = (await assignMonitorBus(ADMIN, {
            busIndex: 1,
            uid: TARGET,
        })) as { ok: true; assignedTo: Array<{ userId: string }> }
        expect(r.assignedTo.map((a) => a.userId).sort()).toEqual(
            [MUSICIAN, TARGET].sort(),
        )
        const cfg = await readConfig()
        const bus1 = (cfg.busAssignments as Record<string, Array<{ userId: string }>>)[
            "1"
        ]
        expect(bus1.map((a) => a.userId).sort()).toEqual([MUSICIAN, TARGET].sort())
    })

    it("warns when the bus is valid (1-5) but not in config.monitorBuses", async () => {
        await db()
            .collection("config")
            .doc("monitor")
            .update({ monitorBuses: [1, 2, 3] })
        const r = (await assignMonitorBus(ADMIN, {
            busIndex: 5,
            uid: TARGET,
            dryRun: true,
        })) as { ok: true; configuredBus: boolean; warning?: string }
        expect(r.configuredBus).toBe(false)
        expect(r.warning).toMatch(/not in config\.monitorBuses/i)
    })

    it("refreshes a changed display name on re-assign (changed:true)", async () => {
        await assignMonitorBus(ADMIN, { busIndex: 2, uid: TARGET })
        await db()
            .collection("users")
            .doc(TARGET)
            .update({ displayName: "Renamed Musician" })
        const r = (await assignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: TARGET,
        })) as { ok: true; alreadyAssigned: boolean; changed: boolean; userName: string }
        expect(r.alreadyAssigned).toBe(true)
        expect(r.changed).toBe(true)
        expect(r.userName).toBe("Renamed Musician")
        const cfg = await readConfig()
        expect(
            (cfg.busAssignments as Record<string, Array<{ userName: string }>>)["2"][0]
                .userName,
        ).toBe("Renamed Musician")
    })

    // ─── unassign_monitor_bus (MCP-D4) ───────────────────────────────────

    it("musician is DENIED on unassign", async () => {
        const r = await unassignMonitorBus(MUSICIAN, {
            busIndex: 1,
            uid: MUSICIAN,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
        })
    })

    it("dryRun previews the removal without writing", async () => {
        const r = (await unassignMonitorBus(ADMIN, {
            busIndex: 1,
            uid: MUSICIAN,
            dryRun: true,
        })) as { ok: true; previouslyAssigned: boolean; committed: boolean }
        expect(r.previouslyAssigned).toBe(true)
        expect(r.committed).toBe(false)
        const cfg = await readConfig()
        expect(
            (cfg.busAssignments as Record<string, unknown[]>)["1"],
        ).toHaveLength(1)
    })

    it("clears the bus slot to null when the last user is removed", async () => {
        const r = (await unassignMonitorBus(ADMIN, {
            busIndex: 1,
            uid: MUSICIAN,
        })) as { ok: true; committed: boolean; changed: boolean }
        expect(r.committed).toBe(true)
        expect(r.changed).toBe(true)
        const cfg = await readConfig()
        expect((cfg.busAssignments as Record<string, unknown>)["1"]).toBeNull()
    })

    it("is a safe no-op when the user isn't assigned (no existence check)", async () => {
        const r = (await unassignMonitorBus(ADMIN, {
            busIndex: 2,
            uid: "ghost-user",
        })) as { ok: true; previouslyAssigned: boolean; changed: boolean }
        expect(r.previouslyAssigned).toBe(false)
        expect(r.changed).toBe(false)
    })

    it("rejects an out-of-range busIndex on unassign", async () => {
        const r = await unassignMonitorBus(ADMIN, { busIndex: 9, uid: MUSICIAN })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_bus_index" },
        })
    })
})
