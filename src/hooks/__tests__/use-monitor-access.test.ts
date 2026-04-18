import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
}))

const mockUseSafeFirestoreSync = vi.fn((): { data: unknown; loading: boolean } => ({ data: null, loading: false }))
vi.mock('@/hooks/use-safe-firestore-sync', () => ({
  useSafeFirestoreSync: () => mockUseSafeFirestoreSync(),
}))

const mockUseAuth = vi.fn((): { user: unknown; isAdmin: boolean; isSoundEngineer: boolean } => ({
  user: null,
  isAdmin: false,
  isSoundEngineer: false,
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

// ── Import under test ──────────────────────────────────────────────────────────

import { useMonitorAccess } from '@/hooks/use-monitor-access'

describe('useMonitorAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      isSoundEngineer: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({ data: null, loading: false })
  })

  it('returns hasAccess=false when no user', () => {
    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('returns hasAccess=true for admin users', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'admin-1' },
      isAdmin: true,
      isSoundEngineer: false,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.isAdmin).toBe(true)
  })

  it('returns hasAccess=true for sound engineers', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'eng-1' },
      isAdmin: false,
      isSoundEngineer: true,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.isSoundEngineer).toBe(true)
  })

  it('returns hasAccess=true when user has a bus assigned', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'musician-1' },
      isAdmin: false,
      isSoundEngineer: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        busAssignments: {
          bus1: [{ userId: 'musician-1', label: 'Guitar' }],
          bus2: [{ userId: 'other-user', label: 'Bass' }],
        },
      },
      loading: false,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.hasBusAssigned).toBe(true)
  })

  it('returns hasAccess=false when user has no access path', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'random-1' },
      isAdmin: false,
      isSoundEngineer: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        busAssignments: {
          bus1: [{ userId: 'other-user', label: 'Bass' }],
        },
      },
      loading: false,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(false)
    expect(result.current.hasBusAssigned).toBe(false)
  })

  it('returns loading=true while config is loading', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      isAdmin: false,
      isSoundEngineer: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: null,
      loading: true,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.loading).toBe(true)
  })

  it('handles null bus assignment entries', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      isAdmin: false,
      isSoundEngineer: false,
    })
    mockUseSafeFirestoreSync.mockReturnValue({
      data: {
        busAssignments: {
          bus1: null,
          bus2: [{ userId: 'user-1', label: 'Keys' }],
        },
      },
      loading: false,
    })

    const { result } = renderHook(() => useMonitorAccess())
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.hasBusAssigned).toBe(true)
  })
})
