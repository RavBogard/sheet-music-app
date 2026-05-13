import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

describe('useVirtualKeyboardOpen', () => {
  let addListenerSpy: ReturnType<typeof vi.fn>
  let removeListenerSpy: ReturnType<typeof vi.fn>
  let resizeHandler: (() => void) | null = null
  let originalInnerHeight: number
  let originalVisualViewport: VisualViewport | undefined

  function setupVisualViewport(viewportHeight: number) {
    addListenerSpy = vi.fn((event: string, handler: () => void) => {
      if (event === 'resize') resizeHandler = handler
    })
    removeListenerSpy = vi.fn()

    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: {
        height: viewportHeight,
        width: window.innerWidth,
        scale: 1,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        addEventListener: addListenerSpy,
        removeEventListener: removeListenerSpy,
        dispatchEvent: vi.fn(),
        onresize: null,
        onscroll: null,
      },
    })
  }

  function removeVisualViewport() {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    })
  }

  beforeEach(() => {
    resizeHandler = null
    originalInnerHeight = window.innerHeight
    originalVisualViewport = window.visualViewport ?? undefined
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1000,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    })
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: originalVisualViewport,
    })
  })

  it('returns false when visualViewport is unavailable (SSR / legacy browser)', async () => {
    removeVisualViewport()
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('returns false when visualViewport.height equals window.innerHeight (keyboard closed)', async () => {
    setupVisualViewport(1000)
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('returns false when delta is below 150px threshold (browser-chrome reveal/hide noise)', async () => {
    setupVisualViewport(920) // 80px delta — typical browser-chrome reveal
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('returns true when delta exceeds 150px threshold (keyboard open)', async () => {
    setupVisualViewport(700) // 300px delta — real iOS Safari keyboard
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(true)
  })

  it('responds to resize events as keyboard opens', async () => {
    setupVisualViewport(1000)
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(false)

    // Simulate keyboard pop — height drops, then resize event fires
    act(() => {
      ;(window.visualViewport as unknown as { height: number }).height = 700
      resizeHandler?.()
    })
    expect(result.current).toBe(true)
  })

  it('responds to resize events as keyboard dismisses', async () => {
    setupVisualViewport(700)
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { result } = renderHook(() => useVirtualKeyboardOpen())
    expect(result.current).toBe(true)

    act(() => {
      ;(window.visualViewport as unknown as { height: number }).height = 1000
      resizeHandler?.()
    })
    expect(result.current).toBe(false)
  })

  it('cleans up resize listener on unmount', async () => {
    setupVisualViewport(1000)
    const { useVirtualKeyboardOpen } = await import('@/hooks/use-virtual-keyboard-open')
    const { unmount } = renderHook(() => useVirtualKeyboardOpen())

    unmount()
    expect(removeListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
