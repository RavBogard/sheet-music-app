import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

import { useWakeLock, KEEP_AWAKE_INTENT_KEY } from '@/hooks/use-wake-lock'

/** Shared visibility stub — the hook branches on this in three places. */
function setDocumentVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    writable: true,
    configurable: true,
    value: state,
  })
}

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
    // The hook persists arm/disarm intent (2026-08-31). Tests share one jsdom
    // origin, so a leftover '1'/'0' from a prior test would silently change
    // what a later `armOnMount` mount does.
    try {
      window.localStorage.clear()
    } catch {
      /* storage unavailable in this env — the hook tolerates that too */
    }
    setDocumentVisibility('visible')

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

  it('coalesces overlapping acquire attempts into one sentinel', async () => {
    let resolveRequest!: (sentinel: ReturnType<typeof createMockSentinel>) => void
    const sentinel = createMockSentinel()
    requestSpy.mockImplementation(
      () => new Promise(resolve => {
        resolveRequest = resolve
      }),
    )

    const { result } = renderHook(() => useWakeLock())

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.requestWakeLock()
      second = result.current.ensureLock()
    })

    expect(requestSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRequest(sentinel)
      await Promise.all([first, second])
    })

    expect(result.current.isLocked).toBe(true)
    await act(async () => {
      await result.current.releaseWakeLock()
    })
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('releases an acquire that resolves after the musician turns keep-awake off', async () => {
    let resolveRequest!: (sentinel: ReturnType<typeof createMockSentinel>) => void
    const sentinel = createMockSentinel()
    requestSpy.mockImplementation(
      () => new Promise(resolve => {
        resolveRequest = resolve
      }),
    )

    const { result } = renderHook(() => useWakeLock())

    let pending!: Promise<void>
    act(() => {
      pending = result.current.requestWakeLock()
    })
    await act(async () => {
      await result.current.releaseWakeLock()
    })

    await act(async () => {
      resolveRequest(sentinel)
      await pending
    })

    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(result.current.isArmed).toBe(false)
    expect(result.current.isLocked).toBe(false)
    expect(window.localStorage.getItem(KEEP_AWAKE_INTENT_KEY)).toBe('0')
  })

  it('does not show a late rejection after the musician turns keep-awake off', async () => {
    let rejectRequest!: (error: DOMException) => void
    requestSpy.mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectRequest = reject
      }),
    )

    const { result } = renderHook(() => useWakeLock())

    let pending!: Promise<void>
    act(() => {
      pending = result.current.requestWakeLock()
    })
    await act(async () => {
      await result.current.releaseWakeLock()
    })
    await act(async () => {
      rejectRequest(new DOMException('Denied', 'NotAllowedError'))
      await pending
    })

    expect(result.current.isArmed).toBe(false)
    expect(result.current.isLocked).toBe(false)
    expect(result.current.lastError).toBeNull()
  })

  it('releases an acquire that resolves after the Perform surface unmounts', async () => {
    let resolveRequest!: (sentinel: ReturnType<typeof createMockSentinel>) => void
    const sentinel = createMockSentinel()
    requestSpy.mockImplementation(
      () => new Promise(resolve => {
        resolveRequest = resolve
      }),
    )

    const { result, unmount } = renderHook(() => useWakeLock())

    let pending!: Promise<void>
    act(() => {
      pending = result.current.requestWakeLock()
    })
    unmount()

    await act(async () => {
      resolveRequest(sentinel)
      await pending
    })

    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale release event after a replacement sentinel is active', async () => {
    const releaseHandlers: Array<() => void> = []
    const createTrackedSentinel = () => ({
      release: vi.fn(() => Promise.resolve()),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'release') releaseHandlers.push(handler)
      }),
      released: false,
      type: 'screen',
    })
    const firstSentinel = createTrackedSentinel()
    const secondSentinel = createTrackedSentinel()
    requestSpy
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel)

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })

    firstSentinel.released = true
    await act(async () => {
      await result.current.ensureLock()
    })
    expect(result.current.isLocked).toBe(true)

    act(() => {
      releaseHandlers[0]?.()
    })

    expect(result.current.isLocked).toBe(true)
    await act(async () => {
      await result.current.releaseWakeLock()
    })
    expect(secondSentinel.release).toHaveBeenCalledTimes(1)
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

  // M3-001 (cycle-11, 2026-05-28): the prior path swallowed NotAllowedError
  // to a debug log, leaving KeepAwakeToggle to optimistically flip its
  // visual state while the underlying lock never engaged (Yizkor-class
  // silent failure). The hook now surfaces a reactive `lastError` verdict
  // so the toggle can render an inline alert + suppress the engaged state.
  describe('M3-001 — lastError reactive failure verdict', () => {
    afterEach(() => {
      setDocumentVisibility('visible')
    })

    it('lastError starts null', async () => {
      const { result } = renderHook(() => useWakeLock())
      await act(async () => {})
      expect(result.current.lastError).toBeNull()
    })

    // AC1: handler called while visibilityState==='hidden' → aria-pressed
    // stays false (verified via KeepAwakeToggle test) + lastError='hidden'.
    it('sets lastError="hidden" when the document is hidden at request time', async () => {
      setDocumentVisibility('hidden')
      const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
      requestSpy.mockRejectedValue(notAllowed)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      expect(result.current.isLocked).toBe(false)
      expect(result.current.lastError).toBe('hidden')
    })

    it('sets lastError="denied" on NotAllowedError when the document is visible', async () => {
      setDocumentVisibility('visible')
      const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
      requestSpy.mockRejectedValue(notAllowed)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      expect(result.current.lastError).toBe('denied')
    })

    // AC2: a successful acquire flips aria-pressed true (engaged) and
    // clears any stale lastError.
    it('clears lastError on a subsequent successful acquire', async () => {
      // First attempt fails ('denied').
      const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
      requestSpy.mockRejectedValueOnce(notAllowed)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })
      expect(result.current.lastError).toBe('denied')

      // Second attempt succeeds (default spy resolves a sentinel).
      await act(async () => {
        await result.current.requestWakeLock()
      })
      expect(result.current.lastError).toBeNull()
      expect(result.current.isLocked).toBe(true)
    })

    it('clears lastError on releaseWakeLock()', async () => {
      const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
      requestSpy.mockRejectedValue(notAllowed)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })
      expect(result.current.lastError).toBe('denied')

      await act(async () => {
        await result.current.releaseWakeLock()
      })
      expect(result.current.lastError).toBeNull()
    })

    it('dismissWakeLockError clears the verdict explicitly', async () => {
      const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
      requestSpy.mockRejectedValue(notAllowed)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })
      expect(result.current.lastError).toBe('denied')

      act(() => {
        result.current.dismissWakeLockError()
      })
      expect(result.current.lastError).toBeNull()
    })
  })

  /**
   * THE regression test for the 2026-08-31 killer bug.
   *
   * The release-on-unmount effect carried `[wakeLock]` deps while the live
   * sentinel lived in state. React runs an effect's cleanup on every dep
   * change, so the FIRST successful acquire ran that cleanup and executed
   * `shouldLockRef.current = false` — permanently disarming the
   * visibilitychange re-acquire path at the exact moment it started
   * mattering. Symptom in the room: the toggle says "Screen on", the iPad is
   * app-switched or lock-screened once, and from then on the screen sleeps
   * mid-service with the UI still claiming the lock is held.
   *
   * Every pre-existing test passed against that bug, because none of them
   * fired a visibilitychange AFTER a successful acquire. This one does.
   */
  it('re-acquires on visibilitychange AFTER a successful acquire (bug: cleanup effect disarmed shouldLockRef)', async () => {
    const sentinel = createMockSentinel()
    requestSpy.mockResolvedValue(sentinel)

    const { result } = renderHook(() => useWakeLock())

    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(result.current.isLocked).toBe(true)

    // iOS drops a held screen lock whenever the document hides (lock screen,
    // app switch). The sentinel reports itself released and fires its event.
    sentinel.released = true
    act(() => {
      releaseHandler?.()
    })
    expect(result.current.isLocked).toBe(false)

    setDocumentVisibility('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Hidden documents are refused — the hook must not even try.
    expect(requestSpy).toHaveBeenCalledTimes(1)

    // Back to the chart. THIS is the re-acquire the bug killed.
    sentinel.released = false
    setDocumentVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(
      requestSpy,
      'a second wakeLock.request must fire when the tab becomes visible again with the intent still armed',
    ).toHaveBeenCalledTimes(2)
    expect(result.current.isLocked).toBe(true)
  })

  it('surfaces a failed foreground re-acquire and recovers on the next tap', async () => {
    const firstSentinel = createMockSentinel()
    const recoveredSentinel = createMockSentinel()
    requestSpy
      .mockResolvedValueOnce(firstSentinel)
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce(recoveredSentinel)

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })

    firstSentinel.released = true
    act(() => {
      releaseHandler?.()
    })
    expect(result.current.isLocked).toBe(false)

    setDocumentVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current.isArmed).toBe(true)
    expect(result.current.isLocked).toBe(false)
    expect(result.current.lastError).toBe('denied')

    await act(async () => {
      await result.current.requestWakeLock()
    })

    expect(result.current.isLocked).toBe(true)
    expect(result.current.lastError).toBeNull()
  })

  it('does NOT stack a second sentinel when the first survived the visibility change', async () => {
    const sentinel = createMockSentinel()
    requestSpy.mockResolvedValue(sentinel)

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)

    // Chromium/desktop: the lock is still held across a visibility round-trip.
    setDocumentVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(requestSpy).toHaveBeenCalledTimes(1)
  })

  it('never re-acquires after an explicit release (disarmed intent)', async () => {
    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    await act(async () => {
      await result.current.releaseWakeLock()
    })
    const callsAfterRelease = requestSpy.mock.calls.length

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(requestSpy).toHaveBeenCalledTimes(callsAfterRelease)
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

/**
 * Durable intent + auto-arm + one-shot gesture retry (2026-08-31).
 *
 * The behaviour these pin, in the room: a musician taps "Keep screen on"
 * once, ever. The intent survives a reload, an iPadOS eviction of a
 * backgrounded Home-Screen app, and navigating between charts — and opening a
 * chart at all is enough to arm it in the first place. Turning it OFF is an
 * explicit decision and is remembered as one, so auto-arm never overrides it.
 */
describe('useWakeLock — durable intent, auto-arm, gesture retry', () => {
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
    try {
      window.localStorage.clear()
    } catch {
      /* noop */
    }
    setDocumentVisibility('visible')
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: { request: requestSpy },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setDocumentVisibility('visible')
  })

  it('persists armed intent to localStorage on requestWakeLock()', async () => {
    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })

    expect(window.localStorage.getItem(KEEP_AWAKE_INTENT_KEY)).toBe('1')
    expect(result.current.isArmed).toBe(true)
  })

  it('records an explicit disarm as "0" on releaseWakeLock()', async () => {
    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    await act(async () => {
      await result.current.releaseWakeLock()
    })

    // NOT removed — a cleared key is indistinguishable from "never decided",
    // and auto-arm would quietly turn the lock back on at the next mount.
    expect(window.localStorage.getItem(KEEP_AWAKE_INTENT_KEY)).toBe('0')
    expect(result.current.isArmed).toBe(false)
  })

  it('restores a stored armed intent on mount and acquires immediately (survives reload/eviction)', async () => {
    window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

    const { result } = renderHook(() => useWakeLock({ armOnMount: true }))
    await act(async () => {})

    expect(requestSpy).toHaveBeenCalledWith('screen')
    expect(result.current.isLocked).toBe(true)
    expect(result.current.isArmed).toBe(true)
  })

  it('auto-arms on mount when nothing is stored (kills the per-service ritual)', async () => {
    const { result } = renderHook(() => useWakeLock({ armOnMount: true }))
    await act(async () => {})

    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(result.current.isLocked).toBe(true)
    expect(window.localStorage.getItem(KEEP_AWAKE_INTENT_KEY)).toBe('1')
  })

  it('honours a stored explicit disarm — auto-arm does NOT override the musician', async () => {
    window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '0')

    const { result } = renderHook(() => useWakeLock({ armOnMount: true }))
    await act(async () => {})

    expect(requestSpy).not.toHaveBeenCalled()
    expect(result.current.isArmed).toBe(false)
  })

  it('never touches the WakeLock API on mount without armOnMount (FU-c12-3 anon-landing property)', async () => {
    window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

    renderHook(() => useWakeLock())
    await act(async () => {})

    expect(requestSpy).not.toHaveBeenCalled()
  })

  it('is fully inert when enabled=false (a KeepAwakeProvider owns the sentinel)', async () => {
    window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, '1')

    const { result } = renderHook(() =>
      useWakeLock({ armOnMount: true, enabled: false }),
    )
    await act(async () => {})
    expect(requestSpy).not.toHaveBeenCalled()

    // Even an explicit request must not mint a second, competing sentinel.
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(requestSpy).not.toHaveBeenCalled()
    expect(result.current.isLocked).toBe(false)
  })

  it('retries once on the next pointerdown when the mount-time arm is refused', async () => {
    const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
    requestSpy.mockRejectedValueOnce(notAllowed)

    const { result } = renderHook(() => useWakeLock({ armOnMount: true }))
    await act(async () => {})

    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(result.current.isLocked).toBe(false)

    // The first touch anywhere carries transient user activation.
    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestSpy).toHaveBeenCalledTimes(2)
    expect(result.current.isLocked).toBe(true)

    // ONE-SHOT: a second touch must not fire a third request.
    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestSpy).toHaveBeenCalledTimes(2)
  })

  it('registers the pointerdown retry when an explicit request is refused too', async () => {
    const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
    requestSpy.mockRejectedValueOnce(notAllowed)

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestSpy).toHaveBeenCalledTimes(2)
    expect(result.current.isLocked).toBe(true)
  })

  it('does not retry on pointerdown after the intent was disarmed', async () => {
    const notAllowed = new DOMException('Not allowed', 'NotAllowedError')
    requestSpy.mockRejectedValueOnce(notAllowed)

    const { result } = renderHook(() => useWakeLock())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    await act(async () => {
      await result.current.releaseWakeLock()
    })

    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestSpy).toHaveBeenCalledTimes(1)
  })

  it('tolerates a localStorage that throws (iOS private mode) without losing the lock', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })

    const { result } = renderHook(() => useWakeLock({ armOnMount: true }))
    await act(async () => {})

    // Unreadable storage reads as "never decided" → auto-arm still happens,
    // and the unwritable persist must not throw out of the effect.
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(result.current.isLocked).toBe(true)

    await act(async () => {
      await result.current.releaseWakeLock()
    })
    expect(result.current.isLocked).toBe(false)
  })

  describe('ensureLock — belt-and-braces self-heal', () => {
    it('no-ops while the sentinel is healthy', async () => {
      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      await act(async () => {
        await result.current.ensureLock()
      })
      expect(requestSpy).toHaveBeenCalledTimes(1)
    })

    it('re-acquires a sentinel the OS dropped without telling us', async () => {
      const sentinel = createMockSentinel()
      requestSpy.mockResolvedValue(sentinel)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      // No release event fired — this is the silent-drop case the 30s
      // heartbeat exists for.
      sentinel.released = true

      await act(async () => {
        await result.current.ensureLock()
      })
      expect(requestSpy).toHaveBeenCalledTimes(2)
    })

    it('does nothing when the intent was never armed', async () => {
      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.ensureLock()
      })
      expect(requestSpy).not.toHaveBeenCalled()
    })

    it('throttles repeated attempts (pointerdown self-heal cannot storm the API)', async () => {
      const sentinel = createMockSentinel()
      requestSpy.mockResolvedValue(sentinel)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      sentinel.released = true
      await act(async () => {
        await result.current.ensureLock({ throttleMs: 30_000 })
      })
      expect(requestSpy).toHaveBeenCalledTimes(2)

      // Still dropped, but inside the throttle window → no second attempt.
      sentinel.released = true
      await act(async () => {
        await result.current.ensureLock({ throttleMs: 30_000 })
      })
      expect(requestSpy).toHaveBeenCalledTimes(2)
    })

    it('does not attempt while the document is hidden', async () => {
      const sentinel = createMockSentinel()
      requestSpy.mockResolvedValue(sentinel)

      const { result } = renderHook(() => useWakeLock())
      await act(async () => {
        await result.current.requestWakeLock()
      })

      sentinel.released = true
      setDocumentVisibility('hidden')
      await act(async () => {
        await result.current.ensureLock()
      })
      expect(requestSpy).toHaveBeenCalledTimes(1)
    })
  })
})

