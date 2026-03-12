import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

let onSnapshotCallback: ((snapshot: unknown) => void) | null = null
let onSnapshotErrorCallback: ((err: Error) => void) | null = null
const mockUnsub = vi.fn()

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((
    _ref: unknown,
    onNext: (snapshot: unknown) => void,
    onError: (err: Error) => void,
  ) => {
    onSnapshotCallback = onNext
    onSnapshotErrorCallback = onError
    return mockUnsub
  }),
}))

import { useSafeFirestoreSync } from '@/hooks/use-safe-firestore-sync'

describe('useSafeFirestoreSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onSnapshotCallback = null
    onSnapshotErrorCallback = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null data and loading=false when ref is null', () => {
    const { result } = renderHook(() => useSafeFirestoreSync(null))
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets loading=true when ref is provided', () => {
    const mockRef = { type: 'document' } as any
    const { result } = renderHook(() => useSafeFirestoreSync(mockRef))
    expect(result.current.loading).toBe(true)
  })

  it('parses document snapshot data', () => {
    const mockRef = { type: 'document' } as any
    const { result } = renderHook(() => useSafeFirestoreSync(mockRef))

    act(() => {
      onSnapshotCallback?.({
        exists: () => true,
        id: 'doc-1',
        data: () => ({ name: 'Test Document', value: 42 }),
      })
    })

    expect(result.current.data).toEqual({ id: 'doc-1', name: 'Test Document', value: 42 })
    expect(result.current.loading).toBe(false)
  })

  it('returns null for non-existent document', () => {
    const mockRef = { type: 'document' } as any
    const { result } = renderHook(() => useSafeFirestoreSync(mockRef))

    act(() => {
      onSnapshotCallback?.({
        exists: () => false,
        id: 'doc-1',
        data: () => null,
      })
    })

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('parses query snapshot (multiple docs)', () => {
    const mockRef = { type: 'query' } as any
    const { result } = renderHook(() => useSafeFirestoreSync(mockRef))

    act(() => {
      onSnapshotCallback?.({
        docs: [
          { id: 'doc-1', data: () => ({ name: 'A' }) },
          { id: 'doc-2', data: () => ({ name: 'B' }) },
        ],
      })
    })

    expect(result.current.data).toEqual([
      { id: 'doc-1', name: 'A' },
      { id: 'doc-2', name: 'B' },
    ])
    expect(result.current.loading).toBe(false)
  })

  it('handles onSnapshot errors', () => {
    const onError = vi.fn()
    const mockRef = { type: 'document' } as any
    const { result } = renderHook(() => useSafeFirestoreSync(mockRef, { onError }))

    const error = new Error('Permission denied')
    act(() => {
      onSnapshotErrorCallback?.(error)
    })

    expect(result.current.error).toBe(error)
    expect(result.current.loading).toBe(false)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('unsubscribes on unmount', () => {
    const mockRef = { type: 'document' } as any
    const { unmount } = renderHook(() => useSafeFirestoreSync(mockRef))

    unmount()

    expect(mockUnsub).toHaveBeenCalled()
  })

  it('resubscribes when ref changes', () => {
    const ref1 = { type: 'document', path: 'a' } as any
    const ref2 = { type: 'document', path: 'b' } as any

    const { rerender } = renderHook(
      ({ ref }) => useSafeFirestoreSync(ref),
      { initialProps: { ref: ref1 as any } }
    )

    // Old subscription cleaned up
    rerender({ ref: ref2 })
    expect(mockUnsub).toHaveBeenCalled()
  })

  it('handles timeout', () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const mockRef = { type: 'document' } as any

    const { result } = renderHook(() =>
      useSafeFirestoreSync(mockRef, { timeoutMs: 5000, onError })
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error?.message).toContain('timeout')
    expect(onError).toHaveBeenCalled()
  })

  it('clears timeout when data arrives before deadline', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const mockRef = { type: 'document' } as any

    renderHook(() => useSafeFirestoreSync(mockRef, { timeoutMs: 5000 }))

    act(() => {
      onSnapshotCallback?.({
        exists: () => true,
        id: 'doc-1',
        data: () => ({ name: 'fast' }),
      })
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })
})
