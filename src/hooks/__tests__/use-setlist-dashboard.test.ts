import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockUseAuth = vi.fn((): { user: { uid: string; displayName: string } | null; signIn: ReturnType<typeof vi.fn>; isMember: boolean; isBandLeader: boolean; isAdmin: boolean } => ({
  user: { uid: 'user-1', displayName: 'Rabbi Daniel' },
  signIn: vi.fn(),
  isMember: true,
  isBandLeader: true,
  isAdmin: false,
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }))

const mockSubscribeAll = vi.fn((_onData?: unknown, _onError?: unknown) => vi.fn())
const mockDeleteSetlist = vi.fn().mockResolvedValue(undefined)
const mockDuplicateSetlist = vi.fn().mockResolvedValue(undefined)
const mockCloneForNextWeek = vi.fn().mockResolvedValue('cloned-id')
const mockSaveAsTemplate = vi.fn().mockResolvedValue(undefined)
const mockSetDefaultForServiceType = vi.fn().mockResolvedValue(undefined)
const mockCreateSetlist = vi.fn().mockResolvedValue('new-id')

vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: vi.fn(() => ({
    subscribeToAllSetlists: (...args: unknown[]) => mockSubscribeAll(...args),
    deleteSetlist: (...args: unknown[]) => mockDeleteSetlist(...args),
    duplicateSetlist: (...args: unknown[]) => mockDuplicateSetlist(...args),
    cloneForNextWeek: (...args: unknown[]) => mockCloneForNextWeek(...args),
    saveAsTemplate: (...args: unknown[]) => mockSaveAsTemplate(...args),
    setDefaultForServiceType: (...args: unknown[]) => mockSetDefaultForServiceType(...args),
    createSetlist: (...args: unknown[]) => mockCreateSetlist(...args),
  })),
}))

// SetlistCards re-exports SERVICE_TYPE_LABELS; mock to avoid pulling in the
// full component graph (lucide-react icons, dropdown-menu, etc.) for a
// hook-only test.
vi.mock('@/components/setlist/SetlistCards', () => ({
  SERVICE_TYPE_LABELS: {
    shabbat_morning: 'Shabbat Morning',
    friday_night: 'Friday Night',
  },
}))

const mockDownloadSetlist = vi.fn()
vi.mock('@/hooks/use-offline', () => ({
  useOffline: vi.fn(() => ({ downloadSetlist: mockDownloadSetlist, isDownloading: false })),
}))

const mockApiFetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') })
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('@/lib/liturgical-calendar', () => ({
  getNextFriday: vi.fn(() => new Date('2026-03-13')),
  getNextSaturday: vi.fn(() => new Date('2026-03-14')),
  getFullServiceContext: vi.fn().mockResolvedValue({ type: 'shabbat_morning' }),
  ServiceType: {},
}))

vi.mock('@/lib/liturgical-templates', () => ({
  getTemplate: vi.fn(() => null),
  buildSetlistFromTemplate: vi.fn(() => []),
  generateSetlistName: vi.fn(() => 'Test Setlist'),
}))

vi.mock('@/lib/template-firebase', () => ({
  useCustomTemplates: vi.fn(() => ({ overrides: {} })),
}))

vi.mock('@/lib/library-store', () => ({
  useLibraryStore: { getState: () => ({ allFiles: [] }) },
}))

