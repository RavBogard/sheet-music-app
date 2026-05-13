import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// --- Mocks ---

const mockToast = vi.fn()
vi.mock('sonner', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}))

const mockUpdateSetlist = vi.fn().mockResolvedValue(undefined)
const mockSubscribeToAllSetlists = vi.fn()
const mockSubscribeToSetlist = vi.fn()

vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: () => ({
    subscribeToAllSetlists: mockSubscribeToAllSetlists,
    subscribeToSetlist: mockSubscribeToSetlist,
    updateSetlist: mockUpdateSetlist,
  }),
}))

// v60-07-01: this hook now writes per-track via applyEdit to the top-level
// `tracks/{id}` collection, plus a denormalization-only parent-doc update
// via updateSetlist. Tests assert against BOTH mocks.
const mockApplyEdit = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/local/write', () => ({
  applyEdit: (...args: unknown[]) => mockApplyEdit(...args),
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
    it('builds tracks with correct ID format and writes them to top-level via applyEdit', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'drive-abc', name: 'My_Song.pdf', metadata: { key: 'Am' } })
      const setlist = makeSetlist({ id: 'sl-1' })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      // v60-07-01: per-track writes via applyEdit('set', 'tracks', ...) — NOT
      // an embedded `tracks` array on the parent doc.
      expect(mockApplyEdit).toHaveBeenCalledOnce()
      const [edit, opts] = mockApplyEdit.mock.calls[0]
      expect(edit.op).toBe('set')
      expect(edit.collection).toBe('tracks')
      expect(edit.doc.id).toMatch(/^track-\d+-drive-abc-0$/)
      expect(edit.doc.title).toBe('My Song')
      expect(edit.doc.fileId).toBe('drive-abc')
      expect(edit.doc.songId).toBe('drive-abc')
      expect(edit.doc.setlistId).toBe('sl-1')
      expect(edit.doc.order).toBe(0)
      expect(edit.doc.type).toBe('song')
      expect(edit.doc.key).toBe('Am')
      expect(opts).toEqual({ withoutUndo: true })

      // Parent doc gets denormalization-only update — no `tracks` field.
      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const [id, data] = mockUpdateSetlist.mock.calls[0]
      expect(id).toBe('sl-1')
      expect(data.tracks).toBeUndefined()
      expect(data.trackCount).toBe(1)
      expect(data.hydrated).toBe(true)
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

      // Should still add (not blocked) — 1 new applyEdit call + 1 parent update.
      expect(mockApplyEdit).toHaveBeenCalledOnce()
      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const data = mockUpdateSetlist.mock.calls[0][1]
      // v60-07-01: trackCount reflects existing 1 + new 1; no embedded tracks field.
      expect(data.tracks).toBeUndefined()
      expect(data.trackCount).toBe(2)

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
    it('deletes only the specific added track IDs via applyEdit (engine-path)', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'file-new' })
      const setlist = makeSetlist({
        id: 'sl-1',
        trackCount: 1,
        fileIds: ['file-old'],
      })

      // Mock subscribeToSetlist to return current state (used by undo for
      // freshly-read trackCount before the decrement).
      mockSubscribeToSetlist.mockImplementation((_id: string, cb: (setlist: Setlist | null) => void) => {
        cb({
          ...setlist,
          trackCount: 2, // existing 1 + added 1 (simulating post-add state)
        })
        return vi.fn() // unsubscribe
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

      // Capture the added track ID from the first applyEdit('set', ...) call.
      const addedTrackId = mockApplyEdit.mock.calls[0][0].doc.id

      // Clear and execute undo.
      mockApplyEdit.mockClear()
      mockUpdateSetlist.mockClear()
      await act(async () => {
        await toastOptions.action.onClick()
      })

      // v60-07-01: undo issues applyEdit('delete', 'tracks', ...) per added id.
      expect(mockApplyEdit).toHaveBeenCalledOnce()
      const [edit, opts] = mockApplyEdit.mock.calls[0]
      expect(edit.op).toBe('delete')
      expect(edit.collection).toBe('tracks')
      expect(edit.docId).toBe(addedTrackId)
      expect(opts).toEqual({ withoutUndo: true })

      // Parent doc gets trackCount decrement — no embedded tracks field.
      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const undoData = mockUpdateSetlist.mock.calls[0][1]
      expect(undoData.tracks).toBeUndefined()
      expect(undoData.trackCount).toBe(1) // 2 - 1 = 1
    })
  })
})
