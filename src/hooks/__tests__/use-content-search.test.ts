import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetIdToken = vi.fn().mockResolvedValue('mock-token')

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'user-1', getIdToken: mockGetIdToken },
  })),
}))

import { useContentSearch } from '@/hooks/use-content-search'

describe('useContentSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('starts with empty state', () => {
    const { result } = renderHook(() => useContentSearch())
    expect(result.current.results).toEqual([])
    expect(result.current.searching).toBe(false)
    expect(result.current.query).toBe('')
  })

  it('does not search for terms shorter than 2 chars', async () => {
    const { result } = renderHook(() => useContentSearch())

    await act(async () => {
      await result.current.search('a')
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('fetches search results with auth token', async () => {
    const mockResults = [{ fileId: 'f1', fileName: 'Song.pdf', matches: [] }]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: mockResults }),
    } as Response)

    const { result } = renderHook(() => useContentSearch())

    await act(async () => {
      await result.current.search('Am chord')
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/library/search-content?q=Am%20chord',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
      })
    )
    expect(result.current.results).toEqual(mockResults)
    expect(result.current.query).toBe('Am chord')
  })

  it('clears results on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useContentSearch())

    await act(async () => {
      await result.current.search('test query')
    })

    expect(result.current.results).toEqual([])
  })

  it('clear resets results and query', async () => {
    const { result } = renderHook(() => useContentSearch())

    // Set some state first via search mock
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ fileId: 'f1' }] }),
    } as Response)

    await act(async () => {
      await result.current.search('test')
    })

    act(() => {
      result.current.clear()
    })

    expect(result.current.results).toEqual([])
    expect(result.current.query).toBe('')
  })

  it('handles AbortError silently', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.mocked(fetch).mockRejectedValue(abortError)

    const { result } = renderHook(() => useContentSearch())

    await act(async () => {
      await result.current.search('test query')
    })

    // Should not clear results on abort (they might be from prior search)
    expect(result.current.searching).toBe(false)
  })
})
