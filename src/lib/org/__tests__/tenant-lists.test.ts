import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(), getFirestore: vi.fn() }))
vi.mock("@/lib/firebase-storage", () => ({ downloadFromStoragePath: vi.fn() }))

import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { OrgConfigSchema } from "@/lib/org/config-schema"
import { bookSlugsFor, rabbiSlotsFor, serviceTypeKeysFor, serviceTypeLabel } from "@/lib/org/tenant-lists"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"
import { getAllTemplateKeys, TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { listBooks } from "@/lib/books/registry"
import { listBooksTool } from "@/lib/mcp/tools/books"
import { parseTemplateRequest } from "@/lib/template-parser"
import { systemInstructionFor } from "@/lib/library/ai-enrichment"
import {
    KNOWN_COLLECTIONS,
    isKnownCollection,
} from "@/lib/library/collections"
import {
    collectionLabel,
    coreSectionLabel,
    defaultPickerCollection,
    librarySections,
} from "@/lib/songs/picker-scope"

/**
 * Multi-tenant phase 1 (lane 3): a third tenant's config drives the library
 * sections, the Gemini prompt, the rabbi slots, the service types and the
 * books — and crc / brotherslazaroff carry today's values in config.
 */
afterEach(() => clearPrimedOrgConfigs())

describe("code configs carry today's liturgy lists", () => {
    for (const id of ["crc", "brotherslazaroff"]) {
        it(`${id}: whole template catalogue, every book, CRC rabbi slots, no default book`, () => {
            const l = codeOrgConfig(id)!.liturgy
            expect(l.serviceTypes.map((s) => s.key)).toEqual(getAllTemplateKeys())
            for (const s of l.serviceTypes) expect(s.label).toBe(TEMPLATE_LABELS[s.key].label)
            expect(l.books).toEqual(listBooks().map((b) => b.slug))
            expect(l.rabbiSlots.map((r) => r.key)).toEqual(["daniel_karen", "randy"])
            expect(l.defaultBookByService).toEqual({})
        })
    }

    it("an older config without rabbiSlots still parses (defaults to [])", () => {
        const crc = codeOrgConfig("crc")!
        const { rabbiSlots: _drop, ...liturgy } = crc.liturgy
        const parsed = OrgConfigSchema.parse({ ...crc, liturgy })
        expect(parsed.liturgy.rabbiSlots).toEqual([])
    })
})

describe("one collection list", () => {
    it("KNOWN_COLLECTIONS and isKnownCollection", () => {
        expect([...KNOWN_COLLECTIONS]).toEqual(["core", "supplemental", "uploads", "nava"])
        expect(KNOWN_COLLECTIONS.every(isKnownCollection)).toBe(true)
        expect(isKnownCollection("crc")).toBe(false)
        expect(isKnownCollection(undefined)).toBe(false)
    })
})

describe("a third tenant's library sections come from its config", () => {
    it("labels, order, default and the never-tenant-aware core label", () => {
        primeTestOrg({
            library: {
                collections: [
                    { id: "uploads", label: "Inbox" },
                    { id: "core", label: "Our Charts" },
                    { id: "made-up", label: "Phase 5" },
                ],
                defaultCollection: "uploads",
            },
        })
        expect(librarySections("testshul")).toEqual([
            { id: "uploads", label: "Inbox" },
            { id: "core", label: "Our Charts" },
        ])
        expect(collectionLabel("testshul", "core")).toBe("Our Charts")
        expect(collectionLabel("testshul", "uploads")).toBe("Inbox")
        // Not listed: the pre-phase-1 label.
        expect(collectionLabel("testshul", "supplemental")).toBe("Shireinu")
        expect(defaultPickerCollection("testshul")).toBe("uploads")
        expect(coreSectionLabel("testshul")).toBe("Our Charts")
    })

    it("an empty defaultCollection opens on everything", () => {
        primeTestOrg({ library: { collections: [{ id: "core", label: "Ours" }], defaultCollection: "" } })
        expect(defaultPickerCollection("testshul")).toBeNull()
    })

    it("crc and BL core-section labels stay CRC Charts", () => {
        expect(coreSectionLabel("crc")).toBe("CRC Charts")
        expect(coreSectionLabel("brotherslazaroff")).toBe("CRC Charts")
        expect(librarySections("brotherslazaroff")).toEqual([
            { id: "core", label: "Charts" },
            { id: "uploads", label: "Uploads" },
        ])
    })
})

describe("a third tenant's Gemini prompt is its own", () => {
    it("names the tenant, not CRC", () => {
        primeTestOrg()
        const p = systemInstructionFor("testshul")
        expect(p.startsWith("You are an enrichment assistant for the Test Shul Tehila music library.")).toBe(true)
        expect(p).toContain("\n\nLibrary naming conventions (Test Shul Tehila music library):")
        expect(p).not.toMatch(/CRC|Central Reform|David/)
    })
})

describe("a third tenant's rabbi slots", () => {
    const withSlots = () =>
        primeTestOrg({
            liturgy: {
                ...codeOrgConfig("crc")!.liturgy,
                rabbiSlots: [{ key: "rav_cohen", label: "Rav Cohen", match: ["Cohen"] }],
            },
        })

    it("parseTemplateRequest picks the tenant's slot keys", () => {
        withSlots()
        expect(rabbiSlotsFor("testshul").map((r) => r.key)).toEqual(["rav_cohen"])
        expect(parseTemplateRequest("cohen friday", "testshul")).toMatchObject({ templateKey: "friday_night", rabbi: "rav_cohen" })
        expect(parseTemplateRequest("Cohen shabbat morning", "testshul")).toMatchObject({ templateKey: "shabbat_morning", rabbi: "rav_cohen" })
        // CRC's names mean nothing here.
        expect(parseTemplateRequest("daniel friday", "testshul")).toBeNull()
    })

    it("a tenant listing none gets CRC's keys (as every tenant did)", () => {
        primeTestOrg({ liturgy: { ...codeOrgConfig("crc")!.liturgy, rabbiSlots: [] } })
        expect(rabbiSlotsFor("testshul").map((r) => r.key)).toEqual(["daniel_karen", "randy"])
        expect(parseTemplateRequest("randy friday", "testshul")).toMatchObject({ rabbi: "randy" })
    })
})

describe("a third tenant's service types and books", () => {
    it("service types: its keys in its order, its labels", () => {
        primeTestOrg({
            liturgy: {
                ...codeOrgConfig("crc")!.liturgy,
                serviceTypes: [
                    { key: "shabbat_morning", label: "Shacharit", defaultStart: "" },
                    { key: "friday_night", label: "Kabbalat Shabbat", defaultStart: "" },
                ],
            },
        })
        expect(serviceTypeKeysFor("testshul")).toEqual(["shabbat_morning", "friday_night"])
        expect(serviceTypeLabel("testshul", "shabbat_morning")).toBe("Shacharit")
        expect(serviceTypeLabel("testshul", "sukkot")).toBe("Sukkot")
        expect(serviceTypeLabel("testshul", "unknown_key")).toBe("unknown_key")
    })

    it("service types: none listed → the built-in catalogue", () => {
        primeTestOrg({ liturgy: { ...codeOrgConfig("crc")!.liturgy, serviceTypes: [] } })
        expect(serviceTypeKeysFor("testshul")).toEqual(getAllTemplateKeys())
    })

    it("books: only its books, in registry order; none listed → every book", () => {
        primeTestOrg({ liturgy: { ...codeOrgConfig("crc")!.liturgy, books: ["shirei-tshuvah", "crc-friday"] } })
        expect(listBooksTool("testshul").books.map((b) => b.slug)).toEqual(["crc-friday", "shirei-tshuvah"])
        primeTestOrg({ liturgy: { ...codeOrgConfig("crc")!.liturgy, books: [] } })
        expect(bookSlugsFor("testshul")).toBeNull()
        expect(listBooksTool("testshul").books.map((b) => b.slug)).toEqual(listBooks().map((b) => b.slug))
    })
})
