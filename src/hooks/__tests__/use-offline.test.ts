import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

const mockIsFileCached = vi.fn((_fileId?: string): Promise<boolean> => Promise.resolve(false))
vi.mock('@/lib/cache-utils', () => ({
  isFileCached: (_fileId?: string) => mockIsFileCached(_fileId),
}))

import { useOffline } from '@/hooks/use-offline'
import { toast } from 'sonner'
import type { SetlistTrack } from '@/types/models'

describe('useOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    mockIsFileCached.mockResolvedValue(false)
  })

  it('starts with empty state', () => {
    const { result } = renderHook(() => useOffline())
    expect(result.current.offlineStatus).toEqual({})
    expect(result.current.isDownloading).toBe(false)
    expect(result.current.bulkProgress).toBeNull()
  })

  it('checkOfflineStatus reports cache status for tracks', async () => {
    mockIsFileCached.mockImplementation((_fileId?: string) =>
      Promise.resolve(_fileId === 'file-1')
    )

    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
      { id: 't2', fileId: 'file-2', title: 'Song B' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.checkOfflineStatus(tracks)
    })

    expect(result.current.offlineStatus['file-1']).toBe(true)
    expect(result.current.offlineStatus['file-2']).toBe(false)
  })

  it('downloadFile fetches and updates status', async () => {
    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadFile('file-1', 'Song A')
    })

    expect(fetch).toHaveBeenCalledWith('/api/drive/file/file-1')
    expect(result.current.offlineStatus['file-1']).toBe(true)
    expect(result.current.downloading['file-1']).toBe(false)
  })

  it('downloadFile handles errors gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadFile('file-1', 'Song A')
    })

    // Should not crash, downloading flag cleared
    expect(result.current.downloading['file-1']).toBe(false)
  })

  it('downloadSetlist downloads uncached files', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
      { id: 't2', fileId: 'file-2', title: 'Song B' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadSetlist(tracks)
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('2 files saved for offline use')
    expect(result.current.bulkProgress).toBeNull()
  })

  it('downloadSetlist shows "already offline" when all cached', async () => {
    mockIsFileCached.mockResolvedValue(true)

    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadSetlist(tracks)
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Already available offline')
  })

  it('downloadSetlist silent mode suppresses toasts', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadSetlist(tracks, { silent: true })
    })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('getCachedFile returns null for uncached files', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('not cached'))

    const { result } = renderHook(() => useOffline())

    let cached: Blob | null = null
    await act(async () => {
      cached = await result.current.getCachedFile('file-1')
    })

    expect(cached).toBeNull()
  })
})
