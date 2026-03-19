import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// --- Mocks ---

const mockToast = vi.fn()
vi.mock('sonner', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}))

const mockUpdateSetlist = vi.fn().mockResolvedValue(undefined)
const mockSubscribeToPersonalSetlists = vi.fn()
const mockSubscribeToPublicSetlists = vi.fn()
const mockSubscribeToSetlist = vi.fn()

vi.mock('@/lib/setlist-firebase', () => ({
  createSetlistService: () => ({
    subscribeToPersonalSetlists: mockSubscribeToPersonalSetlists,
    subscribeToPublicSetlists: mockSubscribeToPublicSetlists,
    subscribeToSetlist: mockSubscribeToSetlist,
    updateSetlist: mockUpdateSetlist,
  }),
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
  tracks: [],
  trackCount: 0,
  isPublic: false,
  ownerId: 'user-1',
  ...overrides,
})

describe('useAddToSetlist', () => {
  let personalCallback: ((setlists: Setlist[], fromCache: boolean) => void) | null = null
  let publicCallback: ((setlists: Setlist[], fromCache: boolean) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    personalCallback = null
    publicCallback = null
    mockAuth.isAdmin = false
    mockAuth.isBandLeader = true
    mockAuth.isMusician = false

    mockSubscribeToPersonalSetlists.mockImplementation((cb: (setlists: Setlist[], fromCache: boolean) => void) => {
      personalCallback = cb
      return vi.fn() // unsubscribe
    })

    mockSubscribeToPublicSetlists.mockImplementation((cb: (setlists: Setlist[], fromCache: boolean) => void) => {
      publicCallback = cb
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
    it('merges personal and public setlists, deduplicated by ID', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const personal = makeSetlist({ id: 'sl-1', name: 'Personal', updatedAt: new Date('2026-03-10') })
      const publicSl = makeSetlist({ id: 'sl-2', name: 'Public', isPublic: true, updatedAt: new Date('2026-03-15') })
      const duplicate = makeSetlist({ id: 'sl-1', name: 'Personal (pub)', isPublic: true, updatedAt: new Date('2026-03-12') })

      act(() => {
        personalCallback?.([personal], false)
        publicCallback?.([publicSl, duplicate], false)
      })

      // Should have 2 (deduplicated), sorted by updatedAt desc
      expect(result.current.editableSetlists).toHaveLength(2)
      expect(result.current.editableSetlists[0].id).toBe('sl-2') // most recent
      expect(result.current.editableSetlists[1].id).toBe('sl-1')
    })

    it('sorts by updatedAt descending', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const older = makeSetlist({ id: 'sl-1', updatedAt: new Date('2026-03-01') })
      const newer = makeSetlist({ id: 'sl-2', updatedAt: new Date('2026-03-15') })

      act(() => {
        personalCallback?.([older, newer], false)
        publicCallback?.([], false)
      })

      expect(result.current.editableSetlists[0].id).toBe('sl-2')
      expect(result.current.editableSetlists[1].id).toBe('sl-1')
    })

    it('filters by searchQuery (case-insensitive substring)', () => {
      const { result } = renderHook(() => useAddToSetlist())

      const s1 = makeSetlist({ id: 'sl-1', name: 'Shabbat Morning', updatedAt: new Date('2026-03-15') })
      const s2 = makeSetlist({ id: 'sl-2', name: 'Friday Night', updatedAt: new Date('2026-03-14') })

      act(() => {
        personalCallback?.([s1, s2], false)
        publicCallback?.([], false)
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
    it('starts as loading until subscriptions fire', () => {
      const { result } = renderHook(() => useAddToSetlist())
      expect(result.current.loading).toBe(true)

      act(() => {
        personalCallback?.([], false)
        publicCallback?.([], false)
      })

      expect(result.current.loading).toBe(false)
    })
  })

  // --- addToSetlist ---

  describe('addToSetlist', () => {
    it('builds tracks with correct ID format and appends to setlist', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'drive-abc', name: 'My_Song.pdf', metadata: { key: 'Am' } })
      const setlist = makeSetlist({ id: 'sl-1', tracks: [], isPublic: false })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const [id, isPublic, data] = mockUpdateSetlist.mock.calls[0]
      expect(id).toBe('sl-1')
      expect(isPublic).toBe(false)
      expect(data.tracks).toHaveLength(1)
      expect(data.tracks[0].id).toMatch(/^track-\d+-drive-abc-0$/)
      expect(data.tracks[0].title).toBe('My Song')
      expect(data.tracks[0].fileId).toBe('drive-abc')
      expect(data.tracks[0].fileName).toBe('My_Song.pdf')
      expect(data.tracks[0].key).toBe('Am')
      expect(data.tracks[0].type).toBe('song')
      expect(data.trackCount).toBe(1)
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
        tracks: [{ id: 'track-old', title: 'Existing Song', fileId: 'file-dup', type: 'song' }],
        trackCount: 1,
      })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      // Should still add (not blocked)
      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const data = mockUpdateSetlist.mock.calls[0][2]
      expect(data.tracks).toHaveLength(2) // original + new

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
    it('removes only the specific added track IDs (not snapshot restore)', async () => {
      const { result } = renderHook(() => useAddToSetlist())
      const file = makeDriveFile({ id: 'file-new' })
      const setlist = makeSetlist({
        id: 'sl-1',
        tracks: [{ id: 'track-existing', title: 'Existing', fileId: 'file-old', type: 'song' }],
        trackCount: 1,
        isPublic: true,
      })

      // Mock subscribeToSetlist to return current tracks (simulating re-read)
      mockSubscribeToSetlist.mockImplementation((_id: string, _isPublic: boolean, cb: (setlist: Setlist | null) => void) => {
        // Simulate that another user added a track concurrently
        cb({
          ...setlist,
          tracks: [
            { id: 'track-existing', title: 'Existing', fileId: 'file-old', type: 'song' },
            { id: 'track-concurrent', title: 'Concurrent Add', fileId: 'file-concurrent', type: 'song' },
            // The track we added will match track-{timestamp}-file-new-0 pattern
          ],
        })
        return vi.fn() // unsubscribe
      })

      act(() => {
        result.current.openForSongs([file])
      })

      await act(async () => {
        await result.current.addToSetlist('sl-1', setlist)
      })

      // Get the undo callback from the toast call
      const toastOptions = mockToast.mock.calls[0][1]
      expect(toastOptions.action).toBeDefined()
      expect(toastOptions.action.label).toBe('Undo')

      // Capture the added track ID
      const addedTrackId = mockUpdateSetlist.mock.calls[0][2].tracks[
        mockUpdateSetlist.mock.calls[0][2].tracks.length - 1
      ].id

      // Update the subscribeToSetlist mock to include the added track
      mockSubscribeToSetlist.mockImplementation((_id: string, _isPublic: boolean, cb: (setlist: Setlist | null) => void) => {
        cb({
          ...setlist,
          tracks: [
            { id: 'track-existing', title: 'Existing', fileId: 'file-old', type: 'song' },
            { id: 'track-concurrent', title: 'Concurrent Add', fileId: 'file-concurrent', type: 'song' },
            { id: addedTrackId, title: 'Test Song', fileId: 'file-new', type: 'song' },
          ],
        })
        return vi.fn()
      })

      mockUpdateSetlist.mockClear()

      // Execute undo
      await act(async () => {
        await toastOptions.action.onClick()
      })

      // Undo should have called updateSetlist
      expect(mockUpdateSetlist).toHaveBeenCalledOnce()
      const undoData = mockUpdateSetlist.mock.calls[0][2]

      // Should keep existing + concurrent, remove only the added track
      expect(undoData.tracks).toHaveLength(2)
      expect(undoData.tracks.find((t: { id: string }) => t.id === 'track-existing')).toBeDefined()
      expect(undoData.tracks.find((t: { id: string }) => t.id === 'track-concurrent')).toBeDefined()
      expect(undoData.tracks.find((t: { id: string }) => t.id === addedTrackId)).toBeUndefined()
    })
  })
})
