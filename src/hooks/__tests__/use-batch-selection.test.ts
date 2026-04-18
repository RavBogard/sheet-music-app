import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

import { toast } from 'sonner'
import { useBatchSelection } from '@/hooks/use-batch-selection'
import type { SetlistTrack } from '@/types/models'

describe('useBatchSelection', () => {
  const mockTracks: SetlistTrack[] = [
    { id: 'track-1', title: 'Song A', type: 'song', position: 0 } as SetlistTrack,
    { id: 'track-2', title: 'Song B', type: 'song', position: 1 } as SetlistTrack,
    { id: 'track-3', title: 'Song C', type: 'song', position: 2 } as SetlistTrack,
  ]

  let addToHistory: ReturnType<typeof vi.fn>
  let setTracks: ReturnType<typeof vi.fn>
  let undoFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addToHistory = vi.fn()
    setTracks = vi.fn((updater: (prev: SetlistTrack[]) => SetlistTrack[]) => {
      // Execute the updater to verify it works
      if (typeof updater === 'function') updater(mockTracks)
    })
    undoFn = vi.fn()
    vi.clearAllMocks()
  })

  function renderBatchHook(tracks = mockTracks) {
    return renderHook(() =>
      useBatchSelection({
        tracks,
        addToHistory,
        setTracks,
        undo: undoFn,
      })
    )
  }

  it('starts with selectMode=false and empty selection', () => {
    const { result } = renderBatchHook()
    expect(result.current.selectMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggleSelectId adds and removes IDs', () => {
    const { result } = renderBatchHook()

    act(() => {
      result.current.toggleSelectId('track-1')
    })
    expect(result.current.selectedIds.has('track-1')).toBe(true)

    act(() => {
      result.current.toggleSelectId('track-1')
    })
    expect(result.current.selectedIds.has('track-1')).toBe(false)
  })

  it('handleBatchDelete removes selected tracks and shows toast', () => {
    const { result } = renderBatchHook()

    act(() => {
      result.current.toggleSelectId('track-1')
      result.current.toggleSelectId('track-2')
    })

    act(() => {
      result.current.handleBatchDelete()
    })

    expect(addToHistory).toHaveBeenCalledWith(mockTracks)
    expect(setTracks).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('2 items deleted', expect.objectContaining({
      action: expect.objectContaining({ label: 'Undo' }),
      duration: 5000,
    }))
    // Selection should be cleared
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('handleBatchDelete does nothing with empty selection', () => {
    const { result } = renderBatchHook()

    act(() => {
      result.current.handleBatchDelete()
    })

    expect(addToHistory).not.toHaveBeenCalled()
    expect(setTracks).not.toHaveBeenCalled()
  })

  it('handleBatchDuplicate inserts copies after last selected', () => {
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('new-id-1') })

    const { result } = renderBatchHook()

    act(() => {
      result.current.toggleSelectId('track-2')
    })

    act(() => {
      result.current.handleBatchDuplicate()
    })

    expect(addToHistory).toHaveBeenCalledWith(mockTracks)
    expect(setTracks).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('1 item duplicated')
    expect(result.current.selectedIds.size).toBe(0)

    vi.unstubAllGlobals()
  })

  it('exitSelectMode clears mode and selection', () => {
    const { result } = renderBatchHook()

    act(() => {
      result.current.setSelectMode(true)
      result.current.toggleSelectId('track-1')
    })
    expect(result.current.selectMode).toBe(true)
    expect(result.current.selectedIds.size).toBe(1)

    act(() => {
      result.current.exitSelectMode()
    })
    expect(result.current.selectMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('singular form for single item delete toast', () => {
    const { result } = renderBatchHook()

    act(() => {
      result.current.toggleSelectId('track-1')
    })

    act(() => {
      result.current.handleBatchDelete()
    })

    expect(toast).toHaveBeenCalledWith('1 item deleted', expect.any(Object))
  })
})
