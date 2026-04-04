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

const mockSubscribePersonal = vi.fn((_onData?: unknown, _onError?: unknown) => vi.fn())
const mockSubscribePublic = vi.fn((_onData?: unknown, _onError?: unknown) => vi.fn())
const mockDeleteSetlist = vi.fn().mockResolvedValue(undefined)
const mockCopyToPersonal = vi.fn().mockResolvedValue(undefined)
const mockCloneForNextWeek = vi.fn().mockResolvedValue('cloned-id')
const mockSaveAsTemplate = vi.fn().mockResolvedValue(undefined)
const mockCreateSetlist = vi.fn().mockResolvedValue('new-id')

vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: vi.fn(() => ({
    subscribeToPersonalSetlists: (...args: unknown[]) => mockSubscribePersonal(...args),
    subscribeToPublicSetlists: (...args: unknown[]) => mockSubscribePublic(...args),
    deleteSetlist: (...args: unknown[]) => mockDeleteSetlist(...args),
    copyToPersonal: (...args: unknown[]) => mockCopyToPersonal(...args),
    cloneForNextWeek: (...args: unknown[]) => mockCloneForNextWeek(...args),
    saveAsTemplate: (...args: unknown[]) => mockSaveAsTemplate(...args),
    createSetlist: (...args: unknown[]) => mockCreateSetlist(...args),
  })),
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
    tracks: [{ id: 't1', title: 'Song A', fileId: 'file-a' }],
    trackCount: 1,
    isPublic: true,
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

  it('subscribes to personal and public setlists on mount', () => {
    renderHook(() => useSetlistDashboard({}))
    expect(mockSubscribePersonal).toHaveBeenCalled()
    expect(mockSubscribePublic).toHaveBeenCalled()
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

  it('search filters by track title', () => {
    const setlists = [
      makeSetlist({ id: '1', name: 'Service', tracks: [{ id: 't1', title: 'Lecha Dodi' }] }),
      makeSetlist({ id: '2', name: 'Other', tracks: [{ id: 't2', title: 'Shema' }] }),
    ]

    const { result } = renderHook(() => useSetlistDashboard({
      initialPublicSetlists: setlists,
    }))

    act(() => { result.current.setSearchQuery('Lecha') })
    expect(result.current.displayedSetlists).toHaveLength(1)
    expect(result.current.displayedSetlists[0].id).toBe('1')
  })

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
    const setlist = makeSetlist({ ownerId: 'other-user', isPublic: true })

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

    expect(mockDeleteSetlist).toHaveBeenCalledWith('setlist-1', true)
    expect(toast.success).toHaveBeenCalledWith('Setlist deleted')
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('confirmDuplicate calls copyToPersonal and switches to personal tab', async () => {
    const { result } = renderHook(() => useSetlistDashboard({}))
    const setlist = makeSetlist()

    act(() => { result.current.handleDuplicateClick(setlist, mockEvent()) })

    await act(async () => { await result.current.confirmDuplicate() })

    expect(mockCopyToPersonal).toHaveBeenCalledWith('setlist-1', setlist)
    expect(toast.success).toHaveBeenCalledWith('Setlist duplicated successfully!')
    expect(result.current.activeTab).toBe('personal')
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
      true,
      expect.objectContaining({ eventDate: date.toISOString() })
    )
    expect(mockPush).toHaveBeenCalledWith('/setlists/new-id')
  })
})
