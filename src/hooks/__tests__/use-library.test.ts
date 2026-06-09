import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockHydrate = vi.fn()
const mockInvalidateQueries = vi.fn()
const mockListenForCacheInvalidation = vi.fn((_cb: () => void): (() => void) => () => {})

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
  // useLibrary's library_signals/latest onSnapshot effect now resolves Firestore
  // lazily via subscribeWithDb. The sync-friendly mock calls the setup callback
  // synchronously so test assertions can run against the wired-up onSnapshot.
  db: {},
  getDb: vi.fn(async () => ({})),
  subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
    const u = setup({})
    return typeof u === 'function' ? u : () => {}
  }),
}))

// useLibrary subscribes to library_signals/latest via a real
// onSnapshot(doc(db, ...)) listener. Mock the firestore primitives so the
// effect doesn't drive real Firebase against the stub `db`.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

vi.mock('@/lib/library-store', () => ({
  useLibraryStore: vi.fn((selector: (s: { hydrate: typeof mockHydrate }) => unknown) =>
    selector({ hydrate: mockHydrate })
  ),
}))

vi.mock('@/lib/library-cache', () => ({
  listenForCacheInvalidation: (cb: () => void) => mockListenForCacheInvalidation(cb),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}))

// ── Imports ────────────────────────────────────────────────────────────────────

import { renderHook } from '@testing-library/react'
import { useAuth } from '@/lib/auth-context'
import { useQuery } from '@tanstack/react-query'
import { useLibrary } from '@/hooks/use-library'

const mockUseAuth = vi.mocked(useAuth)
const mockUseQuery = vi.mocked(useQuery)

describe('useLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes enabled=false when no user', () => {
    mockUseAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuth>)

    renderHook(() => useLibrary())

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    )
  })

  it('passes enabled=true when user is authenticated', () => {
    const mockUser = { uid: 'user-1', getIdToken: vi.fn() }
    mockUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>)

    renderHook(() => useLibrary())

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      })
    )
  })

  it('includes force flag in query key', () => {
    const mockUser = { uid: 'user-1', getIdToken: vi.fn() }
    mockUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>)

    renderHook(() => useLibrary(true))

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['library', 'v2', 'all', true, true, false],
      })
    )
  })

  it('hydrates Zustand store when data arrives', () => {
    const mockFiles = [{ id: 'f1', name: 'song.pdf' }]
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } } as unknown as ReturnType<typeof useAuth>)
    mockUseQuery.mockReturnValue({
      data: { files: mockFiles, lastModified: '2026-01-01' },
    } as ReturnType<typeof useQuery>)

    renderHook(() => useLibrary())

    expect(mockHydrate).toHaveBeenCalledWith(mockFiles)
  })

  it('does not hydrate when no data', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } } as unknown as ReturnType<typeof useAuth>)
    mockUseQuery.mockReturnValue({ data: undefined } as ReturnType<typeof useQuery>)

    renderHook(() => useLibrary())

    expect(mockHydrate).not.toHaveBeenCalled()
  })

  describe('invalidation on broadcast (v45-07)', () => {
    beforeEach(() => {
      mockInvalidateQueries.mockClear()
      mockListenForCacheInvalidation.mockClear()
    })

    it('subscribes to library-cache invalidation on mount', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'u1' } } as unknown as ReturnType<typeof useAuth>)

      renderHook(() => useLibrary())

      expect(mockListenForCacheInvalidation).toHaveBeenCalledTimes(1)
      expect(typeof mockListenForCacheInvalidation.mock.calls[0][0]).toBe('function')
    })

    it('invalidates ["library"] queryKey when broadcast callback fires', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'u1' } } as unknown as ReturnType<typeof useAuth>)

      renderHook(() => useLibrary())

      // Grab the callback the hook registered with listenForCacheInvalidation
      // and invoke it to simulate a cross-tab invalidation message.
      const callback = mockListenForCacheInvalidation.mock.calls[0][0]
      callback()

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] })
    })

    it('cleans up the listener on unmount', () => {
      mockUseAuth.mockReturnValue({ user: { uid: 'u1' } } as unknown as ReturnType<typeof useAuth>)
      const cleanup = vi.fn()
      mockListenForCacheInvalidation.mockReturnValueOnce(cleanup)

      const { unmount } = renderHook(() => useLibrary())
      unmount()

      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })
})
