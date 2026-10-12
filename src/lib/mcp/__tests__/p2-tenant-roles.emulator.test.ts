import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * Multi-tenant phase 2, lane 3 — MCP role decisions read the TOKEN tenant's
 * membership (P2-design §3.4), the mixer reads the BRIDGE tenant (crc), roster
 * tools list tenant members with their tenant role, and the MCP-side server
 * writers stamp orgId (§2.2 W1, W2, W3, W8, W9, W12).
 *
 * `@/lib/org/access` is the spec-behaviour fake (lane 2 implements the real
 * module in parallel); it reads memberships/, users/ and platform/owners from
 * the emulator, so these tests exercise real Firestore data.
 *
 * Personas (every users doc carries membershipsMigratedAt, so no legacy
 * fallback applies — the membership is the only source of a role):
 *   KAREN  crc admin only (ruling 5: crc-only admin)
 *   DAVID  crc admin + brotherslazaroff admin
 *   DUAL   crc band_leader + brotherslazaroff admin
 *   BLBL   brotherslazaroff band_leader only
 *   MUS    crc musician
 *   SE     crc musician + soundEngineer
 *
 * Runs only via the emulator config.
 */
vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi.fn(async () => ({ status: "missing", reason: "test: not in Storage or Drive" })),
}))

import { createSetlist, addTrackToSetlist } from "../tools/setlist-write"
import { commitStagedChanges, proposeSetlistChanges, type StageRecord } from "../tools/propose-changes"
import { flagBond, recordBondCorrection } from "../tools/bond-corrections"
import { listReviewQueue } from "../tools/library-review"
import { listMusicians, findUser } from "../tools/roster"
import { listMonitorBuses } from "../tools/monitor"
import { loadMonitorUser } from "../server-monitor"
import { verifySetlistCharts } from "../tools/library-verify"
import { beginChunkedChartUpload } from "../tools/library-upload-session"

const CRC = "crc"
const BL = "brotherslazaroff"
const KAREN = "p2-karen"
const DAVID = "p2-david"
const DUAL = "p2-dual"
const BLBL = "p2-blbl"
const MUS = "p2-mus"
const SE = "p2-se"

type Role = "admin" | "band_leader" | "musician" | "member"
const PEOPLE: Array<{ uid: string; name: string; m: Partial<Record<string, Role>>; se?: boolean }> = [
    { uid: KAREN, name: "Karen", m: { [CRC]: "admin" } },
    { uid: DAVID, name: "David", m: { [CRC]: "admin", [BL]: "admin" } },
    { uid: DUAL, name: "Dual Person", m: { [CRC]: "band_leader", [BL]: "admin" } },
    { uid: BLBL, name: "BL Leader", m: { [BL]: "band_leader" } },
    { uid: MUS, name: "CRC Musician", m: { [CRC]: "musician" } },
    { uid: SE, name: "Sound Person", m: { [CRC]: "musician" }, se: true },
]

