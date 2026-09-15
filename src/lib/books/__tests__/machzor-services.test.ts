import { describe, it, expect } from "vitest"
import { lookupBookPage } from "../lookup"
import { validateLiturgyRef, getBook } from "../registry"
import { bookServiceFor, machzorServiceFor, machzorServices } from "../machzor-services"
import { momentIdForUnit } from "../moments"

/**
 * The whole 2008 machzor, service-scoped (R4-c, reversed 2026-09-15).
 *
 * The property under test is the one that kept five of this volume's six
 * services unmapped for four days: a name repeats across services at different
 * pages, and answering with the wrong one is worse than answering with nothing.
 * Bar'chu is the witness — it prints at 9, 45, 100 and 136 — so every case
 * below is really the same question asked from a different service.
 */

const BOOK = "crc-machzor-2008"

describe("the machzor service table", () => {
    it("maps every service a setlist can name", () => {
        expect(machzorServiceFor("kol-nidre")).toBe("crc-kol-nidre")
        expect(machzorServiceFor("kol-nidre-alt")).toBe("crc-kol-nidre")
        expect(machzorServiceFor("yom-kippur-morning")).toBe("crc-yk-morning")
        expect(machzorServiceFor("yizkor")).toBe("crc-yizkor")
        expect(machzorServiceFor("neilah")).toBe("crc-neilah")
        expect(machzorServiceFor("rosh-hashanah-day")).toBe("crc-rh-morning")
        expect(machzorServiceFor("erev-rosh-hashanah")).toBe("crc-erev-rh")
        expect(machzorServiceFor("friday_night")).toBeNull()
        expect(machzorServiceFor(null)).toBeNull()
    })

    it("keeps BOTH Rosh Hashanah morning types on the printed machzor's pages", () => {
        // R4-d sends `rosh-hashanah-morning` to Shirei Tshuvah on the reader's
        // SHELF. It must not follow it here: Ruling 8 says the legacy booklet
        // governs the page until the Shirei volume is released, and a released
        // volume is a second book, never a replacement. A page scope that drifted
        // with the shelf would put a Shirei folio on a row holding the machzor.
        expect(machzorServiceFor("rosh-hashanah-morning")).toBe("crc-rh-morning")
        expect(bookServiceFor(BOOK, "rosh-hashanah-morning")).toBe("crc-rh-morning")
    })

    it("falls back to Rosh Hashanah morning, and only for this book", () => {
        // What the book meant for its whole life before the rest of it was
        // mapped. Changing that answer would have been a regression dressed
        // up as a feature.
        expect(bookServiceFor(BOOK, null)).toBe("crc-rh-morning")
        expect(bookServiceFor(BOOK, "nonsense")).toBe("crc-rh-morning")
        expect(bookServiceFor("crc-friday", "kol-nidre")).toBeNull()
    })

    it("names six services", () => {
        expect(machzorServices()).toEqual([
            "crc-erev-rh",
            "crc-kol-nidre",
            "crc-neilah",
            "crc-rh-morning",
            "crc-yizkor",
            "crc-yk-morning",
        ])
    })
})

describe("the pagemap itself", () => {
    const entries = getBook(BOOK)?.entries ?? []

    it("covers the printed volume from every capture, with nothing typed", () => {
        expect(entries.length).toBe(209)
        for (const e of entries) {
            expect(typeof e.service).toBe("string")
            expect(typeof e.unitId).toBe("string")
            // The unit id names the service it was captured from, so a page
            // cannot be filed under a service it did not come from.
            expect(e.unitId?.endsWith(`@${e.service}`)).toBe(true)
            expect(Number.isInteger(e.page)).toBe(true)
        }
    })

    it("tiles the volume without a service straying into another's pages", () => {
        const span = new Map<string, { lo: number; hi: number }>()
        for (const e of entries) {
            const s = e.service as string
            const at = span.get(s) ?? { lo: e.page, hi: e.page }
            span.set(s, { lo: Math.min(at.lo, e.page), hi: Math.max(at.hi, e.page) })
        }
        expect(span.get("crc-erev-rh")).toEqual({ lo: 1, hi: 37 })
        expect(span.get("crc-rh-morning")).toEqual({ lo: 38, hi: 92 })
        expect(span.get("crc-kol-nidre")).toEqual({ lo: 93, hi: 127 })
        expect(span.get("crc-yk-morning")).toEqual({ lo: 128, hi: 178 })
        expect(span.get("crc-yizkor")).toEqual({ lo: 179, hi: 185 })
        expect(span.get("crc-neilah")).toEqual({ lo: 187, hi: 215 })
    })

    it("keeps the aliases Daniel verified in September", () => {
        // 55 Rosh Hashanah morning entries were checked against the printed
        // book by hand. A regeneration that silently replaced them with the
        // feed's machine-cased names ("Reading 1", "Service") would look fine
        // in a diff of pages and quietly stop matching what he types.
        const shofar = entries.find((e) => e.page === 80 && e.service === "crc-rh-morning")
        expect(shofar?.name).toBe("Shofar Service")
        expect(shofar?.aliases).toContain("Seder Kriyat HaShofar")
        const psukei = entries.find((e) => e.page === 43)
        expect(psukei?.aliases).toContain("Psalm 150")
        expect(psukei?.aliases).toContain("Kol HaN'shamah")
    })
})

