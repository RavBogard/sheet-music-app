'use client'

import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'

import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import { useUndoStore, type UndoableDoc } from '@/lib/local/undo-store'
import { getDb } from '@/lib/local/schema'

import { MobileRowCard } from './MobileRowCard'
import { computeReorderUpdates } from './SetlistGrid'

export interface MobileCardListProps {
    setlistId: string
    tracks: LocalTrack[]
    /** Edit row from ContextMenu — same handler as desktop. */
    onContextEditRow: (rowIndex: number) => void
    /** Bind chart from ContextMenu OR Sheet "Bind chart" button. */
    onContextBindChart: (rowId: string) => void
    /** Duplicate row from ContextMenu — uses existing cascade pattern. */
    onContextDuplicate: (rowId: string) => void
    /** Delete row (selection-aware) — same handler as desktop. */
    onContextDelete: (track: LocalTrack) => void
    /** Per-field commit from the edit Sheet.
     *  v50-06-01: third arg is the row's last-known server `updatedAt`,
     *  threaded into the EditDescriptor's `expectedUpdatedAt` precondition. */
    onCommitTrackPatch: (
        docId: string,
        patch: Record<string, unknown>,
        expectedUpdatedAt?: number,
    ) => Promise<void>
    /** Single-row delete (called when Sheet's Delete button fires). */
    onDeleteRow: (track: LocalTrack) => void
}

/**
 * v50-05-05 mobile parallel render path (below 768px) — REPURPOSED as the
 * ONLY render path post-0ec6773c (desktop TanStack table was deleted).
 *
 * T1.1 fix (2026-05-12, Bug 4): added @dnd-kit drag-and-drop reorder.
 * Previously cards had a grip icon that toggled multi-select on click —
 * no drag at all. Now the grip is a real drag handle (MouseSensor on
 * desktop, TouchSensor with 200ms hold on touch), and the multi-select
 * affordance is removed. Move Up / Move Down buttons in the per-card
 * edit pane are also removed.
 *
 * Activation pattern (mirrors the original Bug 1 sensor split):
 *   - MouseSensor distance:5 — desktop drag starts after 5px of motion;
 *     plain clicks remain clicks (the edit pane tap continues to work).
 *   - TouchSensor delay:200, tolerance:5 — touch must hold 200ms before
 *     drag activates, disambiguating from scroll and from tap-to-edit.
 *   - KeyboardSensor — Space + arrows preserves keyboard a11y.
 *
 * The drag-end handler reuses `computeReorderUpdates` from SetlistGrid
 * (the same pure function the dead desktop table used), so the
 * persistence semantics are identical: N parallel applyEdit calls with
 * `order` patches + a composite undo entry.
 */
export function MobileCardList({
    setlistId: _setlistId,
    tracks,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
    onCommitTrackPatch,
    onDeleteRow,
}: MobileCardListProps) {
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 200, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    const sortableIds = useMemo(() => tracks.map((t) => t.id), [tracks])

    const handleDragEnd = async (e: DragEndEvent) => {
        const { active, over } = e
        if (!over) return
        const updates = computeReorderUpdates(
            tracks,
            String(active.id),
            String(over.id),
        )
        if (updates.length === 0) return

        // Snapshot prevDocs for the composite undo entry — N parallel order
        // patches should revert as ONE user-perceived action. Mirrors the
        // pattern from the deleted desktop handleDragEnd.
        const prevDocs = updates
            .map(({ id }) => tracks.find((r) => r.id === id))
            .filter((r): r is LocalTrack => Boolean(r))
            .map((r) => ({ ...r }))

        await Promise.all(
            updates.map(({ id, order }) => {
                const r = tracks.find((row) => row.id === id)
                return applyEdit(
                    {
                        op: 'update',
                        collection: 'tracks',
                        docId: id,
                        patch: { order },
                        expectedUpdatedAt: r?.updatedAt,
                    },
                    { withoutUndo: true },
                )
            }),
        )

        const db = getDb()
        const newDocs = await Promise.all(
            updates.map(
                async ({ id }) =>
                    (await db.tracks.get(id)) as UndoableDoc | undefined,
            ),
        )
        useUndoStore.getState().pushEntry({
            kind: 'composite',
            label: `Reorder ${updates.length} rows`,
            entries: updates.map((u, i) => ({
                op: 'update' as const,
                collection: 'tracks' as const,
                docId: u.id,
                prevDoc: prevDocs[i] as UndoableDoc,
                newDoc: newDocs[i],
            })),
            ts: Date.now(),
        })
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void handleDragEnd(e)}
        >
            <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
            >
                <ul
                    role="list"
                    data-testid="mobile-card-list"
                    className="flex flex-col gap-2 p-3"
                >
                    {tracks.map((track, idx) => {
                        const isEditing = editingTrackId === track.id

                        return (
                            <MobileRowCard
                                key={track.id}
                                track={track}
                                isEditing={isEditing}
                                onTap={() =>
                                    setEditingTrackId(
                                        isEditing ? null : track.id,
                                    )
                                }
                                onContextEditRow={() => onContextEditRow(idx)}
                                onContextBindChart={() =>
                                    onContextBindChart(track.id)
                                }
                                onContextDuplicate={() =>
                                    onContextDuplicate(track.id)
                                }
                                onContextDelete={() => onContextDelete(track)}
                                onCommit={async (patch) => {
                                    await onCommitTrackPatch(
                                        track.id,
                                        patch as Record<string, unknown>,
                                        track.updatedAt,
                                    )
                                }}
                                onDeleteRow={() => {
                                    onDeleteRow(track)
                                    setEditingTrackId(null)
                                }}
                            />
                        )
                    })}
                </ul>
            </SortableContext>
        </DndContext>
    )
}
