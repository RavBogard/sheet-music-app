import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

describe('useMediaQuery', () => {
  let addListenerSpy: ReturnType<typeof vi.fn>
  let removeListenerSpy: ReturnType<typeof vi.fn>
  let changeHandler: ((e: { matches: boolean }) => void) | null = null

  function setupMatchMedia(initialMatches: boolean) {
    addListenerSpy = vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler
    })
    removeListenerSpy = vi.fn()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: initialMatches,
        media: query,
        addEventListener: addListenerSpy,
        removeEventListener: removeListenerSpy,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }

  beforeEach(() => {
    changeHandler = null
  })

  it('returns false initially (SSR default)', async () => {
    setupMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/use-media-query')
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    // After effect runs, still false since matchMedia.matches is false
    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia reports a match', async () => {
    setupMatchMedia(true)
    const { useMediaQuery } = await import('@/hooks/use-media-query')
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('responds to change events', async () => {
    setupMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/use-media-query')
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    // Simulate media query change
    act(() => {
      changeHandler?.({ matches: true })
    })
    expect(result.current).toBe(true)
  })

  it('cleans up event listener on unmount', async () => {
    setupMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/use-media-query')
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    unmount()
    expect(removeListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('re-subscribes when query changes', async () => {
    setupMatchMedia(false)
    const { useMediaQuery } = await import('@/hooks/use-media-query')
    const { rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 768px)' } }
    )

    rerender({ query: '(min-width: 1024px)' })
    // Old listener removed, new one added
    expect(removeListenerSpy).toHaveBeenCalled()
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
  })
})
