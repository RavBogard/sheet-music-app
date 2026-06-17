import { describe, it, expect, vi } from "vitest"
import type { SetlistTrack } from "@/types/models"

// PDFOverlay.tsx runs `dynamic(...)` at module top-level for its viewers; a
// minimal stub keeps the import side-effect-free for this pure-logic test.
// The exported helpers reference no store/React, so nothing else is needed.
vi.mock("next/dynamic", () => ({ __esModule: true, default: () => () => null }))

import { performQueueMembers, resolveQueueStart } from "../PDFOverlay"

const track = (id: string, fileId: string | undefined, type?: SetlistTrack["type"]): SetlistTrack => ({
    id,
    title: id,
    ...(fileId !== undefined ? { fileId } : {}),
    ...(type ? { type } : {}),
})

describe("performQueueMembers (WS-01)", () => {
    it("includes bonded non-song rows (prayer/reading with a fileId), excludes fileId-less rows", () => {
        const tracks: SetlistTrack[] = [
            track("song-1", "f1"),                 // 0 song
            track("Shema", "f2", "prayer"),        // 1 bonded prayer  ← must be queued
            track("Reading", "f3", "reading"),     // 2 bonded reading ← must be queued
            track("section", undefined, "header"), // 3 no chart → excluded
            track("song-2", "f4", "song"),         // 4 song
        ]
        const members = performQueueMembers(tracks)
        expect(members.map(m => m.setlistIndex)).toEqual([0, 1, 2, 4])
    })

    it("opening a bonded prayer row resolves to ITS queue position, not 0 (no bounce to song 1)", () => {
        const tracks: SetlistTrack[] = [
            track("song-1", "f1"),
            track("Shema", "f2", "prayer"), // setlist index 1
        ]
        const members = performQueueMembers(tracks)
        // currentIndex=1 (the prayer); queueIndex irrelevant because it's found
        expect(resolveQueueStart(members, 1, 0)).toBe(1)
    })
})

describe("resolveQueueStart (WS-09 follower-yank guard)", () => {
    it("preserves the current queueIndex (clamped) when the current row is absent from the rebuilt queue", () => {
        const members = performQueueMembers([
            track("a", "f1"),
            track("b", "f2"),
            track("c", "f3"),
            track("d", "f4"),
        ])
        // currentIndex points at a row no longer in the queue (director edit);
        // follower was reading queue index 2 → stays at 2, NOT snapped to 0.
        expect(resolveQueueStart(members, 99, 2)).toBe(2)
    })

    it("clamps a now-out-of-range queueIndex to the last valid position (never < 0)", () => {
        const members = performQueueMembers([track("a", "f1"), track("b", "f2")])
        expect(resolveQueueStart(members, 99, 7)).toBe(1) // clamp to length-1
        expect(resolveQueueStart(members, 99, -3)).toBe(0) // never negative
    })

    it("returns 0 for an empty queue without throwing", () => {
        expect(resolveQueueStart([], 0, 5)).toBe(0)
    })
})

describe("regression: all-song setlist (common path unchanged)", () => {
    it("queues every song and resolves currentIndex to its position", () => {
        const tracks: SetlistTrack[] = [
            track("s0", "f1", "song"),
            track("s1", "f2", "song"),
            track("s2", "f3", "song"),
        ]
        const members = performQueueMembers(tracks)
        expect(members.map(m => m.setlistIndex)).toEqual([0, 1, 2])
        expect(resolveQueueStart(members, 2, 0)).toBe(2)
        expect(resolveQueueStart(members, 0, 0)).toBe(0)
    })
})
