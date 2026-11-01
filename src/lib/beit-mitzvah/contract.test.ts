// @vitest-environment node
import { describe, expect, it } from "vitest"
import { bridgeRequest, sharedRow, type BridgeResponse } from "./contract"

/**
 * TF-17: the Beit Mitzvah portal seam has a failing guard. The runtime schema
 * in contract.ts owns the contract (CONTRACT.md); these golden request and
 * response bodies are what the portal sends and expects at version 1. A change
 * to contract.ts that rejects a golden request, accepts something the contract
 * forbids, or reshapes a projection row fails here.
 */

const CEREMONY = "8f14e45f-ceea-4e6b-9c5e-2f0f5b1d7a11"

const GOLDEN_REQUESTS = {
    ensure: {
        version: 1,
        orgId: "crc",
        ceremonyId: CEREMONY,
        operation: "ensure",
        localDate: "2026-11-07",
        ceremonyType: "morning",
        idempotencyKey: "job-1",
        scheduleRevision: 2,
    },
    projection: { version: 1, orgId: "crc", ceremonyId: CEREMONY, operation: "projection" },
    resource: {
        version: 1,
        orgId: "crc",
        ceremonyId: CEREMONY,
        operation: "resource",
        rowId: "row_1",
        resourceId: "res_1",
    },
    // BET-6: the setlist card's details. Names and reference NAMES only.
    details: {
        version: 1,
        orgId: "crc",
        ceremonyId: CEREMONY,
        operation: "details",
        sentAt: "2026-10-31T12:00:00.000Z",
        students: ["Avery Example"],
        slot: "Saturday morning",
        torahRef: "Genesis 1:1–2:3",
        haftarahRef: "Isaiah 42:5–43:10",
        rehearsals: ["2026-11-03"],
    },
}

const GOLDEN_RESPONSE: BridgeResponse = {
    version: 1,
    status: "linked",
    setlistId: "sl-1",
    sourceRevision: "a".repeat(64),
    projection: {
        setlistId: "sl-1",
        sourceRevision: "a".repeat(64),
        localDate: "2026-11-07",
        ceremonyType: "morning",
        rows: [
            {
                rowId: "row_1",
                order: 0,
                title: "Barechu",
                liturgyRef: { book: "crc-saturday", folio: 12, unitId: "barechu" },
                arrangement: { songId: "song-1", fileId: "file_1", key: "Dm" },
                resources: [{ resourceId: "res_1", kind: "score", label: "Score" }],
            },
        ],
        operatorLinks: { music: "https://www.centralreform.live/setlists/sl-1", review: "https://www.centralreform.live/integrations/beit-mitzvah" },
    },
}

describe("Beit Mitzvah contract v1 golden pair", () => {
    it("accepts each golden request", () => {
        for (const body of Object.values(GOLDEN_REQUESTS)) {
            expect(bridgeRequest.safeParse(body).success).toBe(true)
        }
    })

    it("rejects what the contract forbids", () => {
        const bad = [
            { ...GOLDEN_REQUESTS.ensure, orgId: "brotherslazaroff" },
            { ...GOLDEN_REQUESTS.ensure, version: 2 },
            { ...GOLDEN_REQUESTS.ensure, extra: "field" },
            { ...GOLDEN_REQUESTS.ensure, localDate: "2026-02-30" },
            { ...GOLDEN_REQUESTS.ensure, ceremonyType: "evening" },
            { ...GOLDEN_REQUESTS.resource, url: "https://evil.example/x" },
            { ...GOLDEN_REQUESTS.projection, ceremonyId: "student-42" },
            { ...GOLDEN_REQUESTS.ensure, operation: "delete" },
            // BET-6: a reference is a name, never verse text.
            { ...GOLDEN_REQUESTS.details, torahRef: "בראשית" },
            { ...GOLDEN_REQUESTS.details, haftarahRef: "Thus says God the LORD, who created the heavens and stretched them out, who spread forth the earth and what comes from it, who gives breath" },
            { ...GOLDEN_REQUESTS.details, torahRef: "In the beginning God created the heaven and the earth" },
            { ...GOLDEN_REQUESTS.details, torahRef: "Genesis 1:1 In the beginning God created" },
            { ...GOLDEN_REQUESTS.details, students: ["12345"] },
            { ...GOLDEN_REQUESTS.details, slot: "In the beginning 1:1" },
            { ...GOLDEN_REQUESTS.details, sentAt: undefined },
            { ...GOLDEN_REQUESTS.details, students: [] },
            { ...GOLDEN_REQUESTS.details, rehearsals: ["soon"] },
        ]
        for (const body of bad) expect(bridgeRequest.safeParse(body).success, JSON.stringify(body)).toBe(false)
    })

    it("a reference is a citation: these pass", () => {
        for (const ref of ["Genesis 1:1–2:3", "1 Samuel 20:18-42", "Isaiah 42:5–43:10", "Song of Songs 2:8"]) {
            expect(bridgeRequest.safeParse({ ...GOLDEN_REQUESTS.details, torahRef: ref }).success, ref).toBe(true)
        }
        expect(bridgeRequest.safeParse({ ...GOLDEN_REQUESTS.details, students: ["Avery O’Neil-Cohen", "Sam & Jo"] }).success).toBe(true)
    })

    it("every projection row in the golden response satisfies the row schema", () => {
        for (const row of GOLDEN_RESPONSE.projection!.rows) expect(sharedRow.safeParse(row).success).toBe(true)
    })

    it("the row schema refuses private fields and text", () => {
        const row = GOLDEN_RESPONSE.projection!.rows[0]
        for (const extra of [{ notes: "private" }, { honors: [] }, { referenceLink: "https://x.test" }, { lyrics: "text" }]) {
            expect(sharedRow.safeParse({ ...row, ...extra }).success).toBe(false)
        }
    })

    it("the golden response has the version-1 envelope the portal reads", () => {
        expect(GOLDEN_RESPONSE.version).toBe(1)
        expect(["linked", "ambiguous", "review_required"]).toContain(GOLDEN_RESPONSE.status)
        expect(Object.keys(GOLDEN_RESPONSE.projection!).sort()).toEqual(
            ["ceremonyType", "localDate", "operatorLinks", "rows", "setlistId", "sourceRevision"],
        )
    })
})
