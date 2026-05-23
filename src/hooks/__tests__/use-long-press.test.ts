import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'

import { useLongPress } from '@/hooks/use-long-press'

/**
 * useLongPress is the gesture detection underneath the live-director sheet
 * (`band_leader || admin` long-press on PDFOverlay or a setlist row). These
 * tests assert the contract every consumer relies on:
 *
 *   - hold past `durationMs` → onLongPress fires once
 *   - pointer-up before `durationMs` → no fire; subsequent click runs
 *   - move past `slopPx` → cancel; no fire even on long hold
 *   - fired long-press suppresses the synthetic click (prevent/stop)
 *   - secondary mouse button / multi-touch second finger → ignored
 *   - disabled=true short-circuits to no-op (musician iPads, public viewers)
 *   - onLongPress identity-swap mid-press still calls the latest version
 *     (consumers re-bind on auth changes; we don't want a tear-down loop)
 *   - context-menu (iOS long-press callout / right-click) is suppressed
 *
 * Movement events are constructed as plain objects with the minimum
 * PointerEvent fields the hook reads — building real synthetic React
 * events from jsdom is overkill for a pure-handler-bag unit suite.
 */

function pe(
    overrides: Partial<{
        pointerId: number
        pointerType: 'mouse' | 'touch' | 'pen'
        button: number
        clientX: number
        clientY: number
    }> = {},
): ReactPointerEvent {
    return {
        pointerId: overrides.pointerId ?? 1,
        pointerType: overrides.pointerType ?? 'touch',
        button: overrides.button ?? 0,
        clientX: overrides.clientX ?? 100,
        clientY: overrides.clientY ?? 100,
    } as unknown as ReactPointerEvent
}

function me(): ReactMouseEvent {
    const prevent = vi.fn()
    const stop = vi.fn()
    return {
        preventDefault: prevent,
        stopPropagation: stop,
        defaultPrevented: false,
        // Track-the-flag spies for assertions
        __prevent: prevent,
        __stop: stop,
    } as unknown as ReactMouseEvent
}

describe('useLongPress', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('fires onLongPress after the hold threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => {
            result.current.onPointerDown(pe())
        })
        expect(onLongPress).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(499)
        })
        expect(onLongPress).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('does NOT fire if pointer-up beats the hold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => result.current.onPointerDown(pe()))
        act(() => {
            vi.advanceTimersByTime(300)
            result.current.onPointerUp(pe())
            vi.advanceTimersByTime(500)
        })

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('cancels on movement past the slop threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() =>
            useLongPress({ onLongPress, durationMs: 500, slopPx: 10 }),
        )

        act(() => result.current.onPointerDown(pe({ clientX: 100, clientY: 100 })))
        act(() => result.current.onPointerMove(pe({ clientX: 115, clientY: 100 })))
        act(() => vi.advanceTimersByTime(600))

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('does NOT cancel on movement within the slop threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() =>
            useLongPress({ onLongPress, durationMs: 500, slopPx: 10 }),
        )

        act(() => result.current.onPointerDown(pe({ clientX: 100, clientY: 100 })))
        act(() => result.current.onPointerMove(pe({ clientX: 105, clientY: 108 })))
        act(() => vi.advanceTimersByTime(600))

        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('after a fired long-press, the synthetic click is suppressed exactly once', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => result.current.onPointerDown(pe()))
        act(() => vi.advanceTimersByTime(500))
        act(() => result.current.onPointerUp(pe()))

        const firstClick = me()
        act(() => result.current.onClick(firstClick))
        expect((firstClick as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).toHaveBeenCalled()
        expect((firstClick as unknown as { __stop: ReturnType<typeof vi.fn> }).__stop).toHaveBeenCalled()

        // Subsequent legitimate tap (no long-press) must NOT be suppressed.
        const secondClick = me()
        act(() => result.current.onClick(secondClick))
        expect((secondClick as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).not.toHaveBeenCalled()
    })

    it('does NOT suppress a click when no long-press fired', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        // Quick tap: down, up before threshold, click.
        act(() => result.current.onPointerDown(pe()))
        act(() => {
            vi.advanceTimersByTime(50)
            result.current.onPointerUp(pe())
        })

        const click = me()
        act(() => result.current.onClick(click))
        expect((click as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).not.toHaveBeenCalled()
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('ignores non-primary mouse buttons (right-click never starts the timer)', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => result.current.onPointerDown(pe({ pointerType: 'mouse', button: 2 })))
        act(() => vi.advanceTimersByTime(600))

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('ignores a second pointer while the first is still being tracked', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => result.current.onPointerDown(pe({ pointerId: 1 })))
        // Second finger down does NOT reset / re-arm the timer.
        act(() => result.current.onPointerDown(pe({ pointerId: 2 })))
        act(() => vi.advanceTimersByTime(500))
        // The first pointer's timer fires once (latest-callback-wins held by ref).
        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('disabled=true short-circuits to a no-op', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() =>
            useLongPress({ onLongPress, durationMs: 500, disabled: true }),
        )

        act(() => result.current.onPointerDown(pe()))
        act(() => vi.advanceTimersByTime(600))

        expect(onLongPress).not.toHaveBeenCalled()

        // Context-menu pass-through (iOS callout left intact for non-gesture
        // surfaces — musician iPads keep native behavior).
        const ctx = me()
        act(() => result.current.onContextMenu(ctx))
        expect((ctx as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).not.toHaveBeenCalled()
    })

    it('uses the latest onLongPress callback when it changes between fires', () => {
        const first = vi.fn()
        const second = vi.fn()
        const { result, rerender } = renderHook(
            ({ cb }) => useLongPress({ onLongPress: cb, durationMs: 500 }),
            { initialProps: { cb: first } },
        )

        act(() => result.current.onPointerDown(pe()))
        rerender({ cb: second })
        act(() => vi.advanceTimersByTime(500))

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    it('suppresses contextmenu while enabled (kills the iOS callout)', () => {
        const { result } = renderHook(() =>
            useLongPress({ onLongPress: vi.fn(), durationMs: 500 }),
        )
        const ctx = me()
        result.current.onContextMenu(ctx)
        expect((ctx as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).toHaveBeenCalledTimes(1)
    })

    it('pointer-cancel clears the timer without setting the fired flag', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onLongPress, durationMs: 500 }))

        act(() => result.current.onPointerDown(pe()))
        act(() => result.current.onPointerCancel(pe()))
        act(() => vi.advanceTimersByTime(600))

        expect(onLongPress).not.toHaveBeenCalled()

        const click = me()
        act(() => result.current.onClick(click))
        expect((click as unknown as { __prevent: ReturnType<typeof vi.fn> }).__prevent).not.toHaveBeenCalled()
    })

    it('exposes touch-friendly style hints', () => {
        const { result } = renderHook(() =>
            useLongPress({ onLongPress: vi.fn(), durationMs: 500 }),
        )
        expect(result.current.style).toMatchObject({
            touchAction: 'manipulation',
            WebkitTouchCallout: 'none',
        })
    })
})
