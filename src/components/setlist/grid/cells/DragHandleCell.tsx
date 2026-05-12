'use client'

import type {
    DraggableAttributes,
    DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface DragHandleCellProps {
    /** Comes from useSortable() via the SortableRow wrapper. */
    attributes?: DraggableAttributes
    listeners?: DraggableSyntheticListeners
    title: string
    onDelete?: () => void
    /** v50-05-03 multi-select: row is in the selection set. */
    isSelected?: boolean
    /** v50-05-03 multi-select: invoked when Shift / Cmd / Ctrl + click. */
    onSelectionClick?: (modifiers: { shift: boolean; meta: boolean }) => void
}

export function DragHandleCell({
    attributes,
    listeners,
    title,
    onDelete,
    isSelected = false,
    onSelectionClick,
}: DragHandleCellProps) {
    // @dnd-kit's keyboard sensor handler arrives via `listeners.onKeyDown`.
    // We compose it with our own Backspace/Delete handler so the row can be
    // deleted via keyboard while retaining drag-keyboard behaviour. Spread
    // `listeners` FIRST, then override `onKeyDown` so our handler runs first
    // and forwards non-delete keys to dnd-kit.
    const dndKeyDown = (
        listeners as { onKeyDown?: React.KeyboardEventHandler } | undefined
    )?.onKeyDown
    const onKeyDown: React.KeyboardEventHandler = (e) => {
        if (
            onDelete &&
            (e.key === 'Backspace' || e.key === 'Delete') &&
            !e.metaKey &&
            !e.ctrlKey
        ) {
            e.preventDefault()
            onDelete()
            return
        }
        dndKeyDown?.(e)
    }

    // v50-05-03 multi-select: Shift / Cmd / Ctrl + click routes to selection.
    // Plain clicks fall through. Mouse drag activates after 5px of motion
    // (MouseSensor distance-based constraint); touch drag activates after a
    // 200ms hold (TouchSensor delay-based constraint). The row's long-press
    // → context-menu handler (SortableRow.handlePointerDown) early-returns
    // on events whose target is inside [data-drag-handle], so touching the
    // handle never opens the row's context menu.
    const onClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
        if (!onSelectionClick) return
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault()
            e.stopPropagation()
            onSelectionClick({
                shift: e.shiftKey,
                meta: e.metaKey || e.ctrlKey,
            })
        }
    }

    return (
        <button
            type="button"
            tabIndex={0}
            data-testid="drag-handle"
            data-drag-handle=""
            data-row-title={title}
            data-selected={isSelected || undefined}
            {...attributes}
            {...listeners}
            // dnd-kit's `attributes` injects its own aria-pressed (for drag
            // state). Override AFTER the spread so multi-select selection
            // wins as the user-visible aria-pressed signal. Same reasoning
            // for aria-label and onClick/onKeyDown — keep our composed
            // versions, not dnd-kit's defaults.
            aria-label={`${isSelected ? 'Selected — ' : ''}Drag to reorder${title ? ` ${title}` : ''}, or press Backspace to delete`}
            aria-pressed={isSelected ? true : undefined}
            onKeyDown={onKeyDown}
            onClick={onClick}
            className={cn(
                'flex h-11 w-11 items-center justify-center rounded-sm cursor-pointer',
                isSelected
                    ? 'text-indigo-300 bg-indigo-500/10 ring-1 ring-indigo-400/40'
                    : [
                          // Desktop: ghost until hovered
                          'text-muted-foreground/60 hover:text-muted-foreground',
                          // Touch: always full opacity — no hover state
                          // means the muted ghost is invisible on iPad
                          '[@media(pointer:coarse)]:text-muted-foreground',
                      ].join(' '),
                'cursor-grab active:cursor-grabbing touch-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                'transition-colors duration-150 motion-reduce:transition-none',
            )}
        >
            <GripVertical aria-hidden className="h-5 w-5" />
        </button>
    )
}
