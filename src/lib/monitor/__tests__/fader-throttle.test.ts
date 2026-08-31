import { describe, it, expect, vi } from "vitest"
import { createFaderThrottle } from "@/lib/monitor/fader-throttle"

/**
 * R4 — the final fader position must never be lost on release.
 *
 * The bug being pinned here is not "the throttle is wrong"; the throttle was
 * fine. It is that the RELEASE went through the throttle at all, and therefore
 * landed in an animation frame that a closing popover / a backgrounded iPad
 * would never run. Every test below distinguishes "was scheduled" from "was
 * actually delivered", because the old code passed any test that only checked
 * the former.
 */

/** A controllable clock + frame scheduler, so no test depends on real time. */
function harness(startAt = 10_000) {
    let now = startAt
    const frames: Array<{ id: number; cb: () => void; cancelled: boolean }> = []
    let nextId = 1
    const sent: number[] = []

    const throttle = createFaderThrottle({
        onChange: (v) => sent.push(v),
        now: () => now,
        schedule: (cb) => {
            const id = nextId++
            frames.push({ id, cb, cancelled: false })
            return id
        },
        cancel: (id) => {
            const f = frames.find((x) => x.id === id)
            if (f) f.cancelled = true
        },
    })

    return {
        throttle,
        sent,
        advance: (ms: number) => {
            now += ms
        },
        /** Run every scheduled, non-cancelled frame — i.e. the browser paints. */
        runFrames: () => {
            for (const f of frames) {
                if (!f.cancelled) {
                    f.cancelled = true // a frame runs once
                    f.cb()
                }
            }
        },
        /** Frames still waiting to run: the window in which the old bug lost values. */
        liveFrames: () => frames.filter((f) => !f.cancelled).length,
    }
}

describe("createFaderThrottle — R4 final-value delivery", () => {
    it("sends the first move immediately (throttle window open)", () => {
        const h = harness()
        h.advance(500) // well clear of the last write
        h.throttle.move(0.4)
        expect(h.sent).toEqual([0.4])
    })

    it("defers a move inside the throttle window into a frame", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4)
        h.advance(10) // <100ms
        h.throttle.move(0.5)

        expect(h.sent).toEqual([0.4]) // not yet
        expect(h.liveFrames()).toBe(1)
        h.runFrames()
        expect(h.sent).toEqual([0.4, 0.5])
    })

    it("THE BUG: commit delivers synchronously even though the window is closed", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4) // mid-drag write
        h.advance(10) // release lands <100ms later — the common case
        h.throttle.commit(0.9)

        // The whole fix in one assertion: the drop value is already out, WITHOUT
        // any frame having run. Previously this was `[0.4]` here, and became
        // `[0.4, 0.9]` only if a frame ever got to run.
        expect(h.sent).toEqual([0.4, 0.9])
        expect(h.liveFrames()).toBe(0)
    })

    it("commit cancels a pending trailing frame so the stale value cannot land after it", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4)
        h.advance(10)
        h.throttle.move(0.5) // scheduled
        h.throttle.commit(0.9) // release at a different position

        h.runFrames() // the browser paints later
        // 0.5 must never arrive after 0.9 — that would leave the desk at a value
        // the musician passed through, not the one they stopped at.
        expect(h.sent).toEqual([0.4, 0.9])
    })

    it("flush() delivers a scheduled value that no frame will ever run (backgrounded tab / unmount)", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4)
        h.advance(10)
        h.throttle.move(0.77) // sitting in a frame
        expect(h.sent).toEqual([0.4])

        h.throttle.flush() // visibilitychange → hidden, pagehide, or unmount
        expect(h.sent).toEqual([0.4, 0.77])

        // And the frame, if it ever runs, must not double-send.
        h.runFrames()
        expect(h.sent).toEqual([0.4, 0.77])
    })

    it("flush() with nothing pending is a no-op (no phantom writes on every unmount)", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4)
        h.throttle.flush()
        h.throttle.flush()
        expect(h.sent).toEqual([0.4])
    })

    it("cancel() drops a pending value WITHOUT sending it", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.4)
        h.advance(10)
        h.throttle.move(0.6)
        h.throttle.cancel()
        h.runFrames()
        expect(h.sent).toEqual([0.4])
    })

    it("only the NEWEST value survives a burst inside one window", () => {
        const h = harness()
        h.advance(500)
        h.throttle.move(0.1)
        h.advance(5)
        h.throttle.move(0.2)
        h.advance(5)
        h.throttle.move(0.3)
        h.advance(5)
        h.throttle.move(0.4)
        h.runFrames()
        expect(h.sent).toEqual([0.1, 0.4])
    })

    it("a commit at value 0 is still delivered (0 is a real level, not 'nothing')", () => {
        // Guards the classic falsy bug: `if (pending)` instead of `!= null` would
        // silently swallow a musician killing their own monitor.
        const h = harness()
        h.advance(500)
        h.throttle.move(0.5)
        h.advance(10)
        h.throttle.move(0)
        h.throttle.flush()
        expect(h.sent).toEqual([0.5, 0])
    })

    it("default scheduler falls back cleanly when requestAnimationFrame is absent", () => {
        // jsdom/SSR safety: creating a throttle must not throw where rAF is undefined.
        const spy = vi.fn()
        const t = createFaderThrottle({ onChange: spy })
        t.commit(0.5)
        expect(spy).toHaveBeenCalledWith(0.5)
    })
})
