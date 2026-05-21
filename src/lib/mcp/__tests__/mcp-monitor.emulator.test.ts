import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    listMonitorBuses,
    getMix,
    getMatrix,
    setSendLevel,
    setSendMute,
    setBusFader,
    setMatrixFader,
    setMatrixMute,
} from "../tools/monitor"

/**
 * MCP monitor-control tools against the Firebase emulator.
 *
 * Covers:
 *  - Access enforcement: admin / sound engineer / bus owner / unprivileged.
 *  - Read tools surface matrices only to admin/SE.
 *  - Write tools enqueue X32 wire commands matching the bridge's expected
 *    schema (`type`, `value`, `uid`, `createdAt`) — same envelope iPads write,
 *    so the bridge consumption path needs zero changes.
 *  - set_send_mute flips polarity (`muted: true` → wire `value: false`).
 *  - Bus-master / matrix tools require admin or sound engineer.
 */
describe("MCP monitor-control tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const SOUND_ENG = "alex-soundengineer" // musician + soundEngineer flag
    const GUITAR = "guitar-player-uid" // musician with bus 1 assigned
    const BASS = "bass-player-uid" // musician with bus 2 assigned
    const NO_ACCESS = "guest-musician" // musician, no bus, no SE flag

    function db() {
        return getFirestore(app)
    }

    async function pendingCommands() {
        const snap = await db()
            .collection("monitor-live")
            .doc("commands")
            .collection("pending")
            .get()
        return snap.docs.map((d) => d.data() as unknown as Record<string, unknown>)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-monitor" })

        // Roles: admin = "admin"; everyone else is "musician". soundEngineer
        // is an orthogonal boolean flag (per AUTH-04 / roles.ts).
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
        await db()
            .collection("users")
            .doc(SOUND_ENG)
            .set({
                displayName: "Alex",
                role: "musician",
                soundEngineer: true,
            })
        await db()
            .collection("users")
            .doc(GUITAR)
            .set({ displayName: "Guitar Player", role: "musician" })
        await db()
            .collection("users")
            .doc(BASS)
            .set({ displayName: "Bass Player", role: "musician" })
        await db()
            .collection("users")
            .doc(NO_ACCESS)
            .set({ displayName: "Guest", role: "musician" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        // Reset config/monitor + monitor-live/state + commands queue.
        await db()
            .collection("config")
            .doc("monitor")
            .set({
                bridgeUrl: "wss://bridge.example/monitor",
                x32Address: "10.0.0.2",
                x32Port: 10023,
                monitorBuses: [1, 2, 3],
                busAssignments: {
                    // Array shape — the shape the in-app BusAssignmentPanel
                    // actually writes (BR-04/F2). Seeding the default fixture
                    // this way exercises producer↔consumer drift end-to-end:
                    // the whole monitor suite now runs against the prod shape,
                    // not just the explicit co-ownership test below.
                    "1": [{ userId: GUITAR, userName: "Guitar Player" }],
                    "2": [{ userId: BASS, userName: "Bass Player" }],
                    "3": null,
                },
                bridge: {
                    status: "online",
                    lastSeen: "2026-05-14T22:00:00.000Z",
                    x32Connected: true,
                    clients: 4,
                    localIp: "10.0.0.5",
                    version: "2.1.0",
                },
            })
        await db()
            .collection("monitor-live")
            .doc("state")
            .set({
                channels: [
                    { index: 1, name: "Vocals", color: 0 },
                    { index: 2, name: "Guitar", color: 1 },
                    { index: 3, name: "Bass", color: 2 },
                    { index: 4, name: "Keys", color: 3 },
                ],
                buses: [
                    {
                        index: 1,
                        name: "Guitar IEM",
                        fader: 0.75,
                        sends: [
                            { channelIndex: 1, level: 0.5, on: true },
                            { channelIndex: 2, level: 0.8, on: true },
                            { channelIndex: 3, level: 0.4, on: true },
                            { channelIndex: 4, level: 0.6, on: false },
                        ],
                    },
                    {
                        index: 2,
                        name: "Bass IEM",
                        fader: 0.7,
                        sends: [
                            { channelIndex: 1, level: 0.55, on: true },
                            { channelIndex: 2, level: 0.3, on: true },
                            { channelIndex: 3, level: 0.9, on: true },
                            { channelIndex: 4, level: 0.5, on: true },
                        ],
                    },
                ],
                matrices: [
                    { index: 1, name: "Mains L", fader: 0.8, on: true },
                    { index: 2, name: "Mains R", fader: 0.8, on: true },
                ],
                config: {},
            })
        const pending = await db()
            .collection("monitor-live")
            .doc("commands")
            .collection("pending")
            .get()
        await Promise.all(pending.docs.map((d) => d.ref.delete()))
    })

    // ─── Access enforcement ────────────────────────────────────────────────

    it("denies users with no admin role, no SE flag, and no assigned bus", async () => {
        const r = await listMonitorBuses(NO_ACCESS)
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_access_denied", message: expect.stringContaining("don't have monitor access") },
        })
    })

    it("admin sees buses + matrices + everyone's assignments", async () => {
        const r = (await listMonitorBuses(ADMIN)) as {
            buses: Array<{ index: number; assignedTo: Array<{ uid: string }> }>
            matrices: Array<{ index: number }> | null
            isPrivileged: boolean
            myAssignedBuses: number[]
            bridge: { status: string; clients: number } | null
        }
        expect(r.isPrivileged).toBe(true)
        expect(r.buses.map((b) => b.index).sort()).toEqual([1, 2])
        expect(r.buses.find((b) => b.index === 1)!.assignedTo).toEqual([
            { uid: GUITAR, userName: "Guitar Player" },
        ])
        expect(r.matrices?.map((m) => m.index)).toEqual([1, 2])
        expect(r.myAssignedBuses).toEqual([]) // admin owns no bus directly
        expect(r.bridge?.status).toBe("online")
        expect(r.bridge?.clients).toBe(4)
    })

    it("sound engineer is privileged even without an assigned bus", async () => {
        const r = (await listMonitorBuses(SOUND_ENG)) as {
            isPrivileged: boolean
            matrices: unknown
        }
        expect(r.isPrivileged).toBe(true)
        expect(r.matrices).not.toBeNull()
    })

    it("musician with a bus sees their own assignments but NOT matrices", async () => {
        const r = (await listMonitorBuses(GUITAR)) as {
            isPrivileged: boolean
            matrices: unknown
            myAssignedBuses: number[]
        }
        expect(r.isPrivileged).toBe(false)
        expect(r.matrices).toBeNull()
        expect(r.myAssignedBuses).toEqual([1])
    })

    it("errors clearly when monitor system is not configured", async () => {
        await db().collection("config").doc("monitor").delete()
        const r = await listMonitorBuses(ADMIN)
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_unconfigured", message: expect.stringContaining("not configured") },
        })
    })

    // ─── get_mix ───────────────────────────────────────────────────────────

    it("get_mix defaults to the caller's first assigned bus", async () => {
        const r = (await getMix(GUITAR, {})) as {
            busIndex: number
            sends: Array<{ channelIndex: number; channelName: string; level: number }>
        }
        expect(r.busIndex).toBe(1)
        // Channel names from state get joined into the sends rows so the AI
        // can match "guitar" → channelIndex 2 without a separate call.
        const guitarSend = r.sends.find((s) => s.channelName === "Guitar")
        expect(guitarSend).toBeDefined()
        expect(guitarSend!.channelIndex).toBe(2)
        expect(guitarSend!.level).toBe(0.8)
    })

    it("get_mix on a foreign bus is denied unless privileged", async () => {
        // GUITAR (musician, owns bus 1) trying to read BASS's bus 2
        // F-015: rich envelope shape — ok:false + machine code + hint.
        const denied = await getMix(GUITAR, { busIndex: 2 })
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_bus_forbidden" },
            busIndex: 2,
        })

        // ADMIN can read anyone's bus
        const admin = (await getMix(ADMIN, { busIndex: 2 })) as { busIndex: number }
        expect(admin.busIndex).toBe(2)

        // SE can read anyone's bus
        const se = (await getMix(SOUND_ENG, { busIndex: 1 })) as { busIndex: number }
        expect(se.busIndex).toBe(1)
    })

    it("get_mix with no busIndex and no owned bus errors helpfully", async () => {
        // ADMIN is privileged but owns no bus → can't default.
        // F-015: rich envelope shape.
        // C9I4-007: this is a client-precondition → HTTP-like code 400, not 500.
        const r = await getMix(ADMIN, {})
        expect(r).toMatchObject({
            ok: false,
            error: {
                machine_code: "monitor_no_bus_assigned",
                code: 400,
                message: expect.stringContaining("don't own any bus"),
            },
        })
    })

    // ─── set_send_level ────────────────────────────────────────────────────

    it("set_send_level enqueues an X32-shaped command (uid + createdAt envelope)", async () => {
        const before = Date.now()
        const result = (await setSendLevel(GUITAR, {
            busIndex: 1,
            channelIndex: 2,
            level: 0.9,
        })) as { ok: true; commandId: string }
        expect(result.ok).toBe(true)
        expect(result.commandId).toBeTruthy()

        const cmds = await pendingCommands()
        expect(cmds).toHaveLength(1)
        expect(cmds[0]).toMatchObject({
            type: "set_send_level",
            busIndex: 1,
            channelIndex: 2,
            value: 0.9,
            uid: GUITAR,
        })
        expect(typeof cmds[0].createdAt).toBe("number")
        expect(cmds[0].createdAt as number).toBeGreaterThanOrEqual(before)
    })

    it("set_send_level on a foreign bus is denied for a musician but allowed for SE/admin", async () => {
        // Musician → foreign bus → denied, nothing enqueued.
        // F-015: rich envelope shape — ok:false + machine code.
        expect(
            await setSendLevel(GUITAR, { busIndex: 2, channelIndex: 2, level: 0.5 }),
        ).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_bus_forbidden" },
            busIndex: 2,
        })
        expect(await pendingCommands()).toHaveLength(0)

        // SE → any bus → enqueued
        await setSendLevel(SOUND_ENG, { busIndex: 1, channelIndex: 2, level: 0.5 })
        await setSendLevel(ADMIN, { busIndex: 2, channelIndex: 3, level: 0.6 })
        expect(await pendingCommands()).toHaveLength(2)
    })

    // ─── set_send_mute ─────────────────────────────────────────────────────

    it("set_send_mute flips polarity: muted=true → wire value=false", async () => {
        await setSendMute(GUITAR, { busIndex: 1, channelIndex: 1, muted: true })
        await setSendMute(GUITAR, { busIndex: 1, channelIndex: 1, muted: false })
        const cmds = await pendingCommands()
        expect(cmds).toHaveLength(2)
        // The bridge expects `value: true` to mean "on/unmuted" — our `muted`
        // flag inverts so the tool naming reads naturally.
        const muteCmd = cmds.find((c) => c.value === false)
        const unmuteCmd = cmds.find((c) => c.value === true)
        expect(muteCmd).toBeDefined()
        expect(unmuteCmd).toBeDefined()
        expect(muteCmd!.type).toBe("set_send_on")
        expect(unmuteCmd!.type).toBe("set_send_on")
    })

    // ─── set_bus_fader ─────────────────────────────────────────────────────

    it("set_bus_fader writes set_bus_master with no channelIndex", async () => {
        await setBusFader(GUITAR, { busIndex: 1, level: 0.6 })
        const [cmd] = await pendingCommands()
        expect(cmd).toMatchObject({
            type: "set_bus_master",
            busIndex: 1,
            value: 0.6,
            uid: GUITAR,
        })
        expect("channelIndex" in cmd).toBe(false)
    })

    it("set_bus_fader is denied on a foreign bus for a musician", async () => {
        expect(await setBusFader(GUITAR, { busIndex: 2, level: 0.5 })).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_bus_forbidden" },
            busIndex: 2,
        })
        expect(await pendingCommands()).toHaveLength(0)
    })

    // ─── F-018: invalid index validation against live mixer state ─────────

    it("F-018: set_send_level refuses invalid_bus_index (not active on live mixer)", async () => {
        // ADMIN has privilege to control any bus, but bus 99 isn't seeded
        // in mixer state — pre-fix this returned ok:true and silently dropped
        // the command at the bridge.
        const r = await setSendLevel(ADMIN, {
            busIndex: 99,
            channelIndex: 1,
            level: 0.5,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_bus_index" },
            busIndex: 99,
            validBusIndices: [1, 2],
        })
        expect(await pendingCommands()).toHaveLength(0)
    })

    it("F-018: set_send_level refuses invalid_channel_index", async () => {
        const r = await setSendLevel(ADMIN, {
            busIndex: 1,
            channelIndex: 99,
            level: 0.5,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_channel_index" },
            channelIndex: 99,
            validChannelIndices: [1, 2, 3, 4],
        })
        expect(await pendingCommands()).toHaveLength(0)
    })

    it("F-018: set_matrix_fader refuses invalid_matrix_index", async () => {
        const r = await setMatrixFader(ADMIN, { matrixIndex: 99, level: 0.5 })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_matrix_index" },
            matrixIndex: 99,
            validMatrixIndices: [1, 2],
        })
        expect(await pendingCommands()).toHaveLength(0)
    })

    // ─── get_matrix (admin/SE only) ────────────────────────────────────────

    it("get_matrix returns all matrices for admin/SE; rejects musicians", async () => {
        const adminAll = (await getMatrix(ADMIN, {})) as {
            matrices: Array<{ index: number; name: string; fader: number; on: boolean }>
        }
        expect(adminAll.matrices).toHaveLength(2)
        expect(adminAll.matrices[0]).toMatchObject({
            index: 1,
            name: "Mains L",
            fader: 0.8,
            on: true,
        })

        const seAll = (await getMatrix(SOUND_ENG, {})) as {
            matrices: unknown[]
        }
        expect(seAll.matrices).toHaveLength(2)

        const denied = await getMatrix(GUITAR, {})
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_privilege_required", message: expect.stringContaining("admin or sound engineer") },
        })
    })

    it("get_matrix({matrixIndex}) returns a single matrix; unknown index errors", async () => {
        const one = (await getMatrix(ADMIN, { matrixIndex: 1 })) as {
            matrices: Array<{ index: number }>
        }
        expect(one.matrices).toHaveLength(1)
        expect(one.matrices[0].index).toBe(1)

        const missing = await getMatrix(ADMIN, { matrixIndex: 6 })
        expect(missing).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_matrix_index" },
            matrixIndex: 6,
        })
    })

    // ─── matrix tools (admin/SE only) ──────────────────────────────────────

    it("matrix tools require admin or sound engineer", async () => {
        // Musician with a bus is NOT enough — matrix is FOH territory.
        // F-015: rich envelope shape.
        expect(
            await setMatrixFader(GUITAR, { matrixIndex: 1, level: 0.5 }),
        ).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_privilege_required" },
        })
        expect(
            await setMatrixMute(GUITAR, { matrixIndex: 1, muted: true }),
        ).toMatchObject({
            ok: false,
            error: { machine_code: "monitor_privilege_required" },
        })
        expect(await pendingCommands()).toHaveLength(0)

        // Admin + SE both pass.
        await setMatrixFader(ADMIN, { matrixIndex: 1, level: 0.7 })
        await setMatrixMute(SOUND_ENG, { matrixIndex: 2, muted: true })
        const cmds = await pendingCommands()
        expect(cmds.map((c) => c.type).sort()).toEqual([
            "set_matrix_fader",
            "set_matrix_on",
        ])
        const fader = cmds.find((c) => c.type === "set_matrix_fader")!
        expect(fader).toMatchObject({ matrixIndex: 1, value: 0.7, uid: ADMIN })
        const mute = cmds.find((c) => c.type === "set_matrix_on")!
        // muted=true → wire `value: false` (on=false)
        expect(mute).toMatchObject({ matrixIndex: 2, value: false, uid: SOUND_ENG })
    })

    // ─── Co-owned buses ────────────────────────────────────────────────────

    it("supports multiple users sharing the same bus (array assignment)", async () => {
        await db()
            .collection("config")
            .doc("monitor")
            .update({
                "busAssignments.1": [
                    { userId: GUITAR, userName: "Guitar" },
                    { userId: BASS, userName: "Bass" },
                ],
            })
        // BASS now also owns bus 1 (in addition to bus 2).
        const r = (await listMonitorBuses(BASS)) as { myAssignedBuses: number[] }
        expect(r.myAssignedBuses.sort()).toEqual([1, 2])

        // BASS can now adjust bus 1 too.
        const ok = await setSendLevel(BASS, {
            busIndex: 1,
            channelIndex: 2,
            level: 0.5,
        })
        expect(ok).toMatchObject({ ok: true })
    })

    // ─── monitor-mcp-polish: F-3 / F-5 / F-6 / F-7 / R-2 ────────────────────

    it("F-3: set_send_level invalid channel → error.code 400 (was 500)", async () => {
        // invalid_channel_index isn't in ERROR_CODE_MAP so it defaulted to 500;
        // it's a caller-fixable bad arg → must be 400, symmetric with invalid_bus_index.
        const r = await setSendLevel(ADMIN, {
            busIndex: 1,
            channelIndex: 999,
            level: 0.5,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_channel_index", code: 400 },
        })
        expect(await pendingCommands()).toHaveLength(0)
    })

    it("F-5: invalid_channel_index hint annotates channels with name + active-on-this-bus", async () => {
        // Add a named channel routed to NO send on bus 1 → active:false on this bus.
        await db()
            .collection("monitor-live")
            .doc("state")
            .update({
                channels: [
                    { index: 1, name: "Vocals", color: 0 },
                    { index: 2, name: "Guitar", color: 1 },
                    { index: 3, name: "Bass", color: 2 },
                    { index: 4, name: "Keys", color: 3 },
                    { index: 5, name: "Spare", color: 4 },
                ],
            })
        const r = (await setSendLevel(ADMIN, {
            busIndex: 1,
            channelIndex: 999,
            level: 0.5,
        })) as unknown as {
            validChannelIndices: number[]
            validChannels: Array<{ index: number; name: string; active: boolean }>
        }
        // Flat list stays for back-compat.
        expect(r.validChannelIndices).toEqual([1, 2, 3, 4, 5])
        const byIndex = Object.fromEntries(
            r.validChannels.map((c) => [c.index, c]),
        )
        // Guitar (ch2) is on bus 1's send list, level 0.8 on → active.
        expect(byIndex[2]).toMatchObject({
            index: 2,
            name: "Guitar",
            active: true,
        })
        // Spare (ch5) is named but not routed to bus 1 → inactive on this bus.
        expect(byIndex[5]).toMatchObject({
            index: 5,
            name: "Spare",
            active: false,
        })
    })

    it("F-6: get_mix sends carry BOTH `on` and `muted` (= !on)", async () => {
        const r = (await getMix(GUITAR, {})) as {
            sends: Array<{ channelIndex: number; on: boolean; muted: boolean }>
        }
        for (const s of r.sends) {
            expect(s).toHaveProperty("on")
            expect(s).toHaveProperty("muted")
            expect(s.muted).toBe(!s.on)
        }
        // bus 1 ch4 is seeded on:false → muted:true; `on` preserved for iPad clients.
        const ch4 = r.sends.find((s) => s.channelIndex === 4)!
        expect(ch4.on).toBe(false)
        expect(ch4.muted).toBe(true)
    })

    it("F-6: get_matrix matrices carry BOTH `on` and `muted` (= !on)", async () => {
        const r = (await getMatrix(ADMIN, {})) as {
            matrices: Array<{ index: number; on: boolean; muted: boolean }>
        }
        expect(r.matrices.length).toBeGreaterThan(0)
        for (const m of r.matrices) {
            expect(m).toHaveProperty("on")
            expect(m).toHaveProperty("muted")
            expect(m.muted).toBe(!m.on)
        }
    })

    it("F-7: list_monitor_buses marks configured buses active", async () => {
        const r = (await listMonitorBuses(ADMIN)) as {
            buses: Array<{ index: number; name: string; active: boolean }>
        }
        // Both seeded buses are named with sends on → active.
        expect(r.buses.length).toBe(2)
        for (const b of r.buses) expect(b.active).toBe(true)
    })

    it("F-7: a named-but-pulled-down bus is active; a nameless zeroed bus is not", async () => {
        await db()
            .collection("monitor-live")
            .doc("state")
            .update({
                buses: [
                    // named, fader 0, only send off → still configured (active).
                    {
                        index: 1,
                        name: "Andrea Wedge",
                        fader: 0,
                        sends: [{ channelIndex: 1, level: 0, on: false }],
                    },
                    // no name, fader 0, no sends → never set up (inactive).
                    { index: 2, name: "", fader: 0, sends: [] },
                ],
            })
        const r = (await listMonitorBuses(ADMIN)) as {
            buses: Array<{ index: number; active: boolean }>
        }
        const byIndex = Object.fromEntries(r.buses.map((b) => [b.index, b]))
        expect(byIndex[1].active).toBe(true)
        expect(byIndex[2].active).toBe(false)
    })

    it("R-2: every write tool returns confidence:'queued' (never 'applied')", async () => {
        const sl = (await setSendLevel(GUITAR, {
            busIndex: 1,
            channelIndex: 2,
            level: 0.5,
        })) as { ok: true; confidence: string }
        const sm = (await setSendMute(GUITAR, {
            busIndex: 1,
            channelIndex: 2,
            muted: true,
        })) as { ok: true; confidence: string }
        const bf = (await setBusFader(GUITAR, {
            busIndex: 1,
            level: 0.5,
        })) as { ok: true; confidence: string }
        const mf = (await setMatrixFader(ADMIN, {
            matrixIndex: 1,
            level: 0.5,
        })) as { ok: true; confidence: string }
        const mm = (await setMatrixMute(ADMIN, {
            matrixIndex: 1,
            muted: true,
        })) as { ok: true; confidence: string }
        for (const r of [sl, sm, bf, mf, mm]) {
            expect(r.ok).toBe(true)
            expect(r.confidence).toBe("queued")
        }
    })
})
