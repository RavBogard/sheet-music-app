import { describe, it, expect } from "vitest"
import { COPYABLE_TRACK_FIELDS, patchHasChange } from "../templates"
import { COPYABLE_TRACK_FIELDS as SHARED_COPYABLE_TRACK_FIELDS } from "../copyable-track-fields"

describe("template copyable fields", () => {
    // templates.ts used to declare this list itself and clone-setlist.ts
    // declared a twin, with a comment claiming they matched. They drifted and a
    // clone dropped every liturgyRef. Identity, not equality: this fails if
    // templates.ts ever goes back to owning its own array.
    it("IS the shared constant, not a copy of it", () => {
        expect(COPYABLE_TRACK_FIELDS).toBe(SHARED_COPYABLE_TRACK_FIELDS)
    })

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

describe("patchHasChange — the pages a template carries", () => {
    it("sees a patch that changes ONLY the printed pages", () => {
        // `liturgyRefs` is template-only and so absent from
        // COPYABLE_TRACK_FIELDS, which is what the whole-list loop walks. A
        // pages-only patch therefore read as "no change" and was skipped
        // without a write — the write that puts a page on the rabbi's sheet.
        const existing = { tracks: [{ title: "Bar'chu", type: "prayer" }] }
        const patch = {
            tracks: [
                {
                    title: "Bar'chu",
                    type: "prayer",
                    liturgyRefs: { "crc-friday": { folio: 10 } },
                },
            ],
        }
        expect(patchHasChange(existing, patch)).toBe(true)
    })

    it("still sees no change when the pages are identical", () => {
        const row = {
            title: "Bar'chu",
            type: "prayer",
            liturgyRefs: { "crc-friday": { folio: 10 } },
        }
        expect(patchHasChange({ tracks: [row] }, { tracks: [{ ...row }] })).toBe(false)
    })

    it("sees a page that moved", () => {
        const before = {
            tracks: [
                { title: "Bar'chu", type: "prayer", liturgyRefs: { "crc-friday": { folio: 10 } } },
            ],
        }
        const after = {
            tracks: [
                { title: "Bar'chu", type: "prayer", liturgyRefs: { "crc-friday": { folio: 11 } } },
            ],
        }
        expect(patchHasChange(before, after)).toBe(true)
    })
})
