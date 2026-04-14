/**
 * v4.3 D02 — regression tests for the /api/setlist/flush write boundary.
 *
 * Any unknown field on a track or musician must be rejected by zod so
 * clients cannot inject arbitrary fields into Firestore.
 */
import { describe, it, expect } from "vitest"
import { flushTrackSchema, flushMusicianSchema } from "@/lib/flush-schema"

describe("flushMusicianSchema (D02)", () => {
    it("accepts a full valid musician", () => {
        expect(() => flushMusicianSchema.parse({
            uid: "u1",
            name: "Alice",
            email: "alice@example.com",
            instrument: "piano",
        })).not.toThrow()
    })

    it("accepts a minimal musician (name only)", () => {
        expect(() => flushMusicianSchema.parse({ name: "Bob" })).not.toThrow()
    })

    it("rejects unknown keys (role, _backdoor)", () => {
        expect(() => flushMusicianSchema.parse({ name: "X", role: "admin" })).toThrow()
        expect(() => flushMusicianSchema.parse({ name: "X", _backdoor: true })).toThrow()
    })

    it("rejects missing name", () => {
        expect(() => flushMusicianSchema.parse({ uid: "u1" })).toThrow()
    })

    it("accepts null instrument (editor sometimes emits null)", () => {
        expect(() => flushMusicianSchema.parse({ name: "X", instrument: null })).not.toThrow()
    })
})

describe("flushTrackSchema (D02)", () => {
    it("accepts a full-populated song track", () => {
        expect(() => flushTrackSchema.parse({
            id: "t1",
            title: "Adon Olam",
            fileId: "f1",
            fileName: "adon.pdf",
            key: "G",
            type: "song",
            bpm: 96,
            transposition: 2,
            notes: "intro only",
        })).not.toThrow()
    })

    it("accepts a non-song (header, prayer, reading, transition, note)", () => {
        for (const type of ['header', 'prayer', 'reading', 'transition', 'note'] as const) {
            expect(() => flushTrackSchema.parse({ id: "t", title: "X", type })).not.toThrow()
        }
    })

    it("rejects unknown keys (role, isAdmin, etc.)", () => {
        expect(() => flushTrackSchema.parse({
            id: "t1",
            title: "X",
            role: "admin",
        })).toThrow()
        expect(() => flushTrackSchema.parse({
            id: "t1",
            title: "X",
            _injected: true,
        })).toThrow()
    })

    it("accepts nullable optional fields", () => {
        expect(() => flushTrackSchema.parse({
            id: "t",
            title: "X",
            fileId: null,
            key: null,
            bpm: null,
            transposition: null,
        })).not.toThrow()
    })

    it("rejects missing required fields (id, title)", () => {
        expect(() => flushTrackSchema.parse({ title: "X" })).toThrow()
        expect(() => flushTrackSchema.parse({ id: "t" })).toThrow()
    })

    it("rejects invalid track type enum", () => {
        expect(() => flushTrackSchema.parse({
            id: "t",
            title: "X",
            type: "chart",
        })).toThrow()
    })
})
