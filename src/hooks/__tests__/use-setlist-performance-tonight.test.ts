import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'

import { getDb, resetDbForTests } from '@/lib/local/schema'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  db: {},
  getDb: vi.fn(async () => ({})),
  subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
    const u = setup({})
    return typeof u === 'function' ? u : () => {}
  }),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  Timestamp: class {},
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
const mockReleaseWakeLock = vi.fn()
vi.mock('@/hooks/use-wake-lock', () => ({
  useWakeLock: () => ({
    isSupported: true,
    isLocked: false,
    lastError: null,
    requestWakeLock: mockRequestWakeLock,
    releaseWakeLock: mockReleaseWakeLock,
    dismissWakeLockError: vi.fn(),
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
import { chicagoDay, planSwap, type OverridesDoc } from '@/lib/performance/tonight'

/**
 * David's ask 4 — tonight's overrides are an ADDITIVE layer. The planned
 * setlist must render in full whatever the overrides doc does.
 */

const SETLIST_ID = 'set-tonight-1'
const TODAY = chicagoDay(Date.now())
const YESTERDAY = chicagoDay(Date.now() - 36 * 3_600_000)

const ssrTracks = [
  { id: 'r1', setlistId: SETLIST_ID, order: 0, title: "Bar'chu (Plan)", fileId: 'A', songId: 'A' },
  { id: 'r2', setlistId: SETLIST_ID, order: 1, title: 'Mi Chamocha', fileId: 'M', songId: 'M' },
  { id: 'r3', setlistId: SETLIST_ID, order: 2, title: 'Aleinu', fileId: 'Z', songId: 'Z' },
] as never

function swapDoc(day: string): OverridesDoc {
  const p = planSwap(null, {
    rowId: 'r1',
    planned: { fileId: 'A', title: "Bar'chu (Plan)" },
    expectedBeforeFileId: 'A',
    choice: { fileId: 'B', title: "Bar'chu (B)" },
    by: 'leader',
    at: Date.now(),
    eventDay: day,
  })
  if (p.kind !== 'write') throw new Error(p.kind)
  return p.next
}

function setlist(day: string) {
  return { id: SETLIST_ID, name: 'Shabbat', eventDate: day } as never
}

describe('useSetlistPerformance — tonight-only swaps', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDbForTests()
    mockUseSafeFirestoreSync.mockReturnValue({ data: null, loading: false, error: null })
  })
  afterEach(async () => {
    cleanup()
    await resetDbForTests()
  })

  it('THE OVERRIDES DOC FAILS TO LOAD: the planned setlist still renders in full', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, isAdmin: false, isBandLeader: false })
    const subscribeTonight = vi.fn((_id: string, _onDoc: unknown, onError: (e: unknown) => void) => {
      onError(Object.assign(new Error('denied'), { code: 'permission-denied' }))
      return () => {}
    })
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        subscribeTonight: subscribeTonight as never,
        initial: { setlist: setlist(TODAY), tracks: ssrTracks },
      }),
    )
    await waitFor(() => expect(result.current.tracks).toHaveLength(3))
    expect(subscribeTonight).toHaveBeenCalledWith(SETLIST_ID, expect.any(Function), expect.any(Function))
    expect(result.current.tracks.map((t) => t.fileId)).toEqual(['A', 'M', 'Z'])
    expect(result.current.tonightOverrides).toBeNull()
  })

  it('a listener that throws on mount also leaves the plan in full', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, isAdmin: false, isBandLeader: false })
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        subscribeTonight: (() => { throw new Error('boom') }) as never,
        initial: { setlist: setlist(TODAY), tracks: ssrTracks },
      }),
    )
    await waitFor(() => expect(result.current.tracks).toHaveLength(3))
    expect(result.current.tracks[0].fileId).toBe('A')
  })

  it('signed in: a delivered swap changes only that row, live', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, isAdmin: false, isBandLeader: false })
    let deliver: (d: OverridesDoc | null) => void = () => {}
    const subscribeTonight = vi.fn((_id: string, onDoc: (d: OverridesDoc | null) => void) => {
      deliver = onDoc
      return () => {}
    })
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        subscribeTonight: subscribeTonight as never,
        initial: { setlist: setlist(TODAY), tracks: ssrTracks },
      }),
    )
    await waitFor(() => expect(result.current.tracks).toHaveLength(3))
    act(() => deliver(swapDoc(TODAY)))
    await waitFor(() => expect(result.current.tracks[0].fileId).toBe('B'))
    expect(result.current.tracks.map((t) => t.id)).toEqual(['r1', 'r2', 'r3'])
    expect(result.current.tracks[0].tonight).toMatchObject({ plannedFileId: 'A', plannedTitle: "Bar'chu (Plan)" })
    expect(result.current.plannedTracks[0].fileId).toBe('A')
    // Reset: the doc now has no rows.
    act(() => deliver({ ...swapDoc(TODAY), rows: {}, rev: 2 }))
    await waitFor(() => expect(result.current.tracks[0].fileId).toBe('A'))
  })

  it('signed out: the server-read overrides apply and no listener is mounted', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false, isBandLeader: false })
    const subscribeTonight = vi.fn(() => () => {})
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        subscribeTonight: subscribeTonight as never,
        initial: { setlist: setlist(TODAY), tracks: ssrTracks, overrides: swapDoc(TODAY) },
      }),
    )
    await waitFor(() => expect(result.current.tracks[0].fileId).toBe('B'))
    expect(subscribeTonight).not.toHaveBeenCalled()
  })

  it('the day after the service the override no longer applies', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false, isBandLeader: false })
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        initial: { setlist: setlist(YESTERDAY), tracks: ssrTracks, overrides: swapDoc(YESTERDAY) },
      }),
    )
    await waitFor(() => expect(result.current.tracks).toHaveLength(3))
    expect(result.current.tracks[0].fileId).toBe('A')
    expect(result.current.tonightOverrides).toBeNull()
  })

  it('a setlist with no service date never applies overrides', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false, isBandLeader: false })
    const { result } = renderHook(() =>
      useSetlistPerformance(SETLIST_ID, {
        startSnapshotListener: vi.fn(() => () => {}),
        initial: { setlist: { id: SETLIST_ID, name: 'x' } as never, tracks: ssrTracks, overrides: swapDoc(TODAY) },
      }),
    )
    await waitFor(() => expect(result.current.tracks).toHaveLength(3))
    expect(result.current.tracks[0].fileId).toBe('A')
    expect(result.current.serviceDay).toBeNull()
  })
})
