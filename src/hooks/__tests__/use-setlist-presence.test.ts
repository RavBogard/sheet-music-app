import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'user-1', displayName: 'Test User', photoURL: null },
  })),
}))

const mockWritePresence = vi.fn()
const mockRemovePresence = vi.fn()
const mockSubscribeToPresence = vi.fn((_a: unknown, _b: unknown) => vi.fn()) // returns unsub

vi.mock('@/lib/setlist-live', () => ({
  writePresence: (_a: unknown, _b: unknown, _c: unknown) => mockWritePresence(_a, _b, _c),
  removePresence: (_a: unknown, _b: unknown) => mockRemovePresence(_a, _b),
  subscribeToPresence: (_a: unknown, _b: unknown) => mockSubscribeToPresence(_a, _b),
}))

vi.mock('@/lib/store', () => ({
  useMusicStore: vi.fn((selector: (s: { gigModeActive: boolean }) => unknown) =>
    selector({ gigModeActive: false })
  ),
}))

import { useSetlistPresence } from '@/hooks/use-setlist-presence'

describe('useSetlistPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty array when no setlistId', () => {
    const { result } = renderHook(() => useSetlistPresence(null))
    expect(result.current).toEqual([])
  })

  it('writes presence on mount with setlistId', () => {
    renderHook(() => useSetlistPresence('setlist-1', 'editing'))

    expect(mockWritePresence).toHaveBeenCalledWith('setlist-1', 'user-1', expect.objectContaining({
      uid: 'user-1',
      displayName: 'Test User',
      status: 'editing',
    }))
  })

  it('subscribes to presence updates', () => {
    renderHook(() => useSetlistPresence('setlist-1'))

    expect(mockSubscribeToPresence).toHaveBeenCalledWith('setlist-1', expect.any(Function))
  })

  it('sends heartbeat at regular intervals', () => {
    renderHook(() => useSetlistPresence('setlist-1'))

    // Initial write
    expect(mockWritePresence).toHaveBeenCalledTimes(1)

    // Advance 30 seconds (HEARTBEAT_MS)
    vi.advanceTimersByTime(30_000)
    expect(mockWritePresence).toHaveBeenCalledTimes(2)

    // Another heartbeat
    vi.advanceTimersByTime(30_000)
    expect(mockWritePresence).toHaveBeenCalledTimes(3)
  })

  it('removes presence on unmount', () => {
    const { unmount } = renderHook(() => useSetlistPresence('setlist-1'))

    unmount()

    expect(mockRemovePresence).toHaveBeenCalledWith('setlist-1', 'user-1')
  })

  it('clears interval on unmount', () => {
    const { unmount } = renderHook(() => useSetlistPresence('setlist-1'))
    const clearSpy = vi.spyOn(global, 'clearInterval')

    unmount()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('registers beforeunload and visibilitychange listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const docAddSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useSetlistPresence('setlist-1'))

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))
    expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    addSpy.mockRestore()
    docAddSpy.mockRestore()
  })
})
