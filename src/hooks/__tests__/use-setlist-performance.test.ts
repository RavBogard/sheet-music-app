import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'

import { getDb, resetDbForTests } from '@/lib/local/schema'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
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
  subscribeToMusicianProfile: vi.fn(() => vi.fn()),
}))

// Snapshot-listener: replaced via the test-seam opts.startSnapshotListener
// in tests that exercise listener wiring; default mock prevents accidental
// Firestore boots if anything imports the production export.
vi.mock('@/lib/sync/snapshot-listener', () => ({
  startSnapshotListener: vi.fn(() => () => {}),
}))

import { useSetlistPerformance } from '@/hooks/use-setlist-performance'
import type { LocalTrack } from '@/lib/local/types'

const SETLIST_ID = 'set-perf-1'

function makeLocalTrack(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: overrides.id ?? 't1',
    setlistId: overrides.setlistId ?? SETLIST_ID,
    order: overrides.order ?? 0,
    title: overrides.title ?? 'Sample',
    key: overrides.key,
    updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
    ...overrides,
  }
}

describe('useSetlistPerformance (v5h-01-04: Dexie-backed)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDbForTests()
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

  afterEach(async () => {
    cleanup()
    await resetDbForTests()
  })

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(result.current.loading).toBe(true)
    expect(result.current.tracks).toEqual([])
    expect(result.current.name).toBe('Untitled')
  })

  it('extracts name + service notes + musicians from setlist data', () => {
    const mockMusicians = [{ uid: 'u1', name: 'Musician', email: 'm@x' }]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: SETLIST_ID,
        name: 'Friday Service',
        serviceNotes: 'Wear black',
        musicians: mockMusicians,
        rabbi: 'Daniel',
        tracks: [],
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(result.current.name).toBe('Friday Service')
    expect(result.current.serviceNotes).toBe('Wear black')
    expect(result.current.musicians).toEqual(mockMusicians)
    expect(result.current.rabbi).toBe('Daniel')
  })

  it('requests wake lock on mount', () => {
    renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(mockRequestWakeLock).toHaveBeenCalled()
  })

  it('identifies leader status for admin', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-1', displayName: 'Admin' },
      isAdmin: true,
      isBandLeader: false,
    })
    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(result.current.isLeader).toBe(true)
  })

  it('identifies leader status for band leader', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'leader-1', displayName: 'Leader' },
      isAdmin: false,
      isBandLeader: true,
    })
    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(result.current.isLeader).toBe(true)
  })

  it('identifies public view when no user', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      isBandLeader: false,
    })
    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))
    expect(result.current.isPublicView).toBe(true)
  })

  it('reads tracks from Dexie via useLiveQuery for hydrated setlists', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    // Pre-seed Dexie with a track that has a key set.
    await getDb().tracks.bulkPut([
      makeLocalTrack({ id: 't1', order: 0, title: 'Modeh Ani', key: 'E' }),
      makeLocalTrack({ id: 't2', order: 1, title: 'Adon Olam', key: 'G' }),
    ])

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    await waitFor(() => {
      expect(result.current.tracks).toHaveLength(2)
    })
    expect(result.current.tracks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect((result.current.tracks[0] as { key: string }).key).toBe('E')
    expect((result.current.tracks[1] as { key: string }).key).toBe('G')
  })

  it('reflects Dexie writes instantly via useLiveQuery', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    await getDb().tracks.put(
      makeLocalTrack({ id: 't1', order: 0, title: 'Modeh Ani', key: 'C' }),
    )

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    await waitFor(() => {
      expect((result.current.tracks[0] as { key: string }).key).toBe('C')
    })

    // Simulate a cell-commit landing in Dexie (e.g., from applyEdit).
    await act(async () => {
      await getDb().tracks.put(
        makeLocalTrack({ id: 't1', order: 0, title: 'Modeh Ani', key: 'E' }),
      )
    })

    // useLiveQuery picks up the update — no Firestore round-trip needed.
    await waitFor(() => {
      expect((result.current.tracks[0] as { key: string }).key).toBe('E')
    })
  })

  it('sorts Dexie tracks by order ascending', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    await getDb().tracks.bulkPut([
      makeLocalTrack({ id: 't3', order: 2, title: 'Third' }),
      makeLocalTrack({ id: 't1', order: 0, title: 'First' }),
      makeLocalTrack({ id: 't2', order: 1, title: 'Second' }),
    ])

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    await waitFor(() => {
      expect(result.current.tracks).toHaveLength(3)
    })
    expect(result.current.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('v60-08-01: returns [] for unhydrated setlists when Dexie is empty (embedded fallback removed)', async () => {
    const embedded = [
      { id: 'emb-1', title: 'Pre-cascade A', key: 'C' },
      { id: 'emb-2', title: 'Pre-cascade B', key: 'D' },
    ]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: false, tracks: embedded, musicians: [] },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    await waitFor(() => {
      expect(result.current.tracks).toEqual([])
    })
  })

  it('prefers Dexie over embedded once Dexie has rows (cascade has begun)', async () => {
    const embedded = [
      { id: 'emb-1', title: 'Old Stale', key: 'OLD' },
    ]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: false, tracks: embedded, musicians: [] },
      loading: false,
      error: null,
    })

    await getDb().tracks.put(
      makeLocalTrack({ id: 't1', order: 0, title: 'Cascaded', key: 'NEW' }),
    )

    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    // Embedded has 1 row too, so length-based wait is ambiguous.
    // Wait specifically on the Dexie row's key winning.
    await waitFor(() => {
      expect((result.current.tracks[0] as { key: string }).key).toBe('NEW')
    })
    expect(result.current.tracks).toHaveLength(1)
  })

  it('returns [] for hydrated setlists with empty Dexie (no fallback to stale embedded)', async () => {
    // Hydrated setlist with stale embedded array. Post-migration, embedded
    // is intentionally stale. We must NOT fall back to it.
    const staleEmbedded = [
      { id: 'old-1', title: 'Pre-Migration Stale' },
    ]
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: staleEmbedded, musicians: [] },
      loading: false,
      error: null,
    })

    // Dexie deliberately empty.
    const { result } = renderHook(() => useSetlistPerformance(SETLIST_ID))

    // Wait for Dexie query to resolve to [] (loading false).
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    // Hydrated + Dexie empty = [] (NOT the stale embedded).
    expect(result.current.tracks).toEqual([])
  })

  it('mounts the snapshot listener after hydration; unsubscribes on unmount', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    const stopFn = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startFn = vi.fn((_opts: any) => stopFn)

    const { unmount } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, { startSnapshotListener: startFn }),
    )

    await waitFor(() => {
      expect(startFn).toHaveBeenCalledTimes(1)
    })

    const callArgs = startFn.mock.calls[0]?.[0] as
      | { setlistId: string; db: unknown }
      | undefined
    expect(callArgs?.setlistId).toBe(SETLIST_ID)
    expect(callArgs?.db).toBeDefined()

    unmount()
    expect(stopFn).toHaveBeenCalledTimes(1)
  })

  it('v60-12-01: DOES mount the snapshot listener for unauthenticated public sessions', () => {
    // Contract reversal: prior to v60-12-01, this test asserted the listener
    // was SKIPPED for public users because firestore.rules required isMember()
    // to read tracks/{trackId}. v60-12-01 opened tracks/* to public read —
    // Daniel UAT 2026-05-13 reported incognito perform view showed "No tracks
    // yet" because the listener was skipped and Dexie never got populated.
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      isBandLeader: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    const startFn = vi.fn(() => () => {})

    renderHook(() =>
      useSetlistPerformance(SETLIST_ID, { startSnapshotListener: startFn }),
    )

    expect(startFn).toHaveBeenCalledTimes(1)
    expect(startFn).toHaveBeenCalledWith(
      expect.objectContaining({ setlistId: SETLIST_ID }),
    )
  })

  // UNAUTH-009 (cycle-4 supplement) — SSR-primed initial frame
  describe('opts.initial (UNAUTH-009 SSR seeding)', () => {
    it('returns initial setlist + tracks immediately when subscriptions are still loading', () => {
      mockUseSafeFirestoreSync.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      })

      const initialSetlist = {
        id: SETLIST_ID,
        name: 'SSR-Served Setlist',
        serviceNotes: 'Wear blue',
        musicians: [{ uid: 'u1', name: 'SSR Musician', email: 'm@x' }],
        rabbi: 'Daniel',
        date: 0,
        trackCount: 2,
      } as unknown as Parameters<typeof useSetlistPerformance>[1] extends infer T
        ? T extends { initial?: infer I }
          ? I extends { setlist: infer S | null }
            ? S
            : never
          : never
        : never
      const initialTracks = [
        { id: 'ssr-t1', title: 'SSR Track One', key: 'C' },
        { id: 'ssr-t2', title: 'SSR Track Two', key: 'G' },
      ]

      const { result } = renderHook(() =>
        useSetlistPerformance(SETLIST_ID, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initial: { setlist: initialSetlist as any, tracks: initialTracks as any },
        }),
      )

      // Critical assertion: loading=false even though useSafeFirestoreSync
      // says loading:true. SSR frame is enough to render.
      expect(result.current.loading).toBe(false)
      expect(result.current.name).toBe('SSR-Served Setlist')
      expect(result.current.serviceNotes).toBe('Wear blue')
      expect(result.current.rabbi).toBe('Daniel')
      expect(result.current.musicians).toHaveLength(1)
      expect(result.current.tracks).toHaveLength(2)
      expect(result.current.tracks.map((t) => t.title)).toEqual([
        'SSR Track One',
        'SSR Track Two',
      ])
    })

    it('switches to live Dexie data once subscriptions resolve', async () => {
      mockUseSafeFirestoreSync.mockReturnValue({
        data: {
          id: SETLIST_ID,
          name: 'Live Setlist Name',
          hydrated: true,
          tracks: [],
          musicians: [],
        },
        loading: false,
        error: null,
      })

      // Seed Dexie BEFORE renderHook so useLiveQuery's first resolution
      // contains live rows, not the SSR ones.
      await getDb().tracks.bulkPut([
        makeLocalTrack({ id: 'live-1', order: 0, title: 'Live Track', key: 'A' }),
      ])

      const { result } = renderHook(() =>
        useSetlistPerformance(SETLIST_ID, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initial: {
            setlist: { id: SETLIST_ID, name: 'SSR Name' } as any,
            tracks: [{ id: 'ssr-only', title: 'SSR Only', key: 'C' } as any],
          },
        }),
      )

      // First frame: SSR (dexieTracks === undefined)
      // After Dexie resolves: live data wins (length 1, title 'Live Track')
      await waitFor(() => {
        expect(result.current.tracks).toHaveLength(1)
        expect(result.current.tracks[0]?.title).toBe('Live Track')
      })

      // Live setlist data also wins over SSR snapshot name once
      // useSafeFirestoreSync returns.
      expect(result.current.name).toBe('Live Setlist Name')
    })
  })

  it('does not crash when snapshot listener factory throws on mount', async () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: { id: SETLIST_ID, hydrated: true, tracks: [], musicians: [] },
      loading: false,
      error: null,
    })

    const startFn = vi.fn(() => {
      throw new Error('boot failure')
    })

    expect(() =>
      renderHook(() =>
        useSetlistPerformance(SETLIST_ID, { startSnapshotListener: startFn }),
      ),
    ).not.toThrow()
  })
})
