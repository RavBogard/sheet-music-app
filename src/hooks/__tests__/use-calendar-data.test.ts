import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockUseAuth = vi.fn((): { user: unknown; isBandLeader: boolean } => ({
  user: { uid: 'user-1' },
  isBandLeader: false,
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}))

// v11-05-03: useCalendarData now reads useOrg() to org-scope the planning subscription.
vi.mock('@/lib/org/org-context', () => ({
  useOrg: () => 'crc',
}))

const mockSubscribeToMyAssignments = vi.fn((_uid: string, cb: (data: unknown[]) => void) => {
  cb([])
  return vi.fn() // unsub
})
// v11-05-03: signature is now (org, cb).
const mockSubscribeToAllUpcoming = vi.fn((_org: string, cb: (data: unknown[]) => void) => {
  cb([])
  return vi.fn()
})

vi.mock('@/lib/scheduling-firebase', () => ({
  subscribeToMyAssignments: (uid: string, cb: (d: unknown[]) => void) =>
    mockSubscribeToMyAssignments(uid, cb),
  subscribeToAllUpcomingAssignments: (org: string, cb: (d: unknown[]) => void) =>
    mockSubscribeToAllUpcoming(org, cb),
}))

vi.mock('@/lib/firestore-helpers', () => ({
  dateStr: vi.fn((date: unknown) => {
    if (!date) return null
    if (typeof date === 'string') return date
    if (date && typeof date === 'object' && 'toDate' in (date as Record<string, unknown>)) {
      return '2026-03-15'
    }
    return null
  }),
}))

import { useCalendarData } from '@/hooks/use-calendar-data'
import type { Setlist } from '@/lib/setlist-firebase'
import type { SchedulingAssignment } from '@/types/models'

describe('useCalendarData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      isBandLeader: false,
    })
  })

  it('returns empty map with no setlists or assignments', () => {
    const { result } = renderHook(() => useCalendarData('viewer', []))
    expect(result.current.dayMap.size).toBe(0)
    expect(result.current.assignments).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('subscribes to personal assignments in viewer mode', () => {
    renderHook(() => useCalendarData('viewer', []))
    expect(mockSubscribeToMyAssignments).toHaveBeenCalledWith('user-1', expect.any(Function))
    expect(mockSubscribeToAllUpcoming).not.toHaveBeenCalled()
  })

  it('subscribes to all assignments in planning mode for band leader', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'leader-1' },
      isBandLeader: true,
    })

    renderHook(() => useCalendarData('planning', []))
    expect(mockSubscribeToAllUpcoming).toHaveBeenCalledWith('crc', expect.any(Function))
    expect(mockSubscribeToMyAssignments).not.toHaveBeenCalled()
  })

  it('falls back to personal assignments for non-leaders in planning mode', () => {
    renderHook(() => useCalendarData('planning', []))
    expect(mockSubscribeToMyAssignments).toHaveBeenCalled()
  })

  it('maps setlists to day map by eventDate', () => {
    const setlists = [
      { id: 's1', name: 'Friday', eventDate: '2026-03-15' },
      { id: 's2', name: 'Saturday', eventDate: '2026-03-15' },
    ] as unknown as Setlist[]

    const { result } = renderHook(() => useCalendarData('viewer', setlists))

    expect(result.current.dayMap.has('2026-03-15')).toBe(true)
    const dayData = result.current.dayMap.get('2026-03-15')!
    expect(dayData.setlists).toHaveLength(2)
  })

  it('handles null eventDate gracefully', () => {
    const setlists = [
      { id: 's1', name: 'No Date', eventDate: null },
    ] as unknown as Setlist[]

    const { result } = renderHook(() => useCalendarData('viewer', setlists))
    expect(result.current.dayMap.size).toBe(0)
  })

  it('does not subscribe when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, isBandLeader: false })

    const { result } = renderHook(() => useCalendarData('viewer', []))
    expect(result.current.loading).toBe(false)
    expect(mockSubscribeToMyAssignments).not.toHaveBeenCalled()
  })
})
