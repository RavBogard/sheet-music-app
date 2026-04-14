import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user-1', displayName: 'Rabbi Daniel' } })),
}))

const mockCreateSetlist = vi.fn().mockResolvedValue('new-setlist-id')
vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: vi.fn(() => ({ createSetlist: mockCreateSetlist })),
}))

const mockAssignMusicians = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/scheduling-firebase', () => ({
  assignMusicians: (...args: unknown[]) => mockAssignMusicians(...args),
}))

const mockGetFullServiceContext = vi.fn().mockResolvedValue({ type: 'shabbat_morning', parasha: 'Bereshit' })
const mockGetNextFriday = vi.fn(() => new Date('2026-03-13'))
const mockGetNextSaturday = vi.fn(() => new Date('2026-03-14'))
vi.mock('@/lib/liturgical-calendar', () => ({
  getFullServiceContext: vi.fn((_opts?: unknown) => mockGetFullServiceContext(_opts)),
  getNextFriday: () => mockGetNextFriday(),
  getNextSaturday: () => mockGetNextSaturday(),
  ServiceType: {},
}))

const mockGetTemplate = vi.fn((_key?: unknown, _overrides?: unknown) => ({ sections: [] }))
const mockBuildSetlistFromTemplate = vi.fn((_template?: unknown, _files?: unknown, _context?: unknown) => [
  { id: 't1', title: 'Template Song', fileId: 'f1', type: 'song' as const },
])
const mockGenerateSetlistName = vi.fn((_context?: unknown) => 'Shabbat Morning — Bereshit')
vi.mock('@/lib/liturgical-templates', () => ({
  getTemplate: (...args: unknown[]) => mockGetTemplate(...args),
  buildSetlistFromTemplate: (...args: unknown[]) => mockBuildSetlistFromTemplate(...args),
  generateSetlistName: (...args: unknown[]) => mockGenerateSetlistName(...args),
  getAllTemplateKeys: vi.fn(() => ['shabbat_morning', 'friday_night']),
  TEMPLATE_LABELS: {
    shabbat_morning: { label: 'Shabbat Morning' },
    friday_night: { label: 'Friday Night' },
  },
}))

vi.mock('@/lib/library-store', () => ({
  useLibraryStore: { getState: () => ({ allFiles: [] }) },
}))

