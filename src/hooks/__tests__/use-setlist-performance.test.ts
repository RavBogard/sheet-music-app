import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

// v50-07-03 + v5h-01-03: hook subscribes via onSnapshot with
// { includeMetadataChanges: true } and calls getDocsFromServer once per mount
// to force a server roundtrip. Tests capture the next/error callbacks so
// deliveries (including the fromCache metadata flag) can be driven
// deterministically. emitSnapshot helper makes drivers concise.
type SnapDelivery = {
  docs: Array<{ id: string; data: () => unknown }>
  fromCache?: boolean
}
let onSnapshotNext: ((snap: SnapDelivery & { metadata: { fromCache: boolean } }) => void) | null = null
let onSnapshotError: ((err: Error) => void) | null = null
const mockUnsub = vi.fn()
const mockOnSnapshot = vi.fn(
  (
    _q: unknown,
    arg2: unknown,
    arg3?: unknown,
    arg4?: unknown,
  ) => {
    // Hook calls `onSnapshot(q, { includeMetadataChanges: true }, onNext, onError)`.
    // For backward compat, also handle the 3-arg form `(q, onNext, onError)`.
    if (typeof arg2 === 'function') {
      onSnapshotNext = arg2 as typeof onSnapshotNext
      onSnapshotError = (arg3 as typeof onSnapshotError) ?? null
    } else {
      onSnapshotNext = (arg3 as typeof onSnapshotNext) ?? null
      onSnapshotError = (arg4 as typeof onSnapshotError) ?? null
    }
    return mockUnsub
  },
)
function emitSnapshot(d: SnapDelivery) {
  onSnapshotNext?.({
    docs: d.docs,
    metadata: { fromCache: d.fromCache ?? true },
  })
}
// Pre-resolved getDocsFromServer mock — defaults to empty docs.
// Tests that need a different server-fetch result override per-test.
const mockGetDocsFromServer = vi.fn((_q?: unknown) =>
  Promise.resolve({ docs: [] as Array<{ id: string; data: () => unknown }> }),
)

