import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockHydrate = vi.fn()

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

vi.mock('@/lib/library-store', () => ({
  useLibraryStore: vi.fn((selector: (s: { hydrate: typeof mockHydrate }) => unknown) =>
    selector({ hydrate: mockHydrate })
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
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
        queryKey: ['library', true, true],
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
})
