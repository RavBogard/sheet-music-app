/**
 * Fader write throttle (R4 — "I set it and it snapped back").
 *
 * PURE and framework-free, mirroring `fader-confirmation.ts`, so the release
 * path can be unit-tested without a browser: the scheduler is injected.
 *
 * ## The bug this exists to kill (R4)
 *
 * Both fader strips throttled EVERY write — including the release — through the
 * same path:
 *
 *     if (now - lastWrite > 100) { send(v) }
 *     else { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => send(v)) }
 *
 * and `handlePointerUp` then did `cancelAnimationFrame(raf); throttled(drop)`.
 * Because the last mid-drag write was almost always <100ms earlier, the DROP
 * value took the else-branch and was scheduled into *another* animation frame.
 * If the popover closed, the component unmounted, or iOS backgrounded the tab
 * before that frame ran, the frame never fired and **the final fader position
 * was never sent**. The desk kept the second-to-last throttled value, and the
 * confirmation machine — already `pending` — eased the knob back 2s later. The
 * musician saw their move undo itself.
 *
 * ## The rule
 *
 * Continuous motion is throttled; a COMMIT is never throttled. `commit()` sends
 * synchronously, in the caller's own event handler, so the value is inside the
 * Firestore SDK before anything can tear the component down. Pointer-up,
 * pointer-cancel, double-tap reset and keyboard nudge are all commits. The
 * client's own 50ms per-key throttle (`COMMAND_THROTTLE_MS`) still protects
 * Firestore from the resulting write rate, and `FirestoreMonitorClient.disconnect()`
 * already flushes its own pending throttled commands.
 *
 * `flush()` is the belt-and-braces half: any value still sitting in a scheduled
 * frame is sent immediately. The hook calls it on `visibilitychange → hidden`,
 * on `pagehide` (iOS Safari does not reliably fire the former), and on unmount.
 */

/** Mid-drag writes are throttled to at most one per this interval. */
export const FADER_THROTTLE_MS = 100

export interface FaderThrottleOptions {
    /** Called with every value that is actually sent onward. */
    onChange: (value: number) => void
    /** Injectable clock (tests). Defaults to `Date.now`. */
    now?: () => number
    /**
     * Injectable frame scheduler (tests). Defaults to `requestAnimationFrame`,
     * falling back to a `setTimeout` shim where rAF is absent (SSR/jsdom).
     */
    schedule?: (cb: () => void) => number
    /** Cancel a handle from `schedule`. */
    cancel?: (handle: number) => void
    /** Throttle interval; defaults to `FADER_THROTTLE_MS`. */
    intervalMs?: number
}

export interface FaderThrottle {
    /** Replace the delivery callback without discarding pending throttle state. */
    setOnChange: (onChange: (value: number) => void) => void
    /** Continuous motion: send now if the window is open, else schedule a trailing send. */
    move: (value: number) => void
    /**
     * Terminal value (pointer-up / cancel / reset tap / keyboard nudge): drop any
     * scheduled trailing send and deliver THIS value synchronously.
     */
    commit: (value: number) => void
    /** Send any scheduled-but-undelivered value right now. No-op when nothing is pending. */
    flush: () => void
    /** Drop any scheduled value WITHOUT sending it (teardown that must not write). */
    cancel: () => void
    /** Test/introspection: the value currently sitting in a scheduled frame, if any. */
    readonly pending: number | null
}

function defaultSchedule(cb: () => void): number {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb)
    return setTimeout(cb, 16) as unknown as number
}

function defaultCancel(handle: number): void {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle)
    else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
}

export function createFaderThrottle(options: FaderThrottleOptions): FaderThrottle {
    const {
        now = () => Date.now(),
        schedule = defaultSchedule,
        cancel = defaultCancel,
        intervalMs = FADER_THROTTLE_MS,
    } = options
    let onChange = options.onChange

    let lastWriteAt = 0
    let handle: number | null = null
    let pendingValue: number | null = null

    function clearScheduled(): void {
        if (handle != null) {
            cancel(handle)
            handle = null
        }
        pendingValue = null
    }

    function send(value: number): void {
        lastWriteAt = now()
        onChange(value)
    }

    return {
        setOnChange(nextOnChange: (value: number) => void): void {
            onChange = nextOnChange
        },

        move(value: number): void {
            if (now() - lastWriteAt > intervalMs) {
                clearScheduled()
                send(value)
                return
            }
            // Inside the throttle window — hold the newest value for the trailing
            // send. `pendingValue` is what `flush()` rescues; before R4 this value
            // lived only inside the frame closure and was lost with the frame.
            pendingValue = value
            if (handle != null) cancel(handle)
            handle = schedule(() => {
                handle = null
                const v = pendingValue
                pendingValue = null
                if (v != null) send(v)
            })
        },

        commit(value: number): void {
            // R4: NEVER schedule a commit. Synchronous, in the caller's handler.
            clearScheduled()
            send(value)
        },

        flush(): void {
            const v = pendingValue
            clearScheduled()
            if (v != null) send(v)
        },

        cancel(): void {
            clearScheduled()
        },

        get pending(): number | null {
            return pendingValue
        },
    }
}
