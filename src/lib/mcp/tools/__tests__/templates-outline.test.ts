import { describe, it, expect } from "vitest"
import { COPYABLE_TRACK_FIELDS } from "../templates"

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
