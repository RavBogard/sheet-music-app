// @vitest-environment jsdom
//
// v11.6-02-05 (WS-14) — PDF fit mode is EPHEMERAL session state: it defaults to
// 'width', is reset to 'width' on every chart transition (so each chart opens at
// the safe default), and is NOT persisted to localStorage (unlike chartZoom,
// which IS a per-chart preference). PDF-only.

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

    it("resets to 'width' on next/prev/jump navigation", () => {
        useMusicStore.getState().setQueue([trackA, trackB], 0)
        useMusicStore.getState().setFitMode("page")

        useMusicStore.getState().nextSong()
        expect(useMusicStore.getState().fitMode).toBe("width")

        useMusicStore.getState().setFitMode("page")
        useMusicStore.getState().prevSong()
        expect(useMusicStore.getState().fitMode).toBe("width")

        useMusicStore.getState().setFitMode("page")
        useMusicStore.getState().jumpToSong(1)
        expect(useMusicStore.getState().fitMode).toBe("width")
    })

    it("resets to 'width' when a new queue starts and when setFile is called", () => {
        useMusicStore.getState().setFitMode("page")
        useMusicStore.getState().setQueue([trackA], 0)
        expect(useMusicStore.getState().fitMode).toBe("width")

        useMusicStore.getState().setFitMode("page")
        useMusicStore.getState().setFile("blob:x", "pdf")
        expect(useMusicStore.getState().fitMode).toBe("width")
    })

    it("is NOT persisted to localStorage (ephemeral, not a per-chart preference)", () => {
        useMusicStore.getState().setQueue([trackA], 0)
        useMusicStore.getState().setFitMode("page")

        const raw = JSON.parse(localStorage.getItem("music-storage")!)
        expect(raw.state.fitMode).toBeUndefined()
    })
})