describe("multi-tenant P2 lane 3 — MCP tenant roles + writer orgId (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)

    async function wipe(cols: string[]) {
        for (const col of cols) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    }

    async function setlistIn(org: string, name = "P2 setlist"): Promise<string> {
        const ref = db().collection("setlists").doc()
        await ref.set({ name, orgId: org, ownerId: DAVID, version: 1, trackCount: 0, date: "2026-10-16" })
        return ref.id
    }

    async function trackIn(setlistId: string, org: string | null, title = "Oseh Shalom"): Promise<string> {
        const ref = db().collection("tracks").doc()
        await ref.set({
            setlistId,
            title,
            type: "song",
            order: 0,
            ...(org ? { orgId: org } : {}),
        })
        return ref.id
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p2-lane3" })
        await wipe(["users", "memberships", "platform"])
        for (const p of PEOPLE) {
            // The users doc's legacy role deliberately says "admin" for
            // everyone: a correct implementation must ignore it (migrated).
            await db().collection("users").doc(p.uid).set({
                displayName: p.name,
                email: `${p.uid}@example.test`,
                role: "admin",
                membershipsMigratedAt: new Date(),
                musicianProfile: { instrument: "guitar" },
            })
            for (const [tenant, role] of Object.entries(p.m)) {
                await db().collection("memberships").doc(`${tenant}__${p.uid}`).set({
                    uid: p.uid,
                    tenantId: tenant,
                    role,
                    soundEngineer: p.se === true,
                    addedBy: "test",
                    addedAt: new Date(),
                })
            }
        }
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        await wipe([
            "setlists",
            "tracks",
            "proposal_stages",
            "bond_flags",
            "bond_corrections",
            "library_index",
            "songs",
            "titleContextHints",
            "upload_sessions",
            "mcp_write_receipts",
        ])
    })

    // ─── Token-tenant role decisions ────────────────────────────────────────

    it("a crc-only admin with a BL token is refused BL write tools", async () => {
        const blSetlist = await setlistIn(BL)
        const created = await createSetlist(KAREN, { name: "Karen in BL" }, BL)
        expect(created).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
        const added = await addTrackToSetlist(KAREN, { setlistId: blSetlist, title: "X", type: "song" }, BL)
        expect(added).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })

        // Same person, crc token: allowed (parity for crc admins).
        const ok = await createSetlist(KAREN, { name: "Karen in CRC" }, CRC)
        expect(ok).toHaveProperty("setlistId")
        expect(ok).not.toHaveProperty("error")
    })

    it("a dual member (crc band_leader + BL admin) gets admin-only tools only with a BL token", async () => {
        const crc = await listReviewQueue(DUAL, {}, CRC)
        expect(crc).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
        expect((crc as { error: { context?: { callerRole?: string } } }).error).toBeTruthy()

        const bl = await listReviewQueue(DUAL, {}, BL)
        expect(bl).toMatchObject({ ok: true })
    })

    // ─── Mixer: bridge tenant ───────────────────────────────────────────────

    describe("mixer reads the crc (bridge) membership", () => {
        beforeEach(async () => {
            await db().collection("config").doc("monitor").set({
                bridgeUrl: "wss://bridge.example/monitor",
                x32Address: "10.0.0.2",
                x32Port: 10023,
                busAssignments: { "1": [{ userId: MUS, userName: "CRC Musician" }] },
            })
            await db().collection("monitor-live").doc("state").set({ channels: [], buses: [], matrices: [] })
        })

        it("David (crc admin) keeps privileged mixer access whatever token tenant he holds", async () => {
            expect(await loadMonitorUser(db(), DAVID)).toEqual({ role: "admin", soundEngineer: false })
            const r = await listMonitorBuses(DAVID)
            expect(r).toMatchObject({ isPrivileged: true })
        })

        it("a BL-only leader has no mixer (no crc membership, no bus)", async () => {
            expect(await loadMonitorUser(db(), BLBL)).toEqual({ role: undefined, soundEngineer: false })
            const r = await listMonitorBuses(BLBL)
            expect(r).toMatchObject({ ok: false, error: { machine_code: "monitor_access_denied" } })
        })

        it("a dual member is judged by the crc role (band_leader, not BL admin)", async () => {
            const r = await listMonitorBuses(DUAL)
            expect(r).toMatchObject({ ok: false, error: { machine_code: "monitor_access_denied" } })
        })

        it("crc sound engineer flag comes from the crc membership", async () => {
            expect(await loadMonitorUser(db(), SE)).toEqual({ role: "musician", soundEngineer: true })
            expect(await listMonitorBuses(SE)).toMatchObject({ isPrivileged: true })
            // Bus owner without SE: access, not privileged.
            expect(await listMonitorBuses(MUS)).toMatchObject({ isPrivileged: false, myAssignedBuses: [1] })
        })
    })

    // ─── Roster: tenant members, tenant roles ───────────────────────────────

    it("roster tools list the token tenant's members with their tenant role", async () => {
        const bl = (await listMusicians(DAVID, { includeProfileless: true }, BL)) as {
            ok: true
            musicians: Array<{ uid: string; role: string }>
        }
        expect(bl.ok).toBe(true)
        const blRoles = Object.fromEntries(bl.musicians.map((m) => [m.uid, m.role]))
        expect(blRoles).toEqual({ [DAVID]: "admin", [DUAL]: "admin", [BLBL]: "band_leader" })

        const crc = (await findUser(DAVID, {}, CRC)) as { ok: true; users: Array<{ uid: string; role: string }> }
        const crcRoles = Object.fromEntries(crc.users.map((m) => [m.uid, m.role]))
        expect(crcRoles).toEqual({
            [KAREN]: "admin",
            [DAVID]: "admin",
            [DUAL]: "band_leader",
            [MUS]: "musician",
            [SE]: "musician",
        })
    })

    // ─── W1 + W2: commit_staged_changes with a BL token ─────────────────────

    it("W1/W2: a BL-token commit_staged_changes add stamps BL on the new track and the stage", async () => {
        const setlistId = await setlistIn(BL)
        const stage = (await proposeSetlistChanges(
            DAVID,
            { setlistId, proposals: [{ action: "add", title: "Hinei Mah Tov" }] },
            BL,
        )) as StageRecord
        expect(stage.stageId).toBeTruthy()
        const stageDoc = await db().collection("proposal_stages").doc(stage.stageId).get()
        expect(stageDoc.data()?.orgId).toBe(BL)
        // Result shape unchanged: orgId is not on the returned record.
        expect((stage as unknown as Record<string, unknown>).orgId).toBeUndefined()

        const committed = await commitStagedChanges(DAVID, { stageId: stage.stageId }, BL)
        expect(committed).toMatchObject({ ok: true })
        const tracks = await db().collection("tracks").where("setlistId", "==", setlistId).get()
        expect(tracks.size).toBe(1)
        expect(tracks.docs[0].data().orgId).toBe(BL)
    })

    // ─── W3: flag_bond ──────────────────────────────────────────────────────

    it("W3: a BL-token flag_bond on a CRC track is refused; a flag is stamped with its tenant", async () => {
        const crcSetlist = await setlistIn(CRC)
        const crcTrack = await trackIn(crcSetlist, CRC)
        const refused = await flagBond(DAVID, { setlistId: crcSetlist, trackId: crcTrack, reason: "generic" }, BL)
        expect(refused).toMatchObject({ ok: false, error: { machine_code: "setlist_not_found" } })
        expect((await db().collection("bond_flags").get()).size).toBe(0)

        // Unstamped track on a BL setlist: tenant from the parent setlist.
        const blSetlist = await setlistIn(BL)
        const blTrack = await trackIn(blSetlist, null)
        const ok = await flagBond(DAVID, { setlistId: blSetlist, trackId: blTrack, reason: "generic" }, BL)
        expect(ok).toMatchObject({ ok: true })
        const flag = await db().collection("bond_flags").doc(`${blSetlist}_${blTrack}`).get()
        expect(flag.data()?.orgId).toBe(BL)

        // CRC token on the CRC track: allowed, stamped crc.
        expect(await flagBond(KAREN, { setlistId: crcSetlist, trackId: crcTrack, reason: "x" }, CRC)).toMatchObject({ ok: true })
        expect((await db().collection("bond_flags").doc(`${crcSetlist}_${crcTrack}`).get()).data()?.orgId).toBe(CRC)
    })

    // ─── W9 + W12: record_bond_correction ───────────────────────────────────

    it("W9/W12: record_bond_correction stamps its rows and never creates a library_index stub", async () => {
        const setlistId = await setlistIn(BL)
        const trackId = await trackIn(setlistId, BL)
        await db().collection("library_index").doc("to-row").set({ id: "to-row", name: "To", stem: "to", orgId: BL })
        const r = await recordBondCorrection(
            DAVID,
            { setlistId, trackId, fromSongId: "no-such-row", toSongId: "to-row" },
            BL,
        )
        expect(r).toMatchObject({ ok: true, correctedToAfter: 1 })
        expect((await db().collection("library_index").doc("no-such-row").get()).exists).toBe(false)
        const to = (await db().collection("library_index").doc("to-row").get()).data()
        expect(to?.bondCorrectionHistory?.correctedTo).toBe(1)
        expect(to?.orgId).toBe(BL)
        const corr = await db().collection("bond_corrections").get()
        expect(corr.size).toBe(1)
        expect(corr.docs[0].data().orgId).toBe(BL)

        // Cross-tenant: a crc token cannot record against a BL setlist.
        const refused = await recordBondCorrection(
            KAREN,
            { setlistId, trackId, fromSongId: "a", toSongId: "to-row" },
            CRC,
        )
        expect(refused).toMatchObject({ ok: false, error: { machine_code: "setlist_not_found" } })
    })

    // ─── W8: verify_setlist_charts songs stub ───────────────────────────────

    it("W8: verify_setlist_charts markOrphaned stamps the row's tenant on a songs stub", async () => {
        const setlistId = await setlistIn(BL)
        await db().collection("tracks").doc("vt1").set({ setlistId, title: "Gone", type: "song", order: 0, fileId: "gone-file", orgId: BL })
        await db().collection("library_index").doc("gone-file").set({ id: "gone-file", name: "Gone", orgId: BL })
        const r = await verifySetlistCharts(DAVID, { setlistId, markOrphaned: true }, BL)
        expect(r).toMatchObject({ ok: true })
        const song = (await db().collection("songs").doc("gone-file").get()).data()
        expect(song).toMatchObject({ status: "orphaned", orgId: BL })

        // Another tenant's setlist reads as not found.
        expect(await verifySetlistCharts(KAREN, { setlistId, markOrphaned: true }, CRC)).toMatchObject({
            ok: false,
            error: { machine_code: "setlist_not_found" },
        })
    })

    // ─── W12: upload session ────────────────────────────────────────────────

    it("W12: a chunked upload session carries the token tenant", async () => {
        const r = (await beginChunkedChartUpload(
            DAVID,
            { title: "BL chart", mimeType: "application/pdf", fileName: "bl.pdf" },
            BL,
        )) as { ok: true; uploadSessionId: string }
        expect(r.ok).toBe(true)
        const s = await db().collection("upload_sessions").doc(r.uploadSessionId).get()
        expect(s.data()?.orgId).toBe(BL)

        // A BL-only band leader with a crc token holds no crc role → refused.
        const refused = await beginChunkedChartUpload(
            BLBL,
            { title: "nope", mimeType: "application/pdf", fileName: "n.pdf" },
            CRC,
        )
        expect(refused).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })
})
