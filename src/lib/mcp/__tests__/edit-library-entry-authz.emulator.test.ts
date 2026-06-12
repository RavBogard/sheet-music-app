import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { editEnrichment } from "../tools/library-review"

/**
 * v11.5-01-03 (H9) — band_leader library-edit authz, against the Firebase emulator.
 *
 * Proves the relaxation + tenancy wall on `edit_library_entry` / `edit_enrichment`
 * (both call `editEnrichment(uid, args, org)`):
 *  - AC-1: a band_leader can edit tags (curation-safe subset) on a row IN their org,
 *          in place (bond/row id unchanged).
 *  - AC-2: a band_leader editing a row in ANOTHER org gets row_not_found, no write.
 *  - AC-3: a band_leader cannot edit `collection` (forbidden_field); an admin can.
 *  - AC-4: admin behavior is byte-identical — unscoped (any org), all fields.
 *  - Legacy: a row with no orgId resolves to crc (rowOrg default), so a crc leader
 *            can edit it and a broslaz leader cannot.
 *
 * `org` is passed explicitly to simulate orgFrom(extra) — the connector's resolved
 * tenant that the MCP handler threads in.
 */
describe("edit_library_entry / editEnrichment authz (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const CRC_LEADER = "crc-leader"
    const BL_LEADER = "bl-leader"
    const CRC = "crc"
    const BL = "brotherslazaroff"

    function db() {
        return getFirestore(app)
    }

    /** Rich-error machine code, or undefined if the result wasn't an error envelope. */
    function code(r: unknown): string | undefined {
        const e = r as { ok?: boolean; error?: { machine_code?: string } }
        return e && e.ok === false && e.error ? e.error.machine_code : undefined
    }

    const realWrite = { dryRun: false, force: true } as const

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-edit-authz" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["users", "library_index", "songs"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        // Roles. orgIds are irrelevant to the wall here — the wall uses the `org`
        // arg (the connector org), so we only need accurate roles.
        await db().collection("users").doc(ADMIN).set({ role: "admin", email: "rabbi@crc.test" })
        await db().collection("users").doc(CRC_LEADER).set({ role: "band_leader", email: "crc-leader@crc.test" })
        await db().collection("users").doc(BL_LEADER).set({ role: "band_leader", email: "bl-leader@bl.test" })

        // A CRC row, a BL row, and a legacy row with NO orgId.
        await db().collection("library_index").doc("li-crc").set({
            title: "CRC Chart", name: "CRC Chart.pdf", orgId: CRC,
            collection: "uploads", tags: ["old"], status: "active",
        })
        await db().collection("library_index").doc("li-bl").set({
            title: "BL Chart", name: "BL Chart.pdf", orgId: BL,
            collection: "uploads", tags: ["old"], status: "active",
        })
        await db().collection("library_index").doc("li-legacy").set({
            title: "Legacy Chart", name: "Legacy.pdf",
            collection: "uploads", tags: ["old"], status: "active",
        })
    })

    async function tagsOf(rowId: string): Promise<unknown> {
        return (await db().collection("library_index").doc(rowId).get()).data()?.tags
    }

    it("AC-1: crc band_leader edits tags on an in-org row, in place", async () => {
        const res = await editEnrichment(
            CRC_LEADER,
            { rowId: "li-crc", edits: { tags: ["lyric-chart", "gig"] }, ...realWrite },
            CRC,
        )
        expect((res as { ok?: boolean }).ok).toBe(true)
        expect(await tagsOf("li-crc")).toEqual(["lyric-chart", "gig"])
        // Row id (the bond anchor) is untouched — no delete/re-import.
        expect((await db().collection("library_index").doc("li-crc").get()).exists).toBe(true)
    })

    it("AC-2: crc band_leader editing a BL row gets row_not_found, no write", async () => {
        const res = await editEnrichment(
            CRC_LEADER,
            { rowId: "li-bl", edits: { tags: ["hacked"] }, ...realWrite },
            CRC,
        )
        expect(code(res)).toBe("row_not_found")
        expect(await tagsOf("li-bl")).toEqual(["old"]) // unchanged
    })

    it("AC-3: band_leader cannot edit collection (forbidden_field); admin can", async () => {
        const denied = await editEnrichment(
            CRC_LEADER,
            { rowId: "li-crc", edits: { collection: "core" }, ...realWrite },
            CRC,
        )
        expect(code(denied)).toBe("forbidden_field")
        expect((await db().collection("library_index").doc("li-crc").get()).data()?.collection).toBe("uploads")

        const allowed = await editEnrichment(
            ADMIN,
            { rowId: "li-crc", edits: { collection: "core" }, ...realWrite },
            CRC,
        )
        expect((allowed as { ok?: boolean }).ok).toBe(true)
        expect((await db().collection("library_index").doc("li-crc").get()).data()?.collection).toBe("core")
    })

    it("AC-4: admin is unscoped — edits a BL row from a crc connector context", async () => {
        const res = await editEnrichment(
            ADMIN,
            { rowId: "li-bl", edits: { tags: ["admin-curated"] }, ...realWrite },
            CRC, // admin ignores the org wall
        )
        expect((res as { ok?: boolean }).ok).toBe(true)
        expect(await tagsOf("li-bl")).toEqual(["admin-curated"])
    })

    it("Legacy (no orgId) resolves to crc: crc leader edits, bl leader denied", async () => {
        const crcRes = await editEnrichment(
            CRC_LEADER,
            { rowId: "li-legacy", edits: { tags: ["claimed-crc"] }, ...realWrite },
            CRC,
        )
        expect((crcRes as { ok?: boolean }).ok).toBe(true)
        expect(await tagsOf("li-legacy")).toEqual(["claimed-crc"])

        const blRes = await editEnrichment(
            BL_LEADER,
            { rowId: "li-legacy", edits: { tags: ["claimed-bl"] }, ...realWrite },
            BL,
        )
        expect(code(blRes)).toBe("row_not_found")
        expect(await tagsOf("li-legacy")).toEqual(["claimed-crc"]) // unchanged by BL leader
    })
})
