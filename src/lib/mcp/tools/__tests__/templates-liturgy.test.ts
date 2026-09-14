import { describe, it, expect } from "vitest"
import { resolveSlotLiturgyRef } from "@/lib/books/slot-liturgy"
import { getBook } from "@/lib/books/registry"
import { COPYABLE_TRACK_FIELDS } from "../copyable-track-fields"
import {
    buildSetlistFromTemplate,
    type TemplateContext,
    type TemplateSlot,
} from "@/lib/liturgical-templates"
import type { DriveFile } from "@/types/models"

/**
 * A-W1 — fixed-liturgy rows carry a page PER BOOK.
 *
 * The same "Bar'chu" row prints at a different page in every book the
 * congregation uses, so a template slot holds `liturgyRefs` keyed by book slug
 * and the clone resolves the one for the setlist's own book. The failure this
 * guards is the quiet one: a page number from the Friday siddur printed on the
 * lectern sheet under the Saturday book. The registry's folio-floor check is
 * what catches it, so every resolution goes through `validateLiturgyRef`.
 *
 * `crc-friday` runs 3–47 and `crc-saturday` 50–102 (disjoint ranges — that is
 * the whole point of `bookFolioFloor`), which is why the fixtures below use
 * real slugs and real pages rather than invented ones.
 */
describe("resolveSlotLiturgyRef", () => {
    const refs = {
        "crc-friday": { folio: 10 },
        "crc-saturday": { folio: 59 },
    }

    it("resolves a slot's ref for each book it carries", () => {
        const friday = resolveSlotLiturgyRef(refs, "crc-friday")
        expect(friday).toEqual({
            status: "resolved",
            ref: { book: "crc-friday", folio: 10 },
        })

        const saturday = resolveSlotLiturgyRef(refs, "crc-saturday")
        expect(saturday).toEqual({
            status: "resolved",
            ref: { book: "crc-saturday", folio: 59 },
        })
    })

    it("reports unresolved — never a borrowed page — when the book is absent", () => {
        expect(resolveSlotLiturgyRef(refs, "shabbat-maariv")).toEqual({
            status: "unresolved",
        })
        expect(resolveSlotLiturgyRef(refs, undefined)).toEqual({
            status: "unresolved",
        })
        expect(resolveSlotLiturgyRef(undefined, "crc-friday")).toEqual({
            status: "unresolved",
        })
    })

    it("refuses a folio outside the book, with the registry's own message", () => {
        // 10 is a real page in crc-friday and outside crc-saturday's 50–102.
        const res = resolveSlotLiturgyRef({ "crc-saturday": { folio: 10 } }, "crc-saturday")
        expect(res.status).toBe("invalid")
        if (res.status !== "invalid") return
        expect(res.machineCode).toBe("folio_out_of_range")
        expect(res.message).toContain("crc-saturday")
        expect(res.message).toContain("50")
    })

    it("refuses an unknown book slug and an unknown unit id", () => {
        const unknownBook = resolveSlotLiturgyRef({ nope: { folio: 1 } }, "nope")
        expect(unknownBook.status).toBe("invalid")
        if (unknownBook.status === "invalid") {
            expect(unknownBook.machineCode).toBe("unknown_book")
        }

        const badUnit = resolveSlotLiturgyRef(
            { "shabbat-maariv": { unitId: "not.a.real@unit", folio: 10 } },
            "shabbat-maariv",
        )
        expect(badUnit.status).toBe("invalid")
        if (badUnit.status === "invalid") {
            expect(badUnit.machineCode).toBe("unknown_unit_id")
        }
    })

    it("carries a feed book's unitId through onto the resolved ref", () => {
        const res = resolveSlotLiturgyRef(
            { "shabbat-maariv": { unitId: FEED_UNIT.id, folio: FEED_UNIT.folio } },
            "shabbat-maariv",
        )
        expect(res).toEqual({
            status: "resolved",
            ref: { book: "shabbat-maariv", unitId: FEED_UNIT.id, folio: FEED_UNIT.folio },
        })
    })
})

/** A real unit from the shipped shabbat-maariv feed, via the registry itself. */
const FEED_UNIT = (() => {
    const book = getBook("shabbat-maariv")
    const u = book?.units?.find((x) => x.folios.length > 0)
    if (!u) throw new Error("shabbat-maariv feed carries no unit with a folio")
    return { id: u.id, folio: u.folios[0] }
})()

describe("fixed rows travel on a copy", () => {
    it("`fixed` is in the one shared copyable-field list", () => {
        // The list every copy surface reads. A fixed row that loses its flag on
        // "clone last week's service" would un-collapse on the band's iPads.
        expect(COPYABLE_TRACK_FIELDS).toContain("fixed")
    })

    it("`liturgyRefs` is NOT copyable — it resolves into liturgyRef, never rides a track", () => {
        expect(COPYABLE_TRACK_FIELDS).not.toContain("liturgyRefs")
    })
})

describe("buildSetlistFromTemplate (browser wizard path)", () => {
    const library: DriveFile[] = []
    const context: TemplateContext = {
        type: "friday_night",
        date: new Date(2026, 8, 18),
        hebrewDate: { day: 26, month: "Elul", year: "5786", display: "26 Elul 5786" },
        parasha: "Nitzavim",
        holiday: null,
        isShabbat: true,
    }

    const slots: TemplateSlot[] = [
        {
            label: "Bar'chu",
            type: "prayer",
            fixed: true,
            queries: [],
            liturgyRefs: { "crc-friday": { folio: 10 }, "crc-saturday": { folio: 59 } },
        },
        { label: "Announcements", type: "note", queries: [] },
    ]

    it("resolves each fixed row against the book it is built for", () => {
        const friday = buildSetlistFromTemplate(slots, library, context, "crc-friday")
        expect(friday[0].fixed).toBe(true)
        expect(friday[0].liturgyRef).toEqual({ book: "crc-friday", folio: 10 })

        const saturday = buildSetlistFromTemplate(slots, library, context, "crc-saturday")
        expect(saturday[0].liturgyRef).toEqual({ book: "crc-saturday", folio: 59 })
    })

    it("leaves a fixed row page-less when no book is given, rather than guessing", () => {
        const tracks = buildSetlistFromTemplate(slots, library, context)
        expect(tracks[0].fixed).toBe(true)
        expect(tracks[0].liturgyRef).toBeUndefined()
    })

    it("leaves ordinary rows untouched", () => {
        const tracks = buildSetlistFromTemplate(slots, library, context, "crc-friday")
        expect(tracks[1].fixed).toBeUndefined()
        expect(tracks[1].liturgyRef).toBeUndefined()
    })
})
