import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

import { useWakeLock } from '@/hooks/use-wake-lock'

describe('useWakeLock', () => {
  let releaseHandler: (() => void) | null = null
  let requestSpy: ReturnType<typeof vi.fn>

  function createMockSentinel() {
    return {
      release: vi.fn(() => Promise.resolve()),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'release') releaseHandler = handler
      }),
      released: false,
      type: 'screen',
    }
  }

  beforeEach(() => {
    releaseHandler = null
    requestSpy = vi.fn(() => Promise.resolve(createMockSentinel()))

    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: { request: requestSpy },
    })
  })

  it('starts with isLocked=false', () => {
    const { result } = renderHook(() => useWakeLock())
    expect(result.current.isLocked).toBe(false)
  })

  it('reports isSupported=true when navigator.wakeLock exists', async () => {
    const { result } = renderHook(() => useWakeLock())
    // isSupported is computed in an effect → settle one tick.
    await act(async () => {})
    expect(result.current.isSupported).toBe(true)
  })

  it('reports isSupported=false when navigator.wakeLock is missing (iOS <16.4 / older browsers)', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {})
    expect(result.current.isSupported).toBe(false)

    // Calling requestWakeLock on an unsupported device is a graceful no-op
    // (the toggle is disabled in the UI, but defensive in case it slips).
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(result.current.isLocked).toBe(false)
  })

  it('acquires wake lock and sets isLocked=true', async () => {
    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })

    expect(requestSpy).toHaveBeenCalledWith('screen')
    expect(result.current.isLocked).toBe(true)
  })

  it('releases wake lock and sets isLocked=false', async () => {
    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(result.current.isLocked).toBe(true)

    await act(async () => {
      await result.current.releaseWakeLock()
    })
    expect(result.current.isLocked).toBe(false)
  })

  it('handles release event from sentinel', async () => {
    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(result.current.isLocked).toBe(true)

    // Simulate system releasing the lock
    act(() => {
      releaseHandler?.()
    })
    expect(result.current.isLocked).toBe(false)
  })

  it('handles NotAllowedError gracefully', async () => {
    const notAllowedError = new DOMException('Not allowed', 'NotAllowedError')
    requestSpy.mockRejectedValue(notAllowedError)

    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })

    // Should not throw, isLocked stays false
    expect(result.current.isLocked).toBe(false)
  })

  it('handles unsupported browser', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })

    expect(result.current.isLocked).toBe(false)
  })

  it('registers visibilitychange listener for reacquisition', async () => {
    // Verify the hook registers a visibilitychange listener
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useWakeLock())

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