vi.mock('@/lib/template-firebase', () => ({
  useCustomTemplates: vi.fn(() => ({ overrides: {} })),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

import { useCreationWizard } from '@/hooks/use-creation-wizard'
import { toast } from 'sonner'

describe('useCreationWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSetlist.mockResolvedValue('new-setlist-id')
  })

  it('starts with initial state', () => {
    const { result } = renderHook(() => useCreationWizard())
    expect(result.current.step).toBe('template')
    expect(result.current.stepIndex).toBe(0)
    expect(result.current.totalSteps).toBe(2)
    expect(result.current.name).toBe('')
    expect(result.current.selectedTemplate).toBeNull()
    expect(result.current.tracks).toEqual([])
    expect(result.current.musicians).toEqual([])
    expect(result.current.creating).toBe(false)
  })

  it('navigates forward with goNext', () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.goNext() })
    expect(result.current.step).toBe('details')
    expect(result.current.stepIndex).toBe(1)
  })

  it('navigates backward with goBack', () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.goNext() })
    expect(result.current.step).toBe('details')

    act(() => { result.current.goBack() })
    expect(result.current.step).toBe('template')
  })

  it('does not go back from first step', () => {
    const { result } = renderHook(() => useCreationWizard())
    expect(result.current.canGoBack).toBe(false)
    act(() => { result.current.goBack() })
    expect(result.current.step).toBe('template')
  })

  it('goToStep jumps directly', () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.goToStep('details') })
    expect(result.current.step).toBe('details')
  })

  it('canGoNext: template step always true', () => {
    const { result } = renderHook(() => useCreationWizard())
    expect(result.current.canGoNext).toBe(true)
  })

  it('canGoNext: details step requires non-empty name', () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.goToStep('details') })
    expect(result.current.canGoNext).toBe(false)

    act(() => { result.current.setName('My Setlist') })
    expect(result.current.canGoNext).toBe(true)
  })

  it('template selection auto-fills eventDate for Saturday', async () => {
    const { result } = renderHook(() => useCreationWizard())
    await act(async () => { await result.current.setSelectedTemplate('shabbat_morning') })

    expect(result.current.eventDate).toEqual(new Date('2026-03-14'))
    expect(mockGetNextSaturday).toHaveBeenCalled()
  })

  it('template selection auto-fills eventDate for Friday', async () => {
    const { result } = renderHook(() => useCreationWizard())
    await act(async () => { await result.current.setSelectedTemplate('friday_night') })

    expect(result.current.eventDate).toEqual(new Date('2026-03-13'))
    expect(mockGetNextFriday).toHaveBeenCalled()
  })

  it('addSongsFromFiles creates tracks from DriveFile array', () => {
    const { result } = renderHook(() => useCreationWizard())
    const files = [
      { id: 'f1', name: 'My-Song.pdf', mimeType: 'application/pdf', metadata: { key: 'Am', bpm: 120 } },
      { id: 'f2', name: 'Another_Song.pdf', mimeType: 'application/pdf' },
    ]

    act(() => { result.current.addSongsFromFiles(files) })

    expect(result.current.tracks).toHaveLength(2)
    expect(result.current.tracks[0].fileId).toBe('f1')
    expect(result.current.tracks[0].title).toBe('My Song')
    expect(result.current.tracks[0].key).toBe('Am')
    expect(result.current.tracks[1].title).toBe('Another Song')
  })

  it('create() builds from template when no manual tracks', async () => {
    const { result } = renderHook(() => useCreationWizard())
    await act(async () => { await result.current.setSelectedTemplate('shabbat_morning') })
    act(() => { result.current.setName('Test Setlist') })

    await act(async () => { await result.current.create() })

    expect(mockBuildSetlistFromTemplate).toHaveBeenCalled()
    expect(mockCreateSetlist).toHaveBeenCalledWith(
      'Test Setlist',
      expect.any(Array),
      expect.objectContaining({ templateType: 'shabbat_morning' })
    )
    expect(mockPush).toHaveBeenCalledWith('/setlists/new-setlist-id')
  })

  it('create() assigns musicians when musicians selected', async () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => {
      result.current.setName('Service')
      result.current.setMusicians([
        { uid: 'u1', name: 'Alice', email: 'alice@test.com', instrument: 'guitar' },
      ])
    })

    await act(async () => { await result.current.create() })

    expect(mockAssignMusicians).toHaveBeenCalledWith(
      expect.objectContaining({
        setlistId: 'new-setlist-id',
        musicians: [expect.objectContaining({ uid: 'u1', name: 'Alice' })],
      })
    )
  })

  it('create() navigates to new setlist on success', async () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.setName('New Setlist') })

    await act(async () => { await result.current.create() })

    expect(mockPush).toHaveBeenCalledWith('/setlists/new-setlist-id')
    expect(toast.success).toHaveBeenCalled()
  })

  it('create() shows toast.error on failure', async () => {
    mockCreateSetlist.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.setName('Fail Setlist') })

    await act(async () => { await result.current.create() })

    expect(toast.error).toHaveBeenCalledWith('Failed to create setlist')
    expect(result.current.creating).toBe(false)
  })

  it('reset() clears all state', async () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => {
      result.current.setName('Test')
      result.current.goToStep('details')
    })

    act(() => { result.current.reset() })

    expect(result.current.step).toBe('template')
    expect(result.current.name).toBe('')
    expect(result.current.tracks).toEqual([])
    expect(result.current.creating).toBe(false)
  })

  it('sets creating=true during create and resets after', async () => {
    const { result } = renderHook(() => useCreationWizard())
    act(() => { result.current.setName('Test') })

    expect(result.current.creating).toBe(false)

    await act(async () => { await result.current.create() })

    // creating resets to false after completion
    expect(result.current.creating).toBe(false)
    expect(mockCreateSetlist).toHaveBeenCalledTimes(1)
  })
})
