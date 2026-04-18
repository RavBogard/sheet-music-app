import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const mockUseAuth = vi.fn((): { user: { uid: string } | null } => ({
  user: { uid: 'user-1' },
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }))

// Mutable auth mock — needed because the module reads auth.currentUser inside timers
const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'user-1' } }
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: mockAuth,
}))

const mockMonitorStoreState = {
  userId: null as string | null,
  reset: vi.fn(),
  setConfig: vi.fn(),
  setSnapshot: vi.fn(),
  setStatus: vi.fn(),
}
vi.mock('@/lib/monitor-store', () => ({
  useMonitorStore: { getState: () => mockMonitorStoreState },
}))

const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
vi.mock('@/lib/firestore-monitor-client', () => ({
  FirestoreMonitorClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}))

const mockConfigUnsub = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'config/monitor' })),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: unknown) => void) => {
    onNext({ exists: () => false })
    return mockConfigUnsub
  }),
}))

let onAuthCallback: ((user: { uid: string } | null) => void) | null = null
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
    onAuthCallback = cb as (user: { uid: string } | null) => void
    return vi.fn()
  }),
}))

// IMPORTANT: Dynamic import to reset module-level singleton state per test
let useMonitorConnection: typeof import('@/hooks/use-monitor-connection').useMonitorConnection

describe('useMonitorConnection', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    onAuthCallback = null
    mockAuth.currentUser = { uid: 'user-1' }
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } })

    // Reset module to clear singleton state (activeClient, refCount, etc.)
    vi.resetModules()
    const mod = await import('@/hooks/use-monitor-connection')
    useMonitorConnection = mod.useMonitorConnection
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null client when no user', () => {
    mockUseAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useMonitorConnection())
    // No connection established
    expect(mockConnect).not.toHaveBeenCalled()
    expect(result.current.client).toBeNull()
  })

  it('establishes connection on first mount with user', () => {
    renderHook(() => useMonitorConnection())
    expect(mockConnect).toHaveBeenCalledTimes(1)
  })

  it('idempotent — second mount with same user does not reconnect', () => {
    renderHook(() => useMonitorConnection())
    renderHook(() => useMonitorConnection())
    expect(mockConnect).toHaveBeenCalledTimes(1)
  })

  it('ref counting — two mounts, one unmount does not tear down', () => {
    const hook1 = renderHook(() => useMonitorConnection())
    renderHook(() => useMonitorConnection())

    hook1.unmount()
    vi.advanceTimersByTime(6000)

    // Still one consumer mounted — no teardown
    expect(mockDisconnect).not.toHaveBeenCalled()
  })

  it('debounced teardown after last consumer unmounts (5s timer)', () => {
    const hook1 = renderHook(() => useMonitorConnection())
    expect(mockConnect).toHaveBeenCalledTimes(1)

    hook1.unmount()

    // Before 5s debounce: still alive
    vi.advanceTimersByTime(4000)
    expect(mockDisconnect).not.toHaveBeenCalled()

    // After 5s: torn down
    vi.advanceTimersByTime(2000)
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockMonitorStoreState.reset).toHaveBeenCalled()
  })

  it('auth sign-out with 3s debounce before teardown', () => {
    renderHook(() => useMonitorConnection())
    expect(mockConnect).toHaveBeenCalledTimes(1)

    // Simulate auth reporting null (sign-out)
    mockAuth.currentUser = null
    onAuthCallback?.(null)

    // Before 3s: no teardown
    vi.advanceTimersByTime(2000)
    expect(mockDisconnect).not.toHaveBeenCalled()

    // After 3s: teardown (auth.currentUser is still null)
    vi.advanceTimersByTime(2000)
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('auth restored within 3s cancels teardown', () => {
    renderHook(() => useMonitorConnection())

    // Sign out
    mockAuth.currentUser = null
    onAuthCallback?.(null)
    vi.advanceTimersByTime(2000)

    // Sign back in before 3s
    mockAuth.currentUser = { uid: 'user-1' }
    onAuthCallback?.({ uid: 'user-1' })

    // Past 3s mark — should NOT have torn down
    vi.advanceTimersByTime(2000)
    expect(mockDisconnect).not.toHaveBeenCalled()
  })

  it('cleanup unsubscribes config snapshot on teardown', () => {
    const hook1 = renderHook(() => useMonitorConnection())
    hook1.unmount()
    vi.advanceTimersByTime(6000)

    expect(mockConfigUnsub).toHaveBeenCalled()
  })

  it('forced teardown resets monitor store', () => {
    const hook1 = renderHook(() => useMonitorConnection())
    hook1.unmount()
    vi.advanceTimersByTime(6000)

    expect(mockMonitorStoreState.reset).toHaveBeenCalled()
  })

  it('user change establishes new connection', () => {
    const { rerender } = renderHook(() => useMonitorConnection())
    expect(mockConnect).toHaveBeenCalledTimes(1)

    // Change user — new connection established
    // Note: teardown(false) is skipped when refCount > 0 (consumer still mounted)
    // but ensureConnected creates a new client for the new user
    mockUseAuth.mockReturnValue({ user: { uid: 'user-2' } })
    rerender()

    expect(mockConnect).toHaveBeenCalledTimes(2)
  })
})
