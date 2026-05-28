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

  // M3-001 (cycle-11, 2026-05-28): the prior path swallowed NotAllowedError
  // to a debug log, leaving KeepAwakeToggle to optimistically flip its
  // visual state while the underlying lock never engaged (Yizkor-class
  // silent failure). The hook now surfaces a reactive `lastError` verdict
  // so the toggle can render an inline alert + suppress the engaged state.
  describe('M3-001 — lastError reactive failure verdict', () => {
    function setDocumentVisibility(state: 'visible' | 'hidden') {
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: state,
      })
    }

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