/**
 * Probe-harness sentinel exposure (ipad-wake-lock-toggle-fix 2026-05-24).
 *
 * `useWakeLock` reads `process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH` at module
 * load to decide whether to mirror the live `WakeLockSentinel` into
 * `window.__c7_wakeLockSentinel__`. Each test in this block dynamically
 * re-imports the module under a fresh env stub so the module-top const
 * picks up the right flag value. Without this flag the slot must never
 * appear on `window` (production builds rely on that posture).
 *
 * Background: the prior Playwright shim-counter assertion was bypassed by
 * Playwright-WebKit's JIT/binding in ~25-40% of runs from React onClick
 * sites (see `.paul/research/ipad-wake-lock-toggle-fix/DIAGNOSIS.md`).
 * The harness now reads the sentinel object directly — these tests pin
 * the contract the spec depends on.
 */
describe('useWakeLock — probe-harness sentinel exposure', () => {
  type WakeLockWindow = Window & { __c7_wakeLockSentinel__?: WakeLockSentinel | null }

  let releaseHandler: (() => void) | null = null

  function installMockNavigatorWakeLock(): { sentinel: ReturnType<typeof createMockSentinel> } {
    const sentinel = createMockSentinel()
    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      configurable: true,
      value: { request: vi.fn(() => Promise.resolve(sentinel)) },
    })
    return { sentinel }
  }

  function createMockSentinel() {
    return {
      release: vi.fn(() => Promise.resolve()),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'release') releaseHandler = handler
      }),
      released: false,
      type: 'screen' as const,
    }
  }

  beforeEach(() => {
    releaseHandler = null
    delete (window as WakeLockWindow).__c7_wakeLockSentinel__
    vi.resetModules()
    // resetModules wipes module mocks too — re-install the logger mock so
    // the freshly-imported hook still has its logger silenced.
    vi.doMock('@/lib/logger', () => ({
      logger: {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as WakeLockWindow).__c7_wakeLockSentinel__
  })

  it('exposes the sentinel to window when NEXT_PUBLIC_PROBE_HARNESS_AUTH=1 (post-acquire)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PROBE_HARNESS_AUTH', '1')
    const { useWakeLock: useWakeLockFlagged } = await import('@/hooks/use-wake-lock')
    const { sentinel } = installMockNavigatorWakeLock()

    const { result } = renderHook(() => useWakeLockFlagged())

    expect(
      (window as WakeLockWindow).__c7_wakeLockSentinel__,
      'window slot must be absent before any acquire (must be undefined, not null)',
    ).toBeUndefined()

    await act(async () => {
      await result.current.requestWakeLock()
    })

    const exposed = (window as WakeLockWindow).__c7_wakeLockSentinel__
    expect(exposed, 'window slot must hold the live sentinel after acquire').toBe(sentinel)
    expect(exposed?.released, 'exposed sentinel must report released=false while held').toBe(false)
    expect(exposed?.type, 'exposed sentinel must report type="screen"').toBe('screen')
  })

  it('clears the window slot (null) when the sentinel fires its release event', async () => {
    vi.stubEnv('NEXT_PUBLIC_PROBE_HARNESS_AUTH', '1')
    const { useWakeLock: useWakeLockFlagged } = await import('@/hooks/use-wake-lock')
    installMockNavigatorWakeLock()

    const { result } = renderHook(() => useWakeLockFlagged())

    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect((window as WakeLockWindow).__c7_wakeLockSentinel__, 'sentinel exposed').toBeTruthy()

    // System-side release (lock screen, tab hidden in some browsers, etc.)
    act(() => {
      releaseHandler?.()
    })

    expect(
      (window as WakeLockWindow).__c7_wakeLockSentinel__,
      'window slot must be null after sentinel release (the slot stays present so probes can distinguish "not exposed yet" from "released"; null = released)',
    ).toBeNull()
  })

  it('clears the window slot when releaseWakeLock() is called explicitly', async () => {
    vi.stubEnv('NEXT_PUBLIC_PROBE_HARNESS_AUTH', '1')
    const { useWakeLock: useWakeLockFlagged } = await import('@/hooks/use-wake-lock')
    installMockNavigatorWakeLock()

    const { result } = renderHook(() => useWakeLockFlagged())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect((window as WakeLockWindow).__c7_wakeLockSentinel__, 'sentinel exposed').toBeTruthy()

    await act(async () => {
      await result.current.releaseWakeLock()
    })

    expect(
      (window as WakeLockWindow).__c7_wakeLockSentinel__,
      'window slot must be null after explicit release',
    ).toBeNull()
  })

  it('clears the window slot on unmount (held-while-mounted path)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PROBE_HARNESS_AUTH', '1')
    const { useWakeLock: useWakeLockFlagged } = await import('@/hooks/use-wake-lock')
    installMockNavigatorWakeLock()

    const { result, unmount } = renderHook(() => useWakeLockFlagged())
    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect((window as WakeLockWindow).__c7_wakeLockSentinel__, 'sentinel exposed').toBeTruthy()

    unmount()

    expect(
      (window as WakeLockWindow).__c7_wakeLockSentinel__,
      'window slot must be null after unmount cleanup',
    ).toBeNull()
  })

  it('never exposes the sentinel when the flag is unset (production posture)', async () => {
    // Explicitly stub to NOT '1' — covers both unset and any non-'1' value.
    vi.stubEnv('NEXT_PUBLIC_PROBE_HARNESS_AUTH', '')
    const { useWakeLock: useWakeLockUnflagged } = await import('@/hooks/use-wake-lock')
    installMockNavigatorWakeLock()

    const { result, unmount } = renderHook(() => useWakeLockUnflagged())

    await act(async () => {
      await result.current.requestWakeLock()
    })
    expect(
      (window as WakeLockWindow).__c7_wakeLockSentinel__,
      'window slot must remain absent in non-probe builds — never expose internal state to prod surface',
    ).toBeUndefined()

    await act(async () => {
      await result.current.releaseWakeLock()
    })
    unmount()
    expect((window as WakeLockWindow).__c7_wakeLockSentinel__).toBeUndefined()
  })
})
