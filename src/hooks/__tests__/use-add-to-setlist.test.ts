import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// --- Mocks ---

const mockToast = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => mockToast(...args), {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToast(...args),
  }),
}))

const mockSubscribeToAllSetlists = vi.fn()
const mockSubscribeToSetlist = vi.fn()

vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: () => ({
    subscribeToAllSetlists: mockSubscribeToAllSetlists,
    subscribeToSetlist: mockSubscribeToSetlist,
  }),
}))

// Setlist sync PR 3: rows are appended through the ops client (one batch of
// inserts at the end); undo is one batch of removes. No parent-doc write.
const mockAppendRows = vi.fn(async (_setlistId: string, rows: unknown[], opts?: { onBatch?: (k: string) => void }) => {
  opts?.onBatch?.('b1')
  return rows.map((_r, i) => `new-${i}`)
})
const mockSettle = vi.fn(async (): Promise<'ok' | 'offline'> => 'ok')
const mockReplay = vi.fn(async () => true)
vi.mock('@/lib/setlist-ops-client/actions', () => ({
  appendRows: (setlistId: string, rows: unknown[], opts?: { onBatch?: (k: string) => void }) => mockAppendRows(setlistId, rows, opts),
  settleBatch: () => mockSettle(),
  replayOps: (...a: unknown[]) => mockReplay(...(a as [])),
  SetlistOpRefusedError: class extends Error {},
}))

const mockAuth: { user: { uid: string; displayName: string } | null; isAdmin: boolean; isBandLeader: boolean; isMusician: boolean } = {
  user: { uid: 'user-1', displayName: 'Test User' },
  isAdmin: false,
  isBandLeader: true,
  isMusician: false,
}

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}))

import { useAddToSetlist } from '@/hooks/use-add-to-setlist'
import type { DriveFile, Setlist } from '@/types/models'

// --- Test Data ---

const makeDriveFile = (overrides: Partial<DriveFile> = {}): DriveFile => ({
  id: 'file-1',
  name: 'Test_Song.pdf',
  mimeType: 'application/pdf',
  ...overrides,
})

const makeSetlist = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'setlist-1',
  name: 'Shabbat Morning',
  date: new Date('2026-03-15'),
  updatedAt: new Date('2026-03-15'),
  trackCount: 0,
  ownerId: 'user-1',
  ...overrides,
})

