// @vitest-environment jsdom
//
// v11.6-02-05 (WS-14) — PDF fit mode is session state: it defaults to 'width'
// and is NOT persisted to localStorage (unlike chartZoom, which IS a per-chart
// preference). PDF-only.
//
// WAVE1 Bug 3 (2026-08-31) — REVERSED ASSERTION, deliberately.
//
// This file previously asserted "resets to 'width' on next/prev/jump
// navigation" and "resets to 'width' when a new queue starts". Those cases
// passed, and they were wrong: they encoded the defect rather than a
// requirement. Live on prod, enabling fit-page and tapping "Next song" reverted
// the toggle (the aria-label went back to "Fit whole page to screen"), so a
// musician who set a comfortable view had to re-set it on EVERY song, during a
// service, on six or seven iPads independently.
//
// The old comment justified it as "each chart opens at the safe default", but
// 'width' is not the safe default in landscape — it puts ~50% of an ordinary
// US Letter chart below the fold. There is no reading of the product in which
// silently discarding the user's explicit choice at every downbeat is correct.
// The assertions below now require fit mode to SURVIVE navigation.
//
// `setFile` still resets — that is the standalone /perform/[fileId] entry and it
// clears transposition, capo, chord-edit and AI state too, i.e. a genuine full
// context reset rather than a step within a setlist.

import { describe, it, expect, beforeEach } from "vitest"
import { useMusicStore, type QueueItem } from "@/lib/store"

const trackA: QueueItem = { name: "Chart A", fileId: "upload-A", type: "pdf" }
const trackB: QueueItem = { name: "Chart B", fileId: "upload-B", type: "pdf" }

describe("PDF fit mode (v11.6-02-05 WS-14)", () => {
    beforeEach(() => {
        localStorage.clear()
        useMusicStore.getState().reset()
    })

    it("defaults to 'width'", () => {
        expect(useMusicStore.getState().fitMode).toBe("width")
    })

    it("setFitMode toggles the mode", () => {
        useMusicStore.getState().setFitMode("page")
        expect(useMusicStore.getState().fitMode).toBe("page")
        useMusicStore.getState().setFitMode("width")
        expect(useMusicStore.getState().fitMode).toBe("width")
    })

    it("SURVIVES next/prev/jump navigation (WAVE1 Bug 3)", () => {
        useMusicStore.getState().setQueue([trackA, trackB], 0)
        useMusicStore.getState().setFitMode("page")

        useMusicStore.getState().nextSong()
        expect(useMusicStore.getState().fitMode).toBe("page")

        useMusicStore.getState().prevSong()
        expect(useMusicStore.getState().fitMode).toBe("page")

        useMusicStore.getState().jumpToSong(1)
        expect(useMusicStore.getState().fitMode).toBe("page")
    })

    it("survives a whole setlist walk — the posture is set once, not per song", () => {
        const queue: QueueItem[] = Array.from({ length: 14 }, (_, i) => ({
            name: `Chart ${i}`,
            fileId: `upload-${i}`,
            type: "pdf" as const,
        }))
        useMusicStore.getState().setQueue(queue, 0)
        useMusicStore.getState().setFitMode("page")

        // The 14-song walk from the characterization's real-setlist probe.
        for (let i = 1; i < queue.length; i++) {
            useMusicStore.getState().nextSong()
            expect(
                useMusicStore.getState().fitMode,
                `fit mode reverted at song ${i} — the musician would have to re-set it mid-service`,
            ).toBe("page")
        }
    })

    it("SURVIVES a new queue starting (WAVE1 Bug 3), but setFile still resets", () => {
        useMusicStore.getState().setFitMode("page")
        useMusicStore.getState().setQueue([trackA], 0)
        expect(useMusicStore.getState().fitMode).toBe("page")

        // setFile is the standalone-chart entry point and clears transposition,
        // capo and AI state as well — a full context reset, not a song change.
        useMusicStore.getState().setFile("blob:x", "pdf")
        expect(useMusicStore.getState().fitMode).toBe("width")
    })

    it("per-chart zoom is still restored on navigation (unchanged by Bug 3)", () => {
        useMusicStore.getState().setQueue([trackA, trackB], 0)
        useMusicStore.getState().setZoom(1.6)
        useMusicStore.getState().nextSong()
        expect(useMusicStore.getState().zoom).toBe(1)
        useMusicStore.getState().prevSong()
        expect(useMusicStore.getState().zoom).toBe(1.6)
    })

    it("is NOT persisted to localStorage (ephemeral, not a per-chart preference)", () => {
        useMusicStore.getState().setQueue([trackA], 0)
        useMusicStore.getState().setFitMode("page")

        const raw = JSON.parse(localStorage.getItem("music-storage")!)
        expect(raw.state.fitMode).toBeUndefined()
    })
})