describe("lookupBookPage, scoped", () => {
    it("gives each service its own Bar'chu", () => {
        const page = (service: string) => {
            const r = lookupBookPage(BOOK, "Bar'chu", { service })
            return r.ok ? r.matches.map((m) => [m.folio, m.confidence]) : r
        }
        expect(page("crc-rh-morning")).toEqual([[45, "high"]])
        expect(page("crc-kol-nidre")).toEqual([[100, "high"]])
        expect(page("crc-yk-morning")).toEqual([[136, "high"]])
        expect(page("crc-erev-rh")).toEqual([[9, "high"]])
    })

    it("takes the service from a setlist's templateType", () => {
        const r = lookupBookPage(BOOK, "Bar'chu", { templateType: "kol-nidre-alt" })
        expect(r.ok && r.matches[0].folio).toBe(100)
    })

    it("carries the unit id and the moment through", () => {
        const r = lookupBookPage(BOOK, "Bar'chu", { service: "crc-kol-nidre" })
        expect(r.ok && r.matches[0].unitId).toBe("emaariv.barchu@crc-kol-nidre")
        expect(r.ok && r.matches[0].momentId).toBe("barchu")
        expect(r.ok && r.matches[0].service).toBe("crc-kol-nidre")
    })

    it("still answers Rosh Hashanah morning when nobody said which service", () => {
        const r = lookupBookPage(BOOK, "Bar'chu")
        expect(r.ok && r.matches).toEqual([
            expect.objectContaining({ folio: 45, confidence: "high" }),
        ])
    })
})

describe("validateLiturgyRef, scoped", () => {
    it("holds a row to its own service's pages", () => {
        expect(validateLiturgyRef({ book: BOOK, folio: 100 }, { service: "crc-kol-nidre" }).ok).toBe(true)
        const wrong = validateLiturgyRef({ book: BOOK, folio: 45 }, { service: "crc-kol-nidre" })
        expect(wrong.ok).toBe(false)
        expect(wrong.ok === false && wrong.machineCode).toBe("folio_out_of_range")
        // The message names the range that WILL be accepted, so a caller is
        // never coached toward resubmitting the same wrong page.
        expect(wrong.ok === false && wrong.message).toContain("93–127")
    })

    it("accepts the whole volume when no service is named", () => {
        expect(validateLiturgyRef({ book: BOOK, folio: 45 }).ok).toBe(true)
        expect(validateLiturgyRef({ book: BOOK, folio: 215 }).ok).toBe(true)
        // Page 1 is a real page of this book. Rejecting it was only ever an
        // artifact of five services being unmapped.
        expect(validateLiturgyRef({ book: BOOK, folio: 1 }).ok).toBe(true)
        expect(validateLiturgyRef({ book: BOOK, folio: 216 }).ok).toBe(false)
    })

    it("accepts a pagemap unit id, and refuses another service's", () => {
        expect(
            validateLiturgyRef(
                { book: BOOK, unitId: "emaariv.barchu@crc-kol-nidre", folio: 100 },
                { service: "crc-kol-nidre" },
            ).ok,
        ).toBe(true)
        const crossed = validateLiturgyRef(
            { book: BOOK, unitId: "shma.barchu@crc-rh-morning", folio: 100 },
            { service: "crc-kol-nidre" },
        )
        expect(crossed.ok).toBe(false)
        expect(crossed.ok === false && crossed.machineCode).toBe("unknown_unit_id")
    })
})

describe("moments reach the machzor", () => {
    it("knows the moment behind a machzor unit", () => {
        expect(momentIdForUnit("emaariv.barchu@crc-kol-nidre")).toBe("barchu")
        expect(momentIdForUnit("shma.barchu@crc-yk-morning")).toBe("barchu")
    })
})