describe('useAddToSetlist', () => {
  let allCallback: ((setlists: Setlist[], fromCache: boolean) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    allCallback = null
    mockAuth.isAdmin = false
    mockAuth.isBandLeader = true
    mockAuth.isMusician = false

    mockSubscribeToAllSetlists.mockImplementation((cb: (setlists: Setlist[], fromCache: boolean) => void) => {
      allCallback = cb
      return vi.fn() // unsubscribe
    })
  })

  // --- Permission Gating ---

  describe('canAddToSetlist', () => {
    it('returns true for band leaders', () => {
      mockAuth.isBandLeader = true
      mockAuth.isAdmin = false
      const { result } = renderHook(() => useAddToSetlist())
      expect(result.current.canAddToSetlist).toBe(true)
    })

    it('returns true for admins', () => {
      mockAuth.isBandLeader = false
      mockAuth.isAdmin = true
      const { result } = renderHook(() => useAddToSetlist())
      expect(result.current.canAddToSetlist).toBe(true)
    })

    it('returns false for musicians', () => {
      mockAuth.isBandLeader = false
      mockAuth.isAdmin = false
      mockAuth.isMusician = true
      const { result } = renderHook(() => useAddToSetlist())
      expect(result.current.canAddToSetlist).toBe(false)
    })
  })

  // --- Sheet Open/Close ---

  describe('openForSongs', () => {
    it('opens the sheet with pending songs', () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile()

      act(() => {
        result.current.openForSongs([file])
      })

      expect(result.current.isOpen).toBe(true)
      expect(result.current.pendingSongs).toEqual([file])
    })

    it('is a no-op for empty array', () => {
      const { result } = renderHook(() => useAddToSetlist())

      act(() => {
        result.current.openForSongs([])
      })

      expect(result.current.isOpen).toBe(false)
      expect(result.current.pendingSongs).toEqual([])
    })
  })

  // --- Setlist Merge/Sort/Filter ---

  describe('editableSetlists', () => {
    it('shows all setlists sorted by updatedAt desc', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const sl1 = makeSetlist({ id: 'sl-1', name: 'Older', updatedAt: new Date('2026-03-10') })
      const sl2 = makeSetlist({ id: 'sl-2', name: 'Newer', updatedAt: new Date('2026-03-15') })

      act(() => {
        allCallback?.([sl1, sl2], false)
      })

      expect(result.current.editableSetlists).toHaveLength(2)
      expect(result.current.editableSetlists[0].id).toBe('sl-2') // most recent
      expect(result.current.editableSetlists[1].id).toBe('sl-1')
    })

    it('sorts by updatedAt descending', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const older = makeSetlist({ id: 'sl-1', updatedAt: new Date('2026-03-01') })
      const newer = makeSetlist({ id: 'sl-2', updatedAt: new Date('2026-03-15') })

      act(() => {
        allCallback?.([older, newer], false)
      })

      expect(result.current.editableSetlists[0].id).toBe('sl-2')
      expect(result.current.editableSetlists[1].id).toBe('sl-1')
    })

    it('filters by searchQuery (case-insensitive substring)', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const s1 = makeSetlist({ id: 'sl-1', name: 'Shabbat Morning', updatedAt: new Date('2026-03-15') })
      const s2 = makeSetlist({ id: 'sl-2', name: 'Friday Night', updatedAt: new Date('2026-03-14') })

      act(() => {
        allCallback?.([s1, s2], false)
      })

      act(() => {
        result.current.setSearchQuery('friday')
      })

      expect(result.current.editableSetlists).toHaveLength(1)
      expect(result.current.editableSetlists[0].name).toBe('Friday Night')
    })
  })

  // --- Loading State ---

  describe('loading', () => {
    it('starts as loading until subscription fires', () => {
      const { result } = renderHook(() => useAddToSetlist())
      expect(result.current.loading).toBe(true)

      act(() => {
        allCallback?.([], false)
      })

      expect(result.current.loading).toBe(false)
    })
  })

  // --- addToSetlist ---

  describe('addToSetlist', () => {
    it('appends the picks as ONE batch of explicit row fields (no ids, stamps, order or tenant from the client)', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'drive-abc', name: 'My_Song.pdf', metadata: { key: 'Am' } })
      const setlist = makeSetlist({ id: 'sl-1' })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      expect(mockAppendRows).toHaveBeenCalledOnce()
      const [id, rows] = mockAppendRows.mock.calls[0]
      expect(id).toBe('sl-1')
      expect(rows).toEqual([
        { title: 'My Song', type: 'song', songId: 'drive-abc', fileId: 'drive-abc', fileName: 'My_Song.pdf', key: 'Am' },
      ])
    })

    it('offline: nothing is queued and the author is told why', async () => {
      mockAppendRows.mockResolvedValueOnce(null as never)
      const { result } = renderHook(() => useAddToSetlist())
      act(() => { result.current.openForSongs([makeDriveFile()]) })
      await act(async () => {
        await result.current.addToSetlist('sl-1', makeSetlist())
      })
      expect(mockToast).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledOnce()
    })

    it('"Added" waits for the server: no success toast until the batch is answered', async () => {
      mockSettle.mockResolvedValueOnce('offline')
      const { result } = renderHook(() => useAddToSetlist())
      act(() => { result.current.openForSongs([makeDriveFile()]) })
      await act(async () => {
        await result.current.addToSetlist('sl-1', makeSetlist())
      })
      expect(mockSettle).toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledOnce()
    })

    it('closes the sheet after adding', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile()
      const setlist = makeSetlist()

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      expect(result.current.isOpen).toBe(false)
    })

    it('shows toast with song name and setlist name', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ name: 'Hallelujah.pdf' })
      const setlist = makeSetlist({ name: 'Shabbat Morning' })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      expect(mockToast).toHaveBeenCalledOnce()
      expect(mockToast.mock.calls[0][0]).toContain('Hallelujah')
      expect(mockToast.mock.calls[0][0]).toContain('Shabbat Morning')
    })

    it('shows duplicate warning when song already in setlist', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'file-dup', name: 'Existing_Song.pdf' })
      const setlist = makeSetlist({
        trackCount: 1,
        fileIds: ['file-dup'],
      })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      // Should still add (not blocked).
      expect(mockAppendRows).toHaveBeenCalledOnce()

      // Toast should mention duplicate
      expect(mockToast.mock.calls[0][0]).toContain('already in this setlist')
    })

    it('batch add shows single aggregate toast', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const files = [
        makeDriveFile({ id: 'f1', name: 'Song_A.pdf' }),
        makeDriveFile({ id: 'f2', name: 'Song_B.pdf' }),
        makeDriveFile({ id: 'f3', name: 'Song_C.pdf' }),
      ]
      const setlist = makeSetlist({ name: 'Friday Night' })

      act(() => {
        result.current.openForSongs(files)
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      expect(mockToast).toHaveBeenCalledOnce()
      expect(mockToast.mock.calls[0][0]).toContain('3')
      expect(mockToast.mock.calls[0][0]).toContain('Friday Night')
    })
  })

  // --- Undo ---

  describe('undo', () => {
    it('removes only the rows it added, as one batch', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'file-new' })
      const setlist = makeSetlist({
        id: 'sl-1',
        trackCount: 1,
        fileIds: ['file-old'],
      })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      // Get the undo callback from the toast call.
      const toastOptions = mockToast.mock.calls[0][1]
      expect(toastOptions.action).toBeDefined()
      expect(toastOptions.action.label).toBe('Undo')

      await act(async () => {
        await toastOptions.action.onClick()
      })

      expect(mockReplay).toHaveBeenCalledOnce()
      expect(mockReplay).toHaveBeenCalledWith('sl-1', [{ kind: 'remove', rowId: 'new-0' }])
    })
  })
})
