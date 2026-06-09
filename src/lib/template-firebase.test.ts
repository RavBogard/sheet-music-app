import { describe, expect, it } from "vitest"
import { keyFor, selectOrgOverrides } from "./template-firebase"
import type { TemplateSlot } from "./liturgical-templates"

/**
 * v11-05-01 — unit coverage for the client `templates` (liturgical override)
 * tenant namespacing. The emulator suite covers the admin `setlistTemplates`
 * collection; this covers the web-SDK doc-id isolation primitive (AC-4).
 */
const SLOTS: TemplateSlot[] = [{ label: "Opening", type: "song", queries: [] }]

describe("template-firebase keyFor (doc-id namespacing)", () => {
    it("CRC keeps the BARE liturgical key (zero migration)", () => {
        expect(keyFor("crc", "shabbat_morning")).toBe("shabbat_morning")
    })

    it("a non-CRC org namespaces the key under '${org}__'", () => {
        expect(keyFor("brotherslazaroff", "shabbat_morning")).toBe(
            "brotherslazaroff__shabbat_morning",
        )
    })

    it("two orgs never collide on the same liturgical key", () => {
        expect(keyFor("crc", "friday_night")).not.toBe(
            keyFor("brotherslazaroff", "friday_night"),
        )
    })
})

describe("template-firebase selectOrgOverrides (snapshot filter)", () => {
    const docs = [
        { id: "shabbat_morning", slots: SLOTS }, // CRC (bare)
        { id: "friday_night", slots: SLOTS }, // CRC (bare)
        { id: "brotherslazaroff__shabbat_morning", slots: SLOTS }, // BL
        { id: "brotherslazaroff__rock_set", slots: SLOTS }, // BL
        { id: "empty_doc", slots: null }, // skipped
    ]

    it("CRC sees only bare-key docs (never another tenant's namespaced doc)", () => {
        const out = selectOrgOverrides("crc", docs)
        expect(Object.keys(out).sort()).toEqual(["friday_night", "shabbat_morning"])
        expect(out).not.toHaveProperty("brotherslazaroff__shabbat_morning")
    })

    it("a BL session sees ONLY its own docs, stripped to the bare key", () => {
        const out = selectOrgOverrides("brotherslazaroff", docs)
        expect(Object.keys(out).sort()).toEqual(["rock_set", "shabbat_morning"])
        // The CRC "shabbat_morning" override is NOT surfaced to BL.
        // (Both keys exist, but BL's value comes from its own namespaced doc.)
        expect(out.shabbat_morning).toBe(SLOTS)
    })

    it("docs without slots are skipped", () => {
        const out = selectOrgOverrides("crc", docs)
        expect(out).not.toHaveProperty("empty_doc")
    })
})
