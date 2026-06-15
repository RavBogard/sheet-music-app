// @vitest-environment jsdom
//
// v11.5-02-04 (H1) — per-device, per-chart zoom calibration.
// The active `zoom` is restored per chart from `chartZoom[fileId]` on every
// queue transition (mirroring how `transposition` is restored from
// `track.transposition`) and written through by `setZoom`. Persistence is
// localStorage ONLY (per-device) — Daniel ratified per-device scope 2026-06-14,
// so the value MUST NOT be written to Firestore / shared across band iPads.

import { describe, it, expect, beforeEach } from "vitest"
import { useMusicStore, type QueueItem } from "@/lib/store"

const trackA: QueueItem = { name: "Chart A", fileId: "upload-A", type: "pdf" }
const trackB: QueueItem = { name: "Chart B", fileId: "upload-B", type: "pdf" }

describe("per-chart zoom calibration (v11.5-02-04)", () => {
    beforeEach(() => {
        localStorage.clear()
        useMusicStore.getState().reset()
    })

    it("AC-1: setZoom writes through to the active chart; navigation restores per chart", () => {
        useMusicStore.getState().setQueue([trackA, trackB], 0)
        // Chart A active, uncalibrated → default auto-fit baseline (1).
        expect(useMusicStore.getState().zoom).toBe(1)

        useMusicStore.getState().setZoom(1.4)
        expect(useMusicStore.getState().zoom).toBe(1.4)
        expect(useMusicStore.getState().chartZoom["upload-A"]).toBe(1.4)

        // Navigate to B (uncalibrated) → back to baseline; A's value untouched.
        useMusicStore.getState().nextSong()
        expect(useMusicStore.getState().zoom).toBe(1)
        expect(useMusicStore.getState().chartZoom["upload-B"]).toBeUndefined()

        // Back to A → its 1.4 is remembered.
        useMusicStore.getState().prevSong()
        expect(useMusicStore.getState().zoom).toBe(1.4)
    })

    it("AC-1: jumpToSong restores the target chart's calibration", () => {
        useMusicStore.getState().setQueue([trackA, trackB], 0)
        useMusicStore.getState().setZoom(0.8) // calibrate A
        useMusicStore.getState().nextSong() // to B
        useMusicStore.getState().setZoom(1.6) // calibrate B
        expect(useMusicStore.getState().chartZoom).toEqual({
            "upload-A": 0.8,
            "upload-B": 1.6,
        })

        useMusicStore.getState().jumpToSong(0)
        expect(useMusicStore.getState().zoom).toBe(0.8)
        useMusicStore.getState().jumpToSong(1)
        expect(useMusicStore.getState().zoom).toBe(1.6)
    })

    it("AC-2: per-chart zoom persists to localStorage (per-device); global zoom is NOT persisted", () => {
        useMusicStore.getState().setQueue([trackA], 0)
        useMusicStore.getState().setZoom(1.4)

        const raw = JSON.parse(localStorage.getItem("music-storage")!)
        // chartZoom is persisted (survives reload → restored on reopen).
        expect(raw.state.chartZoom["upload-A"]).toBe(1.4)
        // The session-global `zoom` key is no longer persisted (superseded by per-chart).
        expect(raw.state.zoom).toBeUndefined()
        // audio is still persisted (unchanged partialize behavior).
        expect(raw.state.audio).toBeDefined()
    })

    it("AC-3: setZoom(1) resets the active chart to its auto-fit baseline + remembers 1", () => {
        useMusicStore.getState().setQueue([trackA], 0)
        useMusicStore.getState().setZoom(1.4)
        expect(useMusicStore.getState().chartZoom["upload-A"]).toBe(1.4)

        useMusicStore.getState().setZoom(1) // Fit reset
        expect(useMusicStore.getState().zoom).toBe(1)
        expect(useMusicStore.getState().chartZoom["upload-A"]).toBe(1)
    })

    it("scope-limit guard: setZoom with no active chart sets zoom only, never pollutes chartZoom", () => {
        // reset() → empty queue, queueIndex -1 (the standalone /perform/[fileId] shape).
        useMusicStore.getState().setZoom(1.2)
        expect(useMusicStore.getState().zoom).toBe(1.2)
        expect(Object.keys(useMusicStore.getState().chartZoom)).toHaveLength(0)
    })
})
