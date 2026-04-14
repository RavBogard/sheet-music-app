import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const mockHasFile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(false)
const mockGetFile = vi.fn<(id: string) => Promise<Blob | null>>().mockResolvedValue(null)
const mockPutFile = vi.fn<(id: string, blob: Blob) => Promise<void>>().mockResolvedValue()

vi.mock('@/lib/offline-idb', () => ({
  hasFile: (id: string) => mockHasFile(id),
  getFile: (id: string) => mockGetFile(id),
  putFile: (id: string, blob: Blob) => mockPutFile(id, blob),
}))

import { useOffline } from '@/hooks/use-offline'
import { toast } from 'sonner'
import type { SetlistTrack } from '@/types/models'

function makeBlobResponse(): Response {
  return {
    ok: true,
    blob: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
  } as unknown as Response
}

describe('useOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeBlobResponse()))
    mockHasFile.mockResolvedValue(false)
    mockGetFile.mockResolvedValue(null)
    mockPutFile.mockResolvedValue()
  })

  it('starts with empty state', () => {
    const { result } = renderHook(() => useOffline())
    expect(result.current.offlineStatus).toEqual({})
    expect(result.current.isDownloading).toBe(false)
    expect(result.current.bulkProgress).toBeNull()
  })

  it('checkOfflineStatus reports cache status for tracks', async () => {
    mockHasFile.mockImplementation((id: string) => Promise.resolve(id === 'file-1'))

    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
      { id: 't2', fileId: 'file-2', title: 'Song B' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.checkOfflineStatus(tracks) })

    expect(result.current.offlineStatus['file-1']).toBe(true)
    expect(result.current.offlineStatus['file-2']).toBe(false)
  })

  it('downloadFile fetches, writes blob to IDB, and marks offline=true', async () => {
    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.downloadFile('file-1', 'Song A')
    })

    expect(fetch).toHaveBeenCalledWith('/api/drive/file/file-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mockPutFile).toHaveBeenCalledWith('file-1', expect.any(Blob))
    expect(result.current.offlineStatus['file-1']).toBe(true)
    expect(result.current.downloading['file-1']).toBe(false)
  })

  it('downloadFile failure (!res.ok) does NOT mark offline=true', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadFile('file-1', 'Song A') })

    expect(mockPutFile).not.toHaveBeenCalled()
    expect(result.current.offlineStatus['file-1']).toBeUndefined()
    expect(result.current.downloading['file-1']).toBe(false)
  })

  it('downloadFile fetch throw does NOT mark offline=true', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadFile('file-1', 'Song A') })

    expect(mockPutFile).not.toHaveBeenCalled()
    expect(result.current.offlineStatus['file-1']).toBeUndefined()
  })

  it('downloadFile empty blob (size 0) does NOT mark offline=true', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob([], { type: 'application/pdf' }),
    } as unknown as Response)

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadFile('file-1', 'Song A') })

    expect(mockPutFile).not.toHaveBeenCalled()
    expect(result.current.offlineStatus['file-1']).toBeUndefined()
  })

  it('downloadSetlist all-success toasts "N files saved for offline use"', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
      { id: 't2', fileId: 'file-2', title: 'Song B' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadSetlist(tracks) })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mockPutFile).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('2 files saved for offline use')
    expect(result.current.bulkProgress).toBeNull()
  })

  it('downloadSetlist partial failure toasts "N of M files saved — K failed"', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
      { id: 't2', fileId: 'file-2', title: 'Song B' } as SetlistTrack,
    ]

    // First call succeeds, second fails.
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeBlobResponse())
      .mockResolvedValueOnce({ ok: false } as Response)

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadSetlist(tracks) })

    expect(mockPutFile).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith('1 of 2 files saved — 1 failed')
    expect(result.current.offlineStatus['file-1']).toBe(true)
    expect(result.current.offlineStatus['file-2']).toBeUndefined()
  })

  it('downloadSetlist all-failure toasts error', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
    ]
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadSetlist(tracks) })

    expect(toast.error).toHaveBeenCalledWith('Could not save any files for offline use')
    expect(mockPutFile).not.toHaveBeenCalled()
  })

  it('downloadSetlist shows "already offline" when all cached', async () => {
    mockHasFile.mockResolvedValue(true)
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadSetlist(tracks) })

    expect(fetch).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Already available offline')
  })

  it('downloadSetlist silent mode suppresses toasts', async () => {
    const tracks = [
      { id: 't1', fileId: 'file-1', title: 'Song A' } as SetlistTrack,
    ]

    const { result } = renderHook(() => useOffline())
    await act(async () => { await result.current.downloadSetlist(tracks, { silent: true }) })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('getCachedFile returns blob from IDB when present', async () => {
    const blob = new Blob(['cached-body'])
    mockGetFile.mockResolvedValue(blob)

    const { result } = renderHook(() => useOffline())
    let cached: Blob | null = null
    await act(async () => { cached = await result.current.getCachedFile('file-1') })

    expect(cached).toBe(blob)
  })

  it('getCachedFile returns null when IDB has no entry', async () => {
    mockGetFile.mockResolvedValue(null)

    const { result } = renderHook(() => useOffline())
    let cached: Blob | null = null
    await act(async () => { cached = await result.current.getCachedFile('file-1') })

    expect(cached).toBeNull()
  })
})