// Legacy alias for tests that drove via onSnapshotEmit before v5h-01-03.
// Delivers the snapshot with fromCache:false (server-fresh) — the listener's
// non-cache delivery flips the gate (in the impl, both getDocsFromServer.then
// and a non-cache listener delivery flip hasServerSnapshot=true).
const onSnapshotEmit = (
  snap: { docs: Array<{ id: string; data: () => unknown }> },
): void => emitSnapshot({ docs: snap.docs, fromCache: false })

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  onSnapshot: (
    q: unknown,
    arg2: unknown,
    arg3?: unknown,
    arg4?: unknown,
  ) => mockOnSnapshot(q, arg2, arg3, arg4),
  getDocsFromServer: (q: unknown) => mockGetDocsFromServer(q),
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
    onSnapshotNext = null
    onSnapshotError = null
    mockGetDocsFromServer.mockResolvedValue({ docs: [] })
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

  // ── v5h-01-03: cache-then-server gate + getDocsFromServer kick + don't-clear-on-error
  // Closes the perf-view staleness Daniel hit during UAT (60s+ + multiple
  // hard refreshes before recent edits showed up). Persistent IDB cache is
  // ON in firebase.ts; the listener delivers stale-cached data first; the
  // dual-read used to swap to top-level on that stale delivery and show
  // pre-edit keys until server-fresh arrived. The fix gates the swap on
  // a confirmed non-fromCache delivery.

  it('does NOT swap to top-level when only a fromCache delivery has arrived (avoids showing stale-cache top-level)', () => {
    const embedded = [
      { id: 'emb-1', title: 'Embedded A', key: 'C' },
      { id: 'emb-2', title: 'Embedded B', key: 'D' },
    ]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', hydrated: true, tracks: embedded, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Simulate Firestore SDK's IDB cache delivering stale top-level docs.
    act(() => {
      emitSnapshot({
        docs: [
          { id: 'tl-stale', data: () => ({ order: 0, title: 'Stale Cached', key: 'STALE' }) },
        ],
        fromCache: true,
      })
    })

    // Gate: hasServerSnapshot is still false → render embedded, NOT the
    // stale top-level cache.
    expect(result.current.tracks).toEqual(embedded)
  })

  it('swaps to top-level once getDocsFromServer resolves with server-fresh data', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        hydrated: true,
        tracks: [{ id: 'emb-1', title: 'Embedded', key: 'OLD' }],
        musicians: [],
      },
      loading: false,
      error: null,
    })

    // getDocsFromServer resolves with the server-fresh snapshot. THIS is
    // the gate signal — not the listener's metadata.fromCache flag (which
    // tracks source, not freshness, and would never flip after the cache
    // is warmed by the same server fetch).
    const serverDocs = [
      { id: 't1', data: () => ({ order: 0, title: 'Modeh Ani', key: 'E' }) },
    ]
    let resolveServer: (snap: { docs: typeof serverDocs }) => void
    const serverPromise = new Promise<{ docs: typeof serverDocs }>((res) => {
      resolveServer = res
    })
    mockGetDocsFromServer.mockReturnValueOnce(serverPromise)

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Pre-server-fresh: embedded is rendered (gate closed).
    expect(result.current.tracks).toEqual([
      { id: 'emb-1', title: 'Embedded', key: 'OLD' },
    ])

    // Listener delivers from cache before server fetch resolves —
    // updates topLevelTracks but should NOT flip the gate.
    act(() => {
      emitSnapshot({
        docs: [{ id: 't1', data: () => ({ order: 0, title: 'Modeh Ani', key: 'OLD' }) }],
        fromCache: true,
      })
    })
    expect((result.current.tracks[0] as { key: string }).key).toBe('OLD')

    // Server fetch resolves with fresh data → gate flips, top-level wins.
    await act(async () => {
      resolveServer!({ docs: serverDocs })
      // Drain microtasks so the promise's .then runs.
      await Promise.resolve()
    })

    expect(result.current.tracks).toHaveLength(1)
    expect((result.current.tracks[0] as { key: string }).key).toBe('E')
  })

  it('returns embedded fallback for hydrated setlists pre-server-fresh even if top-level has cache data (invariant: never blank the UI)', () => {
    // The reverted v5h-01-03 attempt returned [] in this state and broke
    // live setlists. The new gate must NEVER blank the UI when embedded
    // has data — only delay the swap from embedded → top-level.
    const embedded = [
      { id: 'emb-1', title: 'Track A' },
      { id: 'emb-2', title: 'Track B' },
      { id: 'emb-3', title: 'Track C' },
    ]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', hydrated: true, tracks: embedded, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // No deliveries yet — hasServerSnapshot is false. Embedded must render.
    expect(result.current.tracks).toEqual(embedded)
  })

  it('preserves top-level state on subscription error (does NOT clear the displayed tracks)', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        hydrated: true,
        tracks: [{ id: 'emb-1', title: 'Stale Embedded', key: 'OLD' }],
        musicians: [],
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))

    // Server-fresh delivery first to populate top-level + flip gate.
    act(() => {
      emitSnapshot({
        docs: [{ id: 't1', data: () => ({ order: 0, title: 'Live', key: 'E' }) }],
        fromCache: false,
      })
    })
    expect((result.current.tracks[0] as { key: string }).key).toBe('E')

    // Then simulate a transient subscription error.
    act(() => {
      onSnapshotError?.(new Error('transient network blip'))
    })

    // Top-level state must be preserved — UI does not blank to embedded.
    expect((result.current.tracks[0] as { key: string }).key).toBe('E')
  })

  it('kicks getDocsFromServer once per mount to force a server roundtrip', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: 'setlist-1', hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    renderHook(() => useSetlistPerformance('setlist-1'))
    expect(mockGetDocsFromServer).toHaveBeenCalledTimes(1)
  })
})
