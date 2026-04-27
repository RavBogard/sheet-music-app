'use client'

import { useState } from 'react'

import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'

import { MobileEditSheet } from './MobileEditSheet'
import { MobileRowCard } from './MobileRowCard'

export interface MobileCardListProps {
    setlistId: string
    tracks: LocalTrack[]
    selectedIds: ReadonlySet<string>
    onSelectionClick: (
        rowId: string,
        modifiers: { shift: boolean; meta: boolean },
    ) => void
    /** Edit row from ContextMenu — same handler as desktop. */
    onContextEditRow: (rowIndex: number) => void
    /** Bind chart from ContextMenu OR Sheet "Bind chart" button. */
    onContextBindChart: (rowId: string) => void
    /** Duplicate row from ContextMenu — uses existing cascade pattern. */
    onContextDuplicate: (rowId: string) => void
    /** Delete row (selection-aware) — same handler as desktop. */
    onContextDelete: (track: LocalTrack) => void
    /** Per-field commit from the edit Sheet. */
    onCommitTrackPatch: (
        docId: string,
        patch: Record<string, unknown>,
    ) => Promise<void>
    /** Single-row delete (called when Sheet's Delete button fires). */
    onDeleteRow: (track: LocalTrack) => void
}

/**
 * v50-05-05 mobile parallel render path (below 768px). Drops the
 * TanStack Table layout in favor of a stacked card list. Cards expose
 * title / key / lead at rest; tap → edit Sheet; long-press → action
 * menu (mirrors desktop ContextMenu).
 *
 * Reorder via the edit Sheet's Move up / Move down buttons (no
 * drag-on-card in v1; user testing decides if drag-reorder is needed).
 *
 * Selection state survives across the parallel render path naturally
 * because useGridSelection is grid-level (NOT table-level) — passed in
 * via selectedIds + onSelectionClick from the SetlistGrid parent.
 */
export function MobileCardList({
    setlistId: _setlistId,
    tracks,
    selectedIds,
    onSelectionClick,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
    onCommitTrackPatch,
    onDeleteRow,
}: MobileCardListProps) {
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null)

    const editingIndex = editingTrackId
        ? tracks.findIndex((t) => t.id === editingTrackId)
        : -1
    const editingTrack = editingIndex >= 0 ? tracks[editingIndex] : null

    const selectionCount = selectedIds.size

    const handleMoveUp = async () => {
        if (!editingTrack || editingIndex <= 0) return
        const prev = tracks[editingIndex - 1]
        // Swap orders. The v50-03 sync engine's per-doc drain ordering
        // invariant handles this correctly (each doc's outbox row
        // serializes its own writes). No cascade needed since we're
        // only swapping two adjacent rows.
        await Promise.all([
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: editingTrack.id,
                patch: { order: prev.order },
            }),
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: prev.id,
                patch: { order: editingTrack.order },
            }),
        ])
    }

    const handleMoveDown = async () => {
        if (!editingTrack || editingIndex < 0 || editingIndex >= tracks.length - 1)
            return
        const next = tracks[editingIndex + 1]
        await Promise.all([
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: editingTrack.id,
                patch: { order: next.order },
            }),
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: next.id,
                patch: { order: editingTrack.order },
            }),
        ])
    }

    return (
        <>
            <ul
                role="list"
                data-testid="mobile-card-list"
                className="flex flex-col gap-2 p-3"
            >
                {tracks.map((track, idx) => {
                    const inSelection = selectedIds.has(track.id)
                    const isInBulk = inSelection && selectionCount >= 2
                    return (
                        <MobileRowCard
                            key={track.id}
                            track={track}
                            isSelected={inSelection}
                            isInBulkSelection={isInBulk}
                            bulkSelectionCount={selectionCount}
                            onSelectionClick={(mods) =>
                                onSelectionClick(track.id, mods)
                            }
                            onTap={() => setEditingTrackId(track.id)}
                            onContextEditRow={() => onContextEditRow(idx)}
                            onContextBindChart={() =>
                                onContextBindChart(track.id)
                            }
                            onContextDuplicate={() =>
                                onContextDuplicate(track.id)
                            }
                            onContextDelete={() => onContextDelete(track)}
                        />
                    )
                })}
            </ul>

            <MobileEditSheet
                track={editingTrack}
                open={editingTrackId !== null}
                onOpenChange={(next) => {
                    if (!next) setEditingTrackId(null)
                }}
                canMoveUp={editingIndex > 0}
                canMoveDown={
                    editingIndex >= 0 && editingIndex < tracks.length - 1
                }
                onCommit={async (patch) => {
                    if (!editingTrack) return
                    await onCommitTrackPatch(
                        editingTrack.id,
                        patch as Record<string, unknown>,
                    )
                }}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDelete={() => {
                    if (!editingTrack) return
                    onDeleteRow(editingTrack)
                    setEditingTrackId(null)
                }}
                onBindChart={() => {
                    if (!editingTrack) return
                    onContextBindChart(editingTrack.id)
                }}
            />
        </>
    )
}
