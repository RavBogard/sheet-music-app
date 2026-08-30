import { describe, it, expect } from "vitest"
import { COPYABLE_TRACK_FIELDS, patchHasChange } from "../templates"

describe("template copyable fields", () => {
    it("carries the outline structure fields", () => {
        for (const f of ["performer", "description", "estimatedMinutes", "liturgyRef"]) {
            expect(COPYABLE_TRACK_FIELDS).toContain(f)
        }
    })

    it("never carries honors — they are per-service, not per-template", () => {
        expect(COPYABLE_TRACK_FIELDS).not.toContain("honors")
    })

    it("still carries the original song fields", () => {
        for (const f of ["type", "title", "key", "bpm", "leadMusician", "referenceLink", "notes", "songId", "fileId", "fileName"]) {
            expect(COPYABLE_TRACK_FIELDS).toContain(f)
        }
    })
})

describe("patchHasChange — object-valued field comparison", () => {
    it("reports NO change for a no-op patch on a track with an identical liturgyRef", () => {
        const existing = {
            name: "Shir Shabbat",
            tracks: [
                {
                    type: "song",
                    title: "L'cha Dodi",
                    liturgyRef: { book: "siddur", unitId: "lcha-dodi", folio: 12 },
                },
            ],
        }
        const patch = {
            tracks: [
                {
                    type: "song",
                    title: "L'cha Dodi",
                    liturgyRef: { book: "siddur", unitId: "lcha-dodi", folio: 12 },
                },
            ],
        }
        expect(patchHasChange(existing, patch)).toBe(false)
    })

    it("reports a change when liturgyRef genuinely differs (different folio)", () => {
        const existing = {
            name: "Shir Shabbat",
            tracks: [
                {
                    type: "song",
                    title: "L'cha Dodi",
                    liturgyRef: { book: "siddur", unitId: "lcha-dodi", folio: 12 },
                },
            ],
        }
        const patch = {
            tracks: [
                {
                    type: "song",
                    title: "L'cha Dodi",
                    liturgyRef: { book: "siddur", unitId: "lcha-dodi", folio: 13 },
                },
            ],
        }
        expect(patchHasChange(existing, patch)).toBe(true)
    })
})