vi.mock('@/hooks/use-library', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('@/lib/firestore-helpers', () => ({
  toDate: vi.fn((v: unknown) => {
    if (!v) return null
    if (v instanceof Date) return v
    if (typeof v === 'string') return new Date(v)
    if (typeof v === 'object' && v !== null && 'seconds' in v) return new Date((v as { seconds: number }).seconds * 1000)
    return null
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}))

import { useSetlistDashboard } from '@/hooks/use-setlist-dashboard'
import { toast } from 'sonner'
import type { Setlist } from '@/types/models'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSetlist(overrides: Partial<Setlist> = {}): Setlist {
  return {
    id: 'setlist-1',
    name: 'Shabbat Morning',
    date: { seconds: Date.now() / 1000, nanoseconds: 0 },
    trackCount: 1,
    fileIds: ['file-a'],
    ownerId: 'user-1',
    ...overrides,
  }
}

function mockEvent(): React.MouseEvent {
  return { stopPropagation: vi.fn() } as unknown as React.MouseEvent
}

describe('useSetlistDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1', displayName: 'Rabbi Daniel' },
      signIn: vi.fn(),
      isMember: true,
      isBandLeader: true,
      isAdmin: false,
    })
  })

  it('starts with initial state', () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    expect(result.current.loading).toBe(true)
    expect(result.current.activeTab).toBe('public')
    expect(result.current.view).toBe('list')
    expect(result.current.searchQuery).toBe('')
  })

  it('subscribes to all setlists on mount', () => {
    renderHook(() => useSetlistDashboard({}))
    expect(mockSubscribeAll).toHaveBeenCalled()
  })

  it('forces public tab when no user', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      signIn: vi.fn(),
      isMember: false,
      isBandLeader: false,
      isAdmin: false,
    })
    const { result } = renderHook(() => useSetlistDashboard({}))
    expect(result.current.activeTab).toBe('public')
  })

  it('accepts initialPublicSetlists for display', () => {
    const public_ = [makeSetlist({ id: 'pub1', name: 'Public Service' })]

    const { result } = renderHook(() => useSetlistDashboard({
      initialPublicSetlists: public_,
    }))

    // Public setlists used for display (tab defaults to public)
    expect(result.current.displayedSetlists).toHaveLength(1)
    expect(result.current.displayedSetlists[0].name).toBe('Public Service')
  })

  it('search filters by name', () => {
    const setlists = [
      makeSetlist({ id: '1', name: 'Shabbat Morning' }),
      makeSetlist({ id: '2', name: 'Friday Night' }),
    ]

    const { result } = renderHook(() => useSetlistDashboard({
      initialPublicSetlists: setlists,
    }))

    act(() => { result.current.setSearchQuery('Friday') })

    expect(result.current.displayedSetlists).toHaveLength(1)
    expect(result.current.displayedSetlists[0].name).toBe('Friday Night')
  })

  // v60-08-01: dropped — track-title search relied on setlist.tracks (legacy
  // embedded array). Production search now matches name + date only.

  it('rabbi filter narrows displayed setlists', () => {
    const setlists = [
      makeSetlist({ id: '1', name: 'Service A', rabbi: 'Rabbi Daniel' }),
      makeSetlist({ id: '2', name: 'Service B', rabbi: 'Rabbi Randy' }),
    ]

    const { result } = renderHook(() => useSetlistDashboard({
      initialPublicSetlists: setlists,
    }))

    act(() => { result.current.setRabbiFilter('Rabbi Daniel') })
    expect(result.current.displayedSetlists).toHaveLength(1)
    expect(result.current.displayedSetlists[0].rabbi).toBe('Rabbi Daniel')
  })

  it('handleSelect navigates with router.push', () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    act(() => { result.current.handleSelect(setlist) })

    expect(mockPush).toHaveBeenCalledWith('/setlists/setlist-1')
    expect(result.current.navigatingTo).toBe('setlist-1')
  })

  it('handleSelect calls onSelect callback if provided', () => {
    const onSelect = vi.fn()
    const { result } = renderHook(() => useSetlistDashboard({ onSelect }))
    const setlist = makeSetlist()

    act(() => { result.current.handleSelect(setlist) })

    expect(onSelect).toHaveBeenCalledWith(setlist)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('handleDeleteClick blocks non-owner non-privileged deletes on public setlists', () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'user-1', displayName: 'Musician' },
      signIn: vi.fn(),
      isMember: true,
      isBandLeader: false,
      isAdmin: false,
    })
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist({ ownerId: 'other-user' })

    act(() => { result.current.handleDeleteClick(setlist, mockEvent()) })

    expect(toast.error).toHaveBeenCalledWith('You can only delete setlists you created')
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('handleDeleteClick opens dialog for own setlist', () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist({ ownerId: 'user-1' })

    act(() => { result.current.handleDeleteClick(setlist, mockEvent()) })

    expect(result.current.deleteConfirmOpen).toBe(true)
    expect(result.current.setlistToDelete).toEqual(setlist)
  })

  it('confirmDelete calls deleteSetlist and shows toast', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    act(() => { result.current.handleDeleteClick(setlist, mockEvent()) })

    await act(async () => { await result.current.confirmDelete() })

    expect(mockDeleteSetlist).toHaveBeenCalledWith('setlist-1')
    expect(toast.success).toHaveBeenCalledWith('Setlist deleted')
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('confirmDuplicate calls duplicateSetlist', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    act(() => { result.current.handleDuplicateClick(setlist, mockEvent()) })

    await act(async () => { await result.current.confirmDuplicate() })

    expect(mockDuplicateSetlist).toHaveBeenCalledWith('setlist-1', setlist)
    expect(toast.success).toHaveBeenCalledWith('Setlist duplicated successfully!')
  })

  it('handleCloneNextWeekClick calls cloneForNextWeek', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    await act(async () => {
      await result.current.handleCloneNextWeekClick(setlist, mockEvent())
    })

    expect(mockCloneForNextWeek).toHaveBeenCalledWith(setlist)
    expect(toast.success).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/setlists/cloned-id')
  })

  it('handleTransfer calls apiFetch with correct body', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    act(() => {
      result.current.setSelectedSetlistForTransfer(setlist)
      result.current.setTransferEmail('new@test.com')
    })

    await act(async () => { await result.current.handleTransfer() })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/setlist/transfer', {
      method: 'POST',
      body: JSON.stringify({ setlistId: 'setlist-1', newOwnerEmail: 'new@test.com' }),
    })
    expect(toast.success).toHaveBeenCalledWith('Transfer Successful!')
  })

  it('handleCreateFromCalendar without template creates blank setlist', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const date = new Date('2026-03-15') // Sunday — no template match

    await act(async () => {
      await result.current.handleCreateFromCalendar(date)
    })

    expect(mockCreateSetlist).toHaveBeenCalledWith(
      expect.stringContaining('New Setlist'),
      [],
      expect.objectContaining({ eventDate: date.toISOString() })
    )
    expect(mockPush).toHaveBeenCalledWith('/setlists/new-id')
  })

  describe('v11.5-05-03 (Q4): junk/test visibility filter', () => {
    it('drops isTest:true and test-uid-owned setlists for an AUTHED viewer', () => {
      const setlists = [
        makeSetlist({ id: 'real', name: 'Real Service', trackCount: 3 }),
        makeSetlist({ id: 'flag', name: 'Test Fixture', isTest: true, trackCount: 3 }),
        makeSetlist({ id: 'tuid', name: 'Test Owner', ownerId: 'test-abc', trackCount: 3 }),
      ]
      const { result } = renderHook(() => useSetlistDashboard({ initialSetlists: setlists }))
      const ids = result.current.displayedSetlists.map(s => s.id)
      expect(ids).toEqual(['real'])
    })

    it('drops isTest + test-uid rows for ANON too', () => {
      mockUseAuth.mockReturnValue({ user: null, signIn: vi.fn(), isMember: false, isBandLeader: false, isAdmin: false })
      const setlists = [
        makeSetlist({ id: 'real', name: 'Real Service', trackCount: 3 }),
        makeSetlist({ id: 'flag', name: 'Test Fixture', isTest: true, trackCount: 3 }),
        makeSetlist({ id: 'tuid', name: 'Test Owner', ownerId: 'test-abc', trackCount: 3 }),
      ]
      const { result } = renderHook(() => useSetlistDashboard({ initialSetlists: setlists }))
      const ids = result.current.displayedSetlists.map(s => s.id)
      expect(ids).toEqual(['real'])
    })

    it('hides zero-track drafts from ANON but keeps a non-empty row', () => {
      mockUseAuth.mockReturnValue({ user: null, signIn: vi.fn(), isMember: false, isBandLeader: false, isAdmin: false })
      const setlists = [
        makeSetlist({ id: 'real', name: 'Real Service', trackCount: 2 }),
        makeSetlist({ id: 'draft', name: 'New Setlist', trackCount: 0, fileIds: [] }),
      ]
      const { result } = renderHook(() => useSetlistDashboard({ initialSetlists: setlists }))
      const ids = result.current.displayedSetlists.map(s => s.id)
      expect(ids).toEqual(['real'])
    })

    it('KEEPS a zero-track draft for a signed-in user (owners see their drafts)', () => {
      // default mockUseAuth = signed-in user
      const setlists = [
        makeSetlist({ id: 'real', name: 'Real Service', trackCount: 2 }),
        makeSetlist({ id: 'draft', name: 'New Setlist', trackCount: 0, fileIds: [] }),
      ]
      const { result } = renderHook(() => useSetlistDashboard({ initialSetlists: setlists }))
      const ids = result.current.displayedSetlists.map(s => s.id).sort()
      expect(ids).toEqual(['draft', 'real'])
    })
  })

  describe('past ordering', () => {
    it('pastOrNoDate sorts dated-past DESC with null-dated trailing', () => {
      const past1 = makeSetlist({ id: 'past-old', name: 'Old', eventDate: '2026-01-05T12:00:00Z' })
      const past2 = makeSetlist({ id: 'past-mid', name: 'Mid', eventDate: '2026-02-15T12:00:00Z' })
      const past3 = makeSetlist({ id: 'past-recent', name: 'Recent', eventDate: '2026-04-01T12:00:00Z' })
      const noDate1 = makeSetlist({ id: 'nodate-1', name: 'No date A', eventDate: undefined })
      const noDate2 = makeSetlist({ id: 'nodate-2', name: 'No date B', eventDate: undefined })

      const { result } = renderHook(() => useSetlistDashboard({
        initialSetlists: [past1, noDate1, past3, noDate2, past2],
      }))

      const ids = result.current.pastOrNoDate.map(s => s.id)
      expect(ids.slice(0, 3)).toEqual(['past-recent', 'past-mid', 'past-old'])
      // Null-dated trail in their original relative order
      expect(ids.slice(3)).toEqual(['nodate-1', 'nodate-2'])
    })

    it('upcoming still sorts ascending (regression guard)', () => {
      // Far future so they stay on the "upcoming" side regardless of today's clock
      const soon = makeSetlist({ id: 'soon', name: 'Soon', eventDate: '2099-01-01T12:00:00Z' })
      const later = makeSetlist({ id: 'later', name: 'Later', eventDate: '2099-06-01T12:00:00Z' })
      const latest = makeSetlist({ id: 'latest', name: 'Latest', eventDate: '2099-12-01T12:00:00Z' })

      const { result } = renderHook(() => useSetlistDashboard({
        initialSetlists: [latest, soon, later],
      }))

      const ids = result.current.upcoming.map(s => s.id)
      expect(ids).toEqual(['soon', 'later', 'latest'])
    })
  })

  describe('v52-05: handleSaveAsDefaultClick', () => {
    it('calls setDefaultForServiceType with the supplied serviceType + setlist.id', async () => {
      const { result } = renderHook(() => useSetlistDashboard({}))
      const setlist = makeSetlist({ id: 'setlistA', name: 'Canonical Shabbat' })

      await act(async () => {
        await result.current.handleSaveAsDefaultClick(setlist, 'shabbat_morning', mockEvent())
      })

      expect(mockSetDefaultForServiceType).toHaveBeenCalledWith('shabbat_morning', 'setlistA')
    })

    it('shows a success toast with the friendly service-type label on resolve', async () => {
      const { result } = renderHook(() => useSetlistDashboard({}))
      const setlist = makeSetlist({ id: 'setlistB', name: 'Canonical Erev' })

      await act(async () => {
        await result.current.handleSaveAsDefaultClick(setlist, 'friday_night', mockEvent())
      })

      expect(toast.success).toHaveBeenCalledWith(
        'Saved as default for Friday Night',
        expect.objectContaining({ id: 'toast-id' }),
      )
    })

    it('shows an error toast when setDefaultForServiceType rejects', async () => {
      mockSetDefaultForServiceType.mockRejectedValueOnce(new Error('permission-denied'))
      const { result } = renderHook(() => useSetlistDashboard({}))
      const setlist = makeSetlist({ id: 'setlistC' })

      await act(async () => {
        await result.current.handleSaveAsDefaultClick(setlist, 'shabbat_morning', mockEvent())
      })

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to save as default',
        expect.objectContaining({ id: 'toast-id' }),
      )
    })
  })
})
