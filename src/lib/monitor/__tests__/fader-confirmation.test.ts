import { describe, it, expect } from "vitest"
import {
    faderReducer,
    initFaderState,
    DEFAULT_FADER_CONFIG,
    FADER_CONFIRM_TIMEOUT_MS,
    type FaderMachineState,
} from "@/lib/monitor/fader-confirmation"

/**
 * Pure fader confirmation state machine (Monitor Overhaul Phase 3 — C-2/C-3/C-12).
 * Drives the iPad fader's optimistic → confirmed/reverted hand-feel.
 */
describe("faderReducer", () => {
    const cfg = DEFAULT_FADER_CONFIG

    it("initialises idle showing the authoritative value, anchored to a seq", () => {
        const s = initFaderState(0.5, 7)
        expect(s).toMatchObject({
            phase: "idle",
            displayValue: 0.5,
            optimisticValue: null,
            sentAt: null,
            lastSeq: 7,
            outcome: null,
        })
    })

    describe("idle", () => {
        it("tracks authoritative updates from external snapshots", () => {
            let s = initFaderState(0.5, 1)
            s = faderReducer(s, { type: "external", value: 0.8, seq: 2, now: 1000 }, cfg)
            expect(s.phase).toBe("idle")
            expect(s.displayValue).toBe(0.8)
            expect(s.lastSeq).toBe(2)
        })
    })

    describe("dragging (C-12 drag-suppression)", () => {
        it("moves the knob locally on drag without touching authoritative", () => {
            let s = initFaderState(0.5, 1)
            s = faderReducer(s, { type: "drag_start" }, cfg)
            s = faderReducer(s, { type: "drag_move", value: 0.9 }, cfg)
            expect(s.phase).toBe("dragging")
            expect(s.displayValue).toBe(0.9)
        })

        it("does NOT yank the knob when a snapshot arrives mid-drag", () => {
            let s = initFaderState(0.5, 1)
            s = faderReducer(s, { type: "drag_start" }, cfg)
            s = faderReducer(s, { type: "drag_move", value: 0.9 }, cfg)
            // A cross-device push lands while the finger is down:
            s = faderReducer(s, { type: "external", value: 0.1, seq: 2, now: 500 }, cfg)
            expect(s.phase).toBe("dragging")
            expect(s.displayValue).toBe(0.9) // unchanged — suppressed
            expect(s.lastSeq).toBe(2) // but the seq is recorded
        })
    })

    describe("commit → pending (optimistic)", () => {
        it("holds the optimistic value and records sentAt", () => {
            let s = initFaderState(0.5, 1)
            s = faderReducer(s, { type: "drag_start" }, cfg)
            s = faderReducer(s, { type: "drag_move", value: 0.7 }, cfg)
            s = faderReducer(s, { type: "commit", value: 0.7, now: 1000 }, cfg)
            expect(s).toMatchObject({
                phase: "pending",
                displayValue: 0.7,
                optimisticValue: 0.7,
                sentAt: 1000,
                outcome: null,
            })
        })
    })

    describe("pending → confirmed (C-2 confirm-on-reflect)", () => {
        const pending = (): FaderMachineState =>
            faderReducer(initFaderState(0.5, 1), { type: "commit", value: 0.7, now: 1000 }, cfg)

        it("confirms when a NEW snapshot reflects ≈ the sent value", () => {
            const s = faderReducer(pending(), { type: "external", value: 0.705, seq: 2, now: 1200 }, cfg)
            expect(s.phase).toBe("idle")
            expect(s.displayValue).toBe(0.705)
            expect(s.optimisticValue).toBeNull()
            expect(s.outcome).toBe("confirmed")
        })

        it("IGNORES the optimistic echo (same seq) — never false-confirms (C-2)", () => {
            // The parent's optimistic store write flips `value` to the sent value
            // WITHOUT advancing the snapshot seq. That must not confirm.
            const s = faderReducer(pending(), { type: "external", value: 0.7, seq: 1, now: 1050 }, cfg)
            expect(s.phase).toBe("pending")
            expect(s.outcome).toBeNull()
            expect(s.optimisticValue).toBe(0.7)
        })

        it("keeps showing the optimistic value while a new snapshot has not yet matched", () => {
            // Desk still reflecting the OLD value on a fresh seq, within the window.
            const s = faderReducer(pending(), { type: "external", value: 0.3, seq: 2, now: 1100 }, cfg)
            expect(s.phase).toBe("pending")
            expect(s.displayValue).toBe(0.7) // still optimistic — no movement
            expect(s.lastSeq).toBe(2)
        })
    })

    describe("pending → reverted (C-3 ease, no hard snap)", () => {
        const pending = (): FaderMachineState =>
            faderReducer(initFaderState(0.5, 1), { type: "commit", value: 0.7, now: 1000 }, cfg)

        it("reverts via TICK after the timeout when no confirmation arrives", () => {
            const s = faderReducer(pending(), { type: "tick", value: 0.5, now: 1000 + FADER_CONFIRM_TIMEOUT_MS }, cfg)
            expect(s.phase).toBe("idle")
            expect(s.displayValue).toBe(0.5) // authoritative, eased by the component
            expect(s.optimisticValue).toBeNull()
            expect(s.outcome).toBe("reverted")
        })

        it("reverts via a late, disagreeing snapshot past the timeout", () => {
            const s = faderReducer(pending(), { type: "external", value: 0.3, seq: 2, now: 1000 + FADER_CONFIRM_TIMEOUT_MS }, cfg)
            expect(s.phase).toBe("idle")
            expect(s.displayValue).toBe(0.3)
            expect(s.outcome).toBe("reverted")
        })

        it("does NOT revert on a tick before the timeout", () => {
            const s = faderReducer(pending(), { type: "tick", value: 0.5, now: 1500 }, cfg)
            expect(s.phase).toBe("pending")
            expect(s.outcome).toBeNull()
        })

        it("tick never confirms even if the value matches (only external can)", () => {
            // value === optimistic on a tick is the optimistic echo, not the desk.
            const s = faderReducer(pending(), { type: "tick", value: 0.7, now: 1500 }, cfg)
            expect(s.phase).toBe("pending")
            expect(s.outcome).toBeNull()
        })
    })

    describe("outcome cue lifecycle", () => {
        it("clears the outcome on clear_outcome", () => {
            let s = faderReducer(initFaderState(0.5, 1), { type: "commit", value: 0.7, now: 1000 }, cfg)
            s = faderReducer(s, { type: "external", value: 0.7, seq: 2, now: 1100 }, cfg)
            expect(s.outcome).toBe("confirmed")
            s = faderReducer(s, { type: "clear_outcome" }, cfg)
            expect(s.outcome).toBeNull()
        })

        it("clears a stale outcome when a new drag starts", () => {
            let s = initFaderState(0.5, 1)
            s = faderReducer(s, { type: "commit", value: 0.7, now: 1000 }, cfg)
            s = faderReducer(s, { type: "external", value: 0.7, seq: 2, now: 1100 }, cfg)
            expect(s.outcome).toBe("confirmed")
            s = faderReducer(s, { type: "drag_start" }, cfg)
            expect(s.outcome).toBeNull()
        })
    })

    describe("full optimistic round-trip (integration of events)", () => {
        it("idle → drag → commit → optimistic-echo (ignored) → authoritative confirm", () => {
            let s = initFaderState(0.2, 10)
            s = faderReducer(s, { type: "drag_start" }, cfg)
            s = faderReducer(s, { type: "drag_move", value: 0.6 }, cfg)
            s = faderReducer(s, { type: "commit", value: 0.6, now: 0 }, cfg)
            // optimistic store write echoes value=0.6 with the SAME seq:
            s = faderReducer(s, { type: "external", value: 0.6, seq: 10, now: 50 }, cfg)
            expect(s.phase).toBe("pending") // not confirmed by the echo
            // real desk snapshot lands, seq advances:
            s = faderReducer(s, { type: "external", value: 0.59, seq: 11, now: 350 }, cfg)
            expect(s.phase).toBe("idle")
            expect(s.outcome).toBe("confirmed")
            expect(s.displayValue).toBe(0.59)
        })
    })
})
