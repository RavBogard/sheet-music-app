import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

// v50-07-03: hook now uses collection/query/where/onSnapshot for the
// top-level tracks dual-read. The snapshot callback is captured via
// `onSnapshotEmit` so individual tests can drive deliveries deterministically.
let onSnapshotEmit: ((snap: { docs: Array<{ id: string; data: () => unknown }> }) => void) | null = null
let onSnapshotError: ((err: Error) => void) | null = null
const mockUnsub = vi.fn()
const mockOnSnapshot = vi.fn(
  (
    _q: unknown,
    onNext: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void,
    onErr?: (err: Error) => void,
  ) => {
    onSnapshotEmit = onNext
    onSnapshotError = onErr ?? null
    return mockUnsub
  },
)

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  onSnapshot: (
    q: unknown,
    onNext: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void,
    onErr?: (err: Error) => void,
  ) => mockOnSnapshot(q, onNext, onErr),
}))

const mockUseAuth = vi.fn((): { user: unknown; isAdmin: boolean; isBandLeader: boolean } => ({
  user: { uid: 'user-1', displayName: 'Test User' },
  isAdmin: false,
  isBandLeader: false,
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockUseSafeFirestoreSync = vi.fn((): { data: unknown; loading: boolean; error: unknown } => ({
  data: null,
  loading: true,
  error: null,
}))
vi.mock('@/hooks/use-safe-firestore-sync', () => ({
  useSafeFirestoreSync: () => mockUseSafeFirestoreSync(),
}))

const mockRequestWakeLock = vi.fn()
vi.mock('@/hooks/use-wake-lock', () => ({
  useWakeLock: () => ({
    isLocked: false,
    requestWakeLock: mockRequestWakeLock,
    releaseWakeLock: vi.fn(),
  }),
}))

vi.mock('@/lib/musician-profile', () => ({
  subscribeToMusicianProfile: vi.fn(() => vi.fn()), // returns unsub
}))

import { useSetlistPerformance } from '@/hooks/use-setlist-performance'

describe('useSetlistPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onSnapshotEmit = null
    onSnapshotError = null
    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1', displayName: 'Test User' },
      isAdmin: false,
      isBandLeader: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: null,
      loading: true,
      error: null,
    })
  })

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.loading).toBe(true)
    expect(result.current.tracks).toEqual([])
    expect(result.current.name).toBe('Untitled')
  })

  it('extracts tracks and name from setlist data', () => {
    const mockTracks = [{ id: 't1', title: 'Song A' }]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', name: 'Friday Service', tracks: mockTracks, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.tracks).toEqual(mockTracks)
    expect(result.current.name).toBe('Friday Service')
    expect(result.current.loading).toBe(false)
  })

  it('requests wake lock on mount', () => {
    renderHook(() => useSetlistPerformance('setlist-1'))
    expect(mockRequestWakeLock).toHaveBeenCalled()
  })

  it('identifies leader status for admin', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-1', displayName: 'Admin' },
      isAdmin: true,
      isBandLeader: false,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.isLeader).toBe(true)
  })

  it('identifies leader status for band leader', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'leader-1', displayName: 'Leader' },
      isAdmin: false,
      isBandLeader: true,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.isLeader).toBe(true)
  })

  it('identifies non-leader', () => {
    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.isLeader).toBe(false)
  })

  it('identifies public view when no user', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      isBandLeader: false,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.isPublicView).toBe(true)
  })

  it('currentTrackIndex is always -1 (live stepping removed)', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        tracks: [],
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.currentTrackIndex).toBe(-1)
  })

  it('extracts musicians from setlist data', () => {
    const mockMusicians = [{ uid: 'u1', name: 'Musician' }]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', tracks: [], musicians: mockMusicians },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.musicians).toEqual(mockMusicians)
  })

  // ── v50-07-03 dual-read: top-level tracks/{id} subscription ──────────────────

  it('falls back to legacy embedded tracks when top-level subscription is empty', () => {
    const legacyTracks = [{ id: 'leg-1', title: 'Legacy Song' }]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', tracks: legacyTracks, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Subscription mounted but never emitted → topLevelTracks stays empty.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    expect(result.current.tracks).toEqual(legacyTracks)
  })

  it('prefers top-level tracks (sorted by order) when the subscription has docs', () => {
    const legacyTracks = [{ id: 'leg-1', title: 'Stale Legacy Song' }]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', tracks: legacyTracks, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    act(() => {
      onSnapshotEmit?.({
        docs: [
          { id: 'tl-2', data: () => ({ order: 1, title: 'Second' }) },
          { id: 'tl-1', data: () => ({ order: 0, title: 'First' }) },
          { id: 'tl-3', data: () => ({ order: 2, title: 'Third' }) },
        ],
      })
    })

    expect(result.current.tracks).toHaveLength(3)
    expect(result.current.tracks.map((t) => t.id)).toEqual([
      'tl-1',
      'tl-2',
      'tl-3',
    ])
    expect(result.current.tracks.map((t) => (t as { title: string }).title)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('updates tracks state when the top-level subscription re-emits', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    act(() => {
      onSnapshotEmit?.({
        docs: [{ id: 'tl-1', data: () => ({ order: 0, title: 'Initial' }) }],
      })
    })
    expect(result.current.tracks).toHaveLength(1)
    expect((result.current.tracks[0] as { title: string }).title).toBe('Initial')

    act(() => {
      onSnapshotEmit?.({
        docs: [
          { id: 'tl-1', data: () => ({ order: 0, title: 'Initial' }) },
          { id: 'tl-2', data: () => ({ order: 1, title: 'Added Later' }) },
        ],
      })
    })
    expect(result.current.tracks).toHaveLength(2)
    expect((result.current.tracks[1] as { title: string }).title).toBe('Added Later')
  })

  it('unsubscribes from the top-level tracks query on unmount', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    const { unmount } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    expect(mockUnsub).not.toHaveBeenCalled()

    unmount()
    expect(mockUnsub).toHaveBeenCalledTimes(1)
  })

  // v5h-01-03: hydrated-trust dual-read + onSnapshot resubscribe-once.
  // These tests reproduce Daniel's UAT save-loss scenario at the hook level:
  // the editor's edit landed in top-level `tracks/{id}` but perf-view kept
  // showing stale embedded data. Two failure modes — (a) embedded fallback
  // wins on hydrated setlists; (b) onSnapshot dies on permission-denied
  // and never resubscribes.
  it('prefers top-level over embedded when setlist is hydrated', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        hydrated: true,
        tracks: [
          { id: 't1', title: 'Modeh Ani', key: 'C', order: 0 },
          { id: 't2', title: 'Adon Olam', key: 'D', order: 1 },
          { id: 't3', title: 'Lecha Dodi', key: 'E', order: 2 },
        ],
        musicians: [],
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Top-level delivers ONE row (the user's recent edit).
    act(() => {
      onSnapshotEmit?.({
        docs: [
          {
            id: 't1',
            data: () => ({ id: 't1', title: 'Modeh Ani', key: 'E', order: 0 }),
          },
        ],
      })
    })

    // Hydrated setlist: top-level wins, embedded array is ignored entirely.
    expect(result.current.tracks).toHaveLength(1)
    expect((result.current.tracks[0] as { key: string }).key).toBe('E')
  })

  it('falls back to embedded when setlist is NOT hydrated and top-level is empty', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        hydrated: false,
        tracks: [
          { id: 't1', title: 'Modeh Ani', key: 'C', order: 0 },
          { id: 't2', title: 'Adon Olam', key: 'D', order: 1 },
          { id: 't3', title: 'Lecha Dodi', key: 'E', order: 2 },
        ],
        musicians: [],
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Top-level delivers EMPTY (lazy cascade hasn't fired or hasn't completed).
    act(() => {
      onSnapshotEmit?.({ docs: [] })
    })

    // Unhydrated setlist: embedded fallback engaged.
    expect(result.current.tracks).toHaveLength(3)
    expect((result.current.tracks[0] as { key: string }).key).toBe('C')
  })

  it('resubscribes once with a 1s delay when onSnapshot errors, then succeeds', () => {
    vi.useFakeTimers()
    try {
      mockUseSafeFirestoreSync.mockReturnValue({
        data: {
          id: 'setlist-1',
          hydrated: true,
          tracks: [],
          musicians: [],
        },
        loading: false,
        error: null,
      })

      const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

      // Initial subscription errors (e.g., permission-denied).
      act(() => {
        onSnapshotError?.(new Error('permission-denied'))
      })
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1) // No resubscribe yet.
      expect(result.current.tracks).toEqual([]) // Cleared.

      // Advance the 1s retry timer.
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2) // Resubscribed.

      // The fresh subscription succeeds.
      act(() => {
        onSnapshotEmit?.({
          docs: [
            {
              id: 't1',
              data: () => ({ id: 't1', title: 'Modeh Ani', key: 'E', order: 0 }),
            },
          ],
        })
      })
      expect(result.current.tracks).toHaveLength(1)
      expect((result.current.tracks[0] as { key: string }).key).toBe('E')

      // Second error: budget exhausted, no third subscription.
      act(() => {
        onSnapshotError?.(new Error('permission-denied'))
        vi.advanceTimersByTime(1000)
      })
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2) // Stayed at 2.
    } finally {
      vi.useRealTimers()
    }
  })
})
