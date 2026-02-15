// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMetronome } from './useMetronome'

describe('useMetronome', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const makeEvent = () => ({ stopPropagation: vi.fn() } as unknown as React.MouseEvent)

    it('starts with blinking off', () => {
        const { result } = renderHook(() => useMetronome(120))
        expect(result.current.isBlinking).toBe(false)
        expect(result.current.blinkState).toBe(false)
    })

    it('does nothing when no BPM provided', () => {
        const { result } = renderHook(() => useMetronome(undefined))
        act(() => result.current.toggle(makeEvent()))
        expect(result.current.isBlinking).toBe(false)
    })

    it('starts blinking on toggle', () => {
        const { result } = renderHook(() => useMetronome(120))
        act(() => result.current.toggle(makeEvent()))
        expect(result.current.isBlinking).toBe(true)
        expect(result.current.blinkState).toBe(true) // Immediate flash
    })

    it('blink state flashes off after 100ms', () => {
        const { result } = renderHook(() => useMetronome(120))
        act(() => result.current.toggle(makeEvent()))

        expect(result.current.blinkState).toBe(true)

        act(() => { vi.advanceTimersByTime(100) })
        expect(result.current.blinkState).toBe(false)
    })

    it('blinks again at BPM interval', () => {
        const { result } = renderHook(() => useMetronome(120)) // 500ms interval
        act(() => result.current.toggle(makeEvent()))

        // First blink off
        act(() => { vi.advanceTimersByTime(100) })
        expect(result.current.blinkState).toBe(false)

        // Next blink at 500ms
        act(() => { vi.advanceTimersByTime(400) })
        expect(result.current.blinkState).toBe(true)
    })

    it('stops on second toggle', () => {
        const { result } = renderHook(() => useMetronome(120))

        act(() => result.current.toggle(makeEvent())) // Start
        expect(result.current.isBlinking).toBe(true)

        act(() => result.current.toggle(makeEvent())) // Stop
        expect(result.current.isBlinking).toBe(false)
        expect(result.current.blinkState).toBe(false)
    })

    it('auto-stops after 10 seconds', () => {
        const { result } = renderHook(() => useMetronome(120))
        act(() => result.current.toggle(makeEvent()))

        expect(result.current.isBlinking).toBe(true)

        act(() => { vi.advanceTimersByTime(10000) })
        expect(result.current.isBlinking).toBe(false)
    })

    it('stops event propagation', () => {
        const { result } = renderHook(() => useMetronome(120))
        const event = makeEvent()
        act(() => result.current.toggle(event))
        expect(event.stopPropagation).toHaveBeenCalled()
    })
})
