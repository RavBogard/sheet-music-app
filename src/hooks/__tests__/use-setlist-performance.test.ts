import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

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
  subscribeToMusicianProfile: vi.fn(() => vi.fn()), // returns unsub
}))

vi.mock('@/lib/setlist-live', () => ({
  updateLiveTrack: vi.fn(),
}))

import { useSetlistPerformance } from '@/hooks/use-setlist-performance'

describe('useSetlistPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('reads currentTrackIndex from liveState', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        tracks: [],
        liveState: { enabled: true, currentTrackIndex: 3 },
      },
      loading: false,
      error: null,
    })

    const { result } = renderHook(() => useSetlistPerformance('setlist-1'))
    expect(result.current.currentTrackIndex).toBe(3)
  })

  it('returns -1 when liveState is not enabled', () => {
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        id: 'setlist-1',
        tracks: [],
        liveState: { enabled: false, currentTrackIndex: 3 },
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
})
