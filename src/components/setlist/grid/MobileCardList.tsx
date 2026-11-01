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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@/i18n/client'

import type { LocalTrack } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import { useUndoStore, type UndoableDoc } from '@/lib/local/undo-store'
import { getDb } from '@/lib/local/schema'

import { MobileRowCard } from './MobileRowCard'
import type { SectionBand } from './section-bands'
import { useLiveQuery } from 'dexie-react-hooks'
import { isSectionRow, sectionBands } from './section-bands'
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
    /** David's ask 4: row id → the chart swapped in for tonight. */
    tonightByRowId?: Record<string, string>
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
    tonightByRowId,
}: MobileCardListProps) {
    const t = useT()
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

    const sortableIds = useMemo(() => tracks.map((track) => track.id), [tracks])
    // Web refresh: header rows draw as hue bands with their page range.
    const bands = useMemo(() => sectionBands(tracks), [tracks])

    // Display numbers: songs and other rows count 1, 2, 3 in order; section
    // bands get none. Never touches the stored order.
    const positions = useMemo(() => {
        const out: Record<string, number> = {}
        let n = 0
        for (const track of tracks) {
            if (isSectionRow(track as { type?: unknown })) continue
            n += 1
            out[track.id] = n
        }
        return out
    }, [tracks])

    // The library each bonded chart lives in (the song's collection), for the chip.
    const songIdsKey = useMemo(
        () => [...new Set(tracks.map((tr) => tr.songId).filter((id): id is string => Boolean(id)))].sort().join('|'),
        [tracks],
    )
    const collections = useLiveQuery(
        async () => {
            const ids = songIdsKey ? songIdsKey.split('|') : []
            if (ids.length === 0) return {} as Record<string, string>
            try {
                const rows = await getDb().songs.bulkGet(ids)
                const out: Record<string, string> = {}
                rows.forEach((row, i) => {
                    if (row && typeof row.collection === 'string') out[ids[i]] = row.collection
                })
                return out
            } catch {
                return {} as Record<string, string>
            }
        },
        [songIdsKey],
        {} as Record<string, string>,
    )

    // dnd-kit's screen-reader instructions and live announcements (its
    // defaults are English); ids are the rows' machine ids, as before.
    const dndAccessibility = useMemo(
        () => ({
            screenReaderInstructions: { draggable: t('setlistGrid.dndInstructions') },
            announcements: {
                onDragStart: ({ active }: { active: { id: string | number } }) =>
                    t('setlistGrid.dndPickedUp', { id: String(active.id) }),
                onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
                    over
                        ? t('setlistGrid.dndMovedOver', { id: String(active.id), overId: String(over.id) })
                        : t('setlistGrid.dndNotOver', { id: String(active.id) }),
                onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
                    over
                        ? t('setlistGrid.dndDroppedOver', { id: String(active.id), overId: String(over.id) })
                        : t('setlistGrid.dndDropped', { id: String(active.id) }),
                onDragCancel: ({ active }: { active: { id: string | number } }) =>
                    t('setlistGrid.dndCancelled', { id: String(active.id) }),
            },
        }),
        [t],
    )

    // Perf audit P2-5: rows are memoized (CardRow below), so they need
    // callbacks that keep their identity. The parent passes fresh arrows on
    // every render; route them through a ref read at call time, so a focus or
    // edit-state change re-renders only the rows whose props changed instead
    // of the whole list.
    const handlersRef = useRef({
        onContextEditRow,
        onContextBindChart,
        onContextDuplicate,
        onContextDelete,
        onCommitTrackPatch,
        onDeleteRow,
    })
    useEffect(() => {
        handlersRef.current = {
            onContextEditRow,
            onContextBindChart,
            onContextDuplicate,
            onContextDelete,
            onCommitTrackPatch,
            onDeleteRow,
        }
    })
    const actions = useMemo<CardRowActions>(
        () => ({
            toggleEditing: (id) => setEditingTrackId((cur) => (cur === id ? null : id)),
            editRow: (index) => handlersRef.current.onContextEditRow(index),
            bindChart: (id) => handlersRef.current.onContextBindChart(id),
            duplicate: (id) => handlersRef.current.onContextDuplicate(id),
            contextDelete: (track) => handlersRef.current.onContextDelete(track),
            commit: (track, patch) =>
                handlersRef.current.onCommitTrackPatch(track.id, patch, track.updatedAt),
            deleteRow: (track) => {
                handlersRef.current.onDeleteRow(track)
                setEditingTrackId(null)
            },
        }),
        [],
    )

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
            accessibility={dndAccessibility}
            onDragEnd={(e) => void handleDragEnd(e)}
        >
            <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
            >
                <ul
                    role="list"
                    data-testid="mobile-card-list"
                    className="flex flex-col"
                >
                    {tracks.map((track, idx) => (
                        <CardRow
                            key={track.id}
                            track={track}
                            index={idx}
                            isEditing={editingTrackId === track.id}
                            tonightTitle={tonightByRowId?.[track.id]}
                            position={positions[track.id]}
                            collection={track.songId ? collections?.[track.songId] : undefined}
                            band={bands[track.id]}
                            actions={actions}
                        />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    )
}

interface CardRowActions {
    toggleEditing: (id: string) => void
    editRow: (index: number) => void
    bindChart: (id: string) => void
    duplicate: (id: string) => void
    contextDelete: (track: LocalTrack) => void
    commit: (track: LocalTrack, patch: Record<string, unknown>) => Promise<void>
    deleteRow: (track: LocalTrack) => void
}

interface CardRowProps {
    track: LocalTrack
    index: number
    isEditing: boolean
    tonightTitle?: string
    position?: number
    collection?: string
    band?: SectionBand
    actions: CardRowActions
}

/**
 * One list row, memoized: it re-renders only when its own track, position,
 * edit state or chip data change. `actions` is stable for the list's life.
 */
const CardRow = memo(function CardRow({
    track,
    index,
    isEditing,
    tonightTitle,
    position,
    collection,
    band,
    actions,
}: CardRowProps) {
    const onTap = useCallback(() => actions.toggleEditing(track.id), [actions, track.id])
    const onContextEditRow = useCallback(() => actions.editRow(index), [actions, index])
    const onContextBindChart = useCallback(() => actions.bindChart(track.id), [actions, track.id])
    const onContextDuplicate = useCallback(() => actions.duplicate(track.id), [actions, track.id])
    const onContextDelete = useCallback(() => actions.contextDelete(track), [actions, track])
    const onCommit = useCallback(
        async (patch: Partial<LocalTrack>) => {
            await actions.commit(track, patch as Record<string, unknown>)
        },
        [actions, track],
    )
    const onDeleteRow = useCallback(() => actions.deleteRow(track), [actions, track])
    return (
        <MobileRowCard
            track={track}
            isEditing={isEditing}
            tonightTitle={tonightTitle}
            position={position}
            collection={collection}
            band={band}
            onTap={onTap}
            onContextEditRow={onContextEditRow}
            onContextBindChart={onContextBindChart}
            onContextDuplicate={onContextDuplicate}
            onContextDelete={onContextDelete}
            onCommit={onCommit}
            onDeleteRow={onDeleteRow}
        />
    )
})
