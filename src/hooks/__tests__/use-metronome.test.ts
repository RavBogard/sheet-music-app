import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMetronome } from '@/hooks/use-metronome'

describe('useMetronome', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with default state', () => {
    const { result } = renderHook(() => useMetronome())
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentBpm).toBe(100)
    expect(result.current.isBeat).toBe(false)
  })

  it('accepts custom initial BPM', () => {
    const { result } = renderHook(() => useMetronome(120))
    expect(result.current.currentBpm).toBe(120)
  })

  it('togglePlay starts and stops', () => {
    const { result } = renderHook(() => useMetronome(120))

    act(() => {
      result.current.togglePlay()
    })
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.togglePlay()
    })
    expect(result.current.isPlaying).toBe(false)
  })

  it('produces beat pulse on start', () => {
    const { result } = renderHook(() => useMetronome(120))

    act(() => {
      result.current.togglePlay()
    })
    // Immediately after start, isBeat should be true
    expect(result.current.isBeat).toBe(true)

    // After 100ms blink timeout, isBeat resets to false
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.isBeat).toBe(false)
  })

  it('beats at correct interval', () => {
    const { result } = renderHook(() => useMetronome(120)) // 500ms interval

    act(() => {
      result.current.togglePlay()
    })

    // Clear initial beat
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.isBeat).toBe(false)

    // Advance to next beat (500ms from start)
    act(() => {
      vi.advanceTimersByTime(400) // 100 + 400 = 500ms
    })
    expect(result.current.isBeat).toBe(true)

    // Beat clears after 100ms
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.isBeat).toBe(false)
  })

  it('stop clears playing state and beat', () => {
    const { result } = renderHook(() => useMetronome(120))

    act(() => {
      result.current.togglePlay()
    })
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.togglePlay() // stop
    })
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isBeat).toBe(false)
  })

  it('BPM change updates interval while playing', () => {
    const { result } = renderHook(() => useMetronome(60)) // 1000ms interval

    act(() => {
      result.current.togglePlay()
    })

    // Change BPM to 120 (500ms interval)
    act(() => {
      result.current.setCurrentBpm(120)
    })

    // Should still be playing
    expect(result.current.isPlaying).toBe(true)

    // Clear any blink timeout
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // At 500ms (new interval), should get a beat
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current.isBeat).toBe(true)
  })

  it('cleans up on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { result, unmount } = renderHook(() => useMetronome(120))

    act(() => {
      result.current.togglePlay()
    })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
