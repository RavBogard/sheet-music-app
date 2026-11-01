"use client"

/**
 * Live reorder (Daniel, 2026-10-31): the leader's reorder mode on the Perform
 * page. Shown in place of the setlist while a band leader or admin has
 * Reorder on. Each row has a drag handle and Move up / Move down buttons
 * (44px, keyboard and VoiceOver friendly). Every move is handed to the page,
 * which shows it at once and writes it for the whole band.
 *
 * Touch: only the handle starts a drag (`touch-action: none` there and a
 * short hold, as in the editor), so a swipe anywhere else on the list still
 * scrolls the page. Edge tap zones live inside the chart viewer only and are
 * not mounted here.
 */

import { memo, useMemo } from "react"
import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react"

import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import { displayChartTitle } from "@/lib/format/chart-title"
import type { SetlistTrack } from "@/types/models"

export interface PerformReorderListProps {
    tracks: readonly SetlistTrack[]
    /** Move the row at `from` to `to` (indexes into `tracks`). */
    onMove: (from: number, to: number) => void
    /** Rows to highlight briefly (just moved). */
    highlightIds?: ReadonlySet<string>
}

const isHeaderRow = (t: SetlistTrack) => {
    const type = t.type as string | undefined
    return type === "header" || type === "section"
}

export function PerformReorderList({ tracks, onMove, highlightIds }: PerformReorderListProps) {
    const t = useT()
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )
    const ids = useMemo(() => tracks.map((tr) => tr.id), [tracks])
    const total = tracks.length
    const titleOf = (tr: SetlistTrack | undefined) =>
        displayChartTitle(tr?.title) || t("setlistGrid.untitledTrack")

    const accessibility = useMemo(() => {
        type DndId = { id: string | number }
        const find = (id: string | number) => tracks.find((tr) => tr.id === String(id))
        const pos = (id: string | number) => tracks.findIndex((tr) => tr.id === String(id)) + 1
        const name = (id: string | number) => displayChartTitle(find(id)?.title) || t("setlistGrid.untitledTrack")
        return {
            screenReaderInstructions: { draggable: t("setlistGrid.dndInstructions") },
            announcements: {
                onDragStart: ({ active }: { active: DndId }) =>
                    t("setlistGrid.dndPickedUp", { title: name(active.id), position: pos(active.id), total }),
                onDragOver: ({ active, over }: { active: DndId; over: DndId | null }) =>
                    over
                        ? t("setlistGrid.dndMovedOver", { title: name(active.id), position: pos(over.id), total })
                        : t("setlistGrid.dndNotOver", { title: name(active.id) }),
                onDragEnd: ({ active, over }: { active: DndId; over: DndId | null }) =>
                    over
                        ? t("setlistGrid.dndDroppedOver", { title: name(active.id), position: pos(over.id), total })
                        : t("setlistGrid.dndDropped", { title: name(active.id) }),
                onDragCancel: ({ active }: { active: DndId }) =>
                    t("setlistGrid.dndCancelled", { title: name(active.id), position: pos(active.id), total }),
            },
        }
    }, [t, tracks, total])

    const handleDragEnd = (e: DragEndEvent) => {
        if (!e.over) return
        const from = ids.indexOf(String(e.active.id))
        const to = ids.indexOf(String(e.over.id))
        if (from < 0 || to < 0 || from === to) return
        onMove(from, to)
    }

    return (
        <div className="flex-1 overflow-y-auto w-full" data-testid="perform-reorder-list">
            <div className={cn(PAGE_WIDTH_CLASS, "flex flex-col pb-24 pt-2")}>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    accessibility={accessibility}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                        <ol className="flex flex-col" aria-label={t("performSetlist.reorder.listLabel")}>
                            {tracks.map((tr, index) => (
                                <ReorderRow
                                    key={tr.id}
                                    id={tr.id}
                                    title={titleOf(tr)}
                                    songKey={isHeaderRow(tr) ? undefined : tr.key}
                                    header={isHeaderRow(tr)}
                                    index={index}
                                    total={total}
                                    highlighted={!!highlightIds?.has(tr.id)}
                                    onMove={onMove}
                                />
                            ))}
                        </ol>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    )
}

interface ReorderRowProps {
    id: string
    title: string
    songKey?: string
    header: boolean
    index: number
    total: number
    highlighted: boolean
    onMove: (from: number, to: number) => void
}

const ReorderRow = memo(function ReorderRow({
    id,
    title,
    songKey,
    header,
    index,
    total,
    highlighted,
    onMove,
}: ReorderRowProps) {
    const t = useT()
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
        useSortable({ id })
    const style = { transform: CSS.Transform.toString(transform), transition }
    const btn =
        "h-11 w-11 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"
    return (
        <li
            ref={setNodeRef}
            style={style}
            data-testid="perform-reorder-row"
            data-row-id={id}
            data-moved={highlighted || undefined}
            className={cn(
                "relative flex items-center gap-1 ps-1 pe-2 min-h-14 border-b border-rule transition-colors duration-700 motion-reduce:transition-none",
                highlighted ? "bg-brand/15" : "bg-card",
                isDragging && "z-10 shadow-lg",
            )}
        >
            <button
                type="button"
                ref={setActivatorNodeRef}
                data-testid="perform-reorder-handle"
                aria-label={t("performSetlist.reorder.dragHandle", { rowTitle: title })}
                className={cn(btn, "cursor-grab active:cursor-grabbing [touch-action:none]")}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="tnum w-7 shrink-0 text-end text-sm font-semibold text-muted-foreground" aria-hidden="true">
                {index + 1}
            </span>
            <span
                className={cn(
                    "flex-1 min-w-0 truncate ps-2",
                    header ? "text-sm font-extrabold uppercase tracking-[0.08em] text-muted-foreground" : "text-base font-semibold text-foreground",
                )}
            >
                {title}
            </span>
            {songKey && (
                <span className="tnum shrink-0 rounded-sm border border-rule bg-secondary px-2 py-0.5 text-sm font-bold">
                    {songKey}
                </span>
            )}
            <button
                type="button"
                data-testid="perform-reorder-up"
                aria-label={t("performSetlist.reorder.moveUp", { rowTitle: title })}
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
                className={btn}
            >
                <ChevronUp className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
                type="button"
                data-testid="perform-reorder-down"
                aria-label={t("performSetlist.reorder.moveDown", { rowTitle: title })}
                disabled={index >= total - 1}
                onClick={() => onMove(index, index + 1)}
                className={btn}
            >
                <ChevronDown className="h-5 w-5" aria-hidden="true" />
            </button>
        </li>
    )
})
