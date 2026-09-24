import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { proposeLiturgyBindings } from "../tools/liturgy-bindings"

/**
 * A-W3' — `propose_liturgy_bindings` against a real Firestore.
 *
 * The matcher itself is covered in `src/lib/liturgy/__tests__`. What this file
 * pins is the TOOL's promises, which are all promises about restraint:
 *
 *   - the row count never changes — bind, don't add;
 *   - a header is never bound;
 *   - an author-typed page is never overwritten;
 *   - a plausible match is never written unless Daniel named it;
 *   - a dry run writes nothing, and a dry run is the default.
 */
describe("MCP propose_liturgy_bindings (emulator)", () => {
    let app: App
    const ADMIN = "admin-daniel"
    const MUSICIAN = "musician-randy"
    const SETLIST = "sl-friday-1"

    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-liturgy-bindings" })
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    /**
     * A Friday-night setlist shaped like a real one: sung rows, a header, a
     * note, one row Daniel already paged by hand, and one title that means
     * two different pages.
     */
    const ROWS = [
        { id: "t0", order: 0, type: "header", title: "Kabbalat Shabbat" },
        { id: "t1", order: 1, type: "note", title: "Welcome & Announcements" },
        { id: "t2", order: 2, type: "song", title: "L'cha Dodi" },
        { id: "t3", order: 3, type: "song", title: "Bar'chu" },
        { id: "t4", order: 4, type: "song", title: "Hashkiveinu" },
        // Genuinely ambiguous: crc-friday prints Shalom Aleichem (p.6),
        // Shalom Rav (p.30) and a Prayer for Shalom (p.35).
        { id: "t5", order: 5, type: "song", title: "Shalom" },
        { id: "t6", order: 6, type: "song", title: "Gather Us In" },
        {
            id: "t7",
            order: 7,
            type: "prayer",
            title: "Aleinu",
            liturgyRef: { book: "crc-friday", folio: 7 },
        },
        // The booklet's OWN alias for the moment Daniel calls
        // "Mi Shebeirach — Healing". An alias is a spelling, not a guess.
        { id: "t8", order: 8, type: "prayer", title: "Mi Shebeirach" },
    ]

    async function seed() {
        await db().collection("setlists").doc(SETLIST).set({
            id: SETLIST,
            orgId: "crc",
            name: "Erev Shabbat — test",
            templateType: "friday_night",
            book: "crc-friday",
        })
        for (const r of ROWS) {
            await db()
                .collection("tracks")
                .doc(r.id)
                .set({ ...r, setlistId: SETLIST, orgId: "crc" })
        }
    }

    async function refs() {
        const out: Record<string, unknown> = {}
        for (const r of ROWS) {
            const snap = await db().collection("tracks").doc(r.id).get()
            out[r.id] = snap.data()?.liturgyRef ?? null
        }
        return out
    }

    beforeEach(async () => {
        for (const r of ROWS) await db().collection("tracks").doc(r.id).delete()
        await db().collection("setlists").doc(SETLIST).delete()
        await seed()
    })

    it("binds the rows it is sure of and leaves the rest alone", async () => {
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
        })
        expect("ok" in res && res.ok).toBe(true)
        if (!("bound" in res)) return

        const bound = Object.fromEntries(res.bound.map((b) => [b.rowId, b.folio]))
        expect(bound).toEqual({ t2: 8, t3: 10, t4: 20, t8: 34 })
        // Identity is reported even on a legacy booklet, where it cannot be
        // written — see `writableRef`.
        for (const b of res.bound) expect(b.unitId).toMatch(/@shabbat-maariv$/)

        // "Shalom" is three different pages. Shown to Daniel, never chosen.
        expect(res.plausible.map((p) => p.rowId)).toEqual(["t5"])
        expect(res.plausible[0].alternatives.map((a) => a.folio).sort((a, b) => (a ?? 0) - (b ?? 0)))
            .toEqual([6, 30, 35])

        // A song with no liturgical name at all.
        expect(res.unmatched.map((u) => u.rowId)).toEqual(["t6"])
    })

    it("never binds a header, and says why", async () => {
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
        })
        if (!("skipped" in res)) throw new Error("expected a proposal")
        const header = res.skipped.find((s) => s.rowId === "t0")
        expect(header?.reason).toMatch(/header/)
        expect(res.bound.some((b) => b.rowId === "t0")).toBe(false)
        expect(res.plausible.some((p) => p.rowId === "t0")).toBe(false)
    })

    it("never overwrites a page the author typed", async () => {
        // t7 is Aleinu, which the table puts at p.38 — and Daniel wrote 7.
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
            dryRun: false,
        })
        if (!("skipped" in res)) throw new Error("expected a proposal")
        expect(res.skipped.find((s) => s.rowId === "t7")?.reason).toMatch(/never overwritten/)
        expect((await refs()).t7).toEqual({ book: "crc-friday", folio: 7 })
    })

    it("is a dry run by default and writes nothing", async () => {
        const before = await refs()
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
        })
        expect("dryRun" in res && res.dryRun).toBe(true)
        expect("written" in res).toBe(false)
        expect(await refs()).toEqual(before)
    })

    it("a real run writes the bound rows and NOT the plausible one", async () => {
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
            dryRun: false,
        })
        expect("written" in res && res.written).toBe(4)
        const after = await refs()
        // The matcher's unit id belongs to shabbat-maariv, which a pagemap
        // book cannot hold; the write carries the legacy-evening unit that
        // prints on the same booklet page instead (audit item 5).
        expect(after.t3).toEqual({
            book: "crc-friday",
            unitId: "shma.barchu@legacy-shabbat-evening",
            folio: 10,
        })
        expect(after.t5).toBeNull()
        expect(after.t6).toBeNull()
        expect(after.t0).toBeNull()
    })

    it("writes a plausible row only when Daniel named it", async () => {
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
            dryRun: false,
            accept: [{ rowId: "t5", unitId: "amidah.shalom-rav@shabbat-maariv" }],
        })
        expect("written" in res && res.written).toBe(5)
        expect((await refs()).t5).toEqual({
            book: "crc-friday",
            unitId: "amidah.shalom-rav@legacy-shabbat-evening",
            folio: 30,
        })
    })

    it("ignores an accept that names something that row never offered", async () => {
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
            dryRun: false,
            accept: [{ rowId: "t5", unitId: "concluding.aleinu@shabbat-maariv" }],
        })
        expect("written" in res && res.written).toBe(4)
        expect((await refs()).t5).toBeNull()
    })

    it("never changes how many rows there are", async () => {
        const before = (
            await db().collection("tracks").where("setlistId", "==", SETLIST).get()
        ).size
        await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-friday",
            dryRun: false,
        })
        const after = (
            await db().collection("tracks").where("setlistId", "==", SETLIST).get()
        ).size
        expect(after).toBe(before)
        expect(after).toBe(ROWS.length)
    })

    describe("identify — a paged row gains its unit id, never a new page", () => {
        const EXTRA = [
            // Paged by hand on the right page, before the legacy feed existed.
            {
                id: "t9",
                order: 9,
                type: "song",
                title: "Bar'chu",
                liturgyRef: { book: "crc-friday", folio: 10 },
            },
            // Right page, but no legacy-evening unit prints Kiddush's moment
            // there: stays page-only.
            {
                id: "t10",
                order: 10,
                type: "prayer",
                title: "Kiddush",
                liturgyRef: { book: "crc-friday", folio: 46 },
            },
            // Marked stale by a book switch — never touched.
            {
                id: "t11",
                order: 11,
                type: "song",
                title: "Bar'chu",
                liturgyRef: { book: "crc-friday", folio: 10, stale: true },
            },
        ]

        beforeEach(async () => {
            for (const r of EXTRA) {
                await db()
                    .collection("tracks")
                    .doc(r.id)
                    .set({ ...r, setlistId: SETLIST, orgId: "crc" })
            }
        })

        afterAll(async () => {
            for (const r of EXTRA) await db().collection("tracks").doc(r.id).delete()
        })

        it("proposes only the row whose clear match is on its own page", async () => {
            const res = await proposeLiturgyBindings(ADMIN, {
                setlistId: SETLIST,
                book: "crc-friday",
            })
            if (!("identified" in res)) throw new Error("expected a proposal")
            expect(res.identified).toEqual([
                {
                    rowId: "t9",
                    title: "Bar'chu",
                    unitId: "shma.barchu@legacy-shabbat-evening",
                    folio: 10,
                    label: expect.any(String),
                },
            ])
            // Aleinu p.7 — the table says 38 — is still skipped, not moved.
            expect(res.skipped.map((s) => s.rowId)).toEqual(
                expect.arrayContaining(["t7", "t10", "t11"]),
            )
        })

        it("a real run adds the id and moment and leaves the page alone", async () => {
            await proposeLiturgyBindings(ADMIN, {
                setlistId: SETLIST,
                book: "crc-friday",
                dryRun: false,
            })
            const t9 = (await db().collection("tracks").doc("t9").get()).data()
            expect(t9?.liturgyRef).toEqual({
                book: "crc-friday",
                unitId: "shma.barchu@legacy-shabbat-evening",
                folio: 10,
            })
            expect(t9?.momentId).toBe("barchu")
            expect(t9?.order).toBe(9)
            const t10 = (await db().collection("tracks").doc("t10").get()).data()
            expect(t10?.liturgyRef).toEqual({ book: "crc-friday", folio: 46 })
            const t11 = (await db().collection("tracks").doc("t11").get()).data()
            expect(t11?.liturgyRef).toEqual({ book: "crc-friday", folio: 10, stale: true })
            expect((await refs()).t7).toEqual({ book: "crc-friday", folio: 7 })
        })
    })

    it("refuses a book with no lookup table rather than guessing", async () => {
        // `shirei-tshuvah` is a released feed volume with no confirmed-rows
        // file and no pagemap — nothing to bind against. This used to name
        // `crc-machzor-2008`, which now has a table per service (R4-c).
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "shirei-tshuvah",
        })
        expect("error" in res && res.error?.machine_code).toBe("no_lookup_for_book")
    })

    it("binds a machzor setlist inside its own service", async () => {
        // The fixture setlist carries no machzor `templateType`, so the book
        // falls back to Rosh Hashanah morning — the answer it gave before the
        // other five services were mapped. What matters is that it resolves at
        // all, and within one service.
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: SETLIST,
            book: "crc-machzor-2008",
        })
        expect("error" in res).toBe(false)
    })

    it("refuses both ids, or neither", async () => {
        for (const args of [
            { book: "crc-friday" },
            { setlistId: SETLIST, templateId: "t", book: "crc-friday" },
        ]) {
            const res = await proposeLiturgyBindings(ADMIN, args)
            expect("error" in res && res.error?.machine_code).toBe("invalid_argument")
        }
    })

    it("is closed to a musician", async () => {
        const res = await proposeLiturgyBindings(MUSICIAN, {
            setlistId: SETLIST,
            book: "crc-friday",
        })
        expect("ok" in res && res.ok).toBe(false)
    })

    it("does not reach across tenants", async () => {
        await db().collection("setlists").doc("bl-1").set({
            id: "bl-1",
            orgId: "brotherslazaroff",
            name: "BL gig",
        })
        const res = await proposeLiturgyBindings(ADMIN, {
            setlistId: "bl-1",
            book: "crc-friday",
        })
        expect("error" in res && res.error?.machine_code).toBe("setlist_not_found")
    })
})
