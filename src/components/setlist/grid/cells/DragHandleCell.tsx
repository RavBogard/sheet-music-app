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
}

export function DragHandleCell({
    attributes,
    listeners,
    title,
    onDelete,
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

    return (
        <button
            type="button"
            tabIndex={0}
            aria-label={`Drag to reorder${title ? ` ${title}` : ''}, or press Backspace to delete`}
            data-testid="drag-handle"
            data-row-title={title}
            {...attributes}
            {...listeners}
            onKeyDown={onKeyDown}
            className={cn(
                'flex h-11 w-11 items-center justify-center rounded-sm',
                'text-muted-foreground/60 hover:text-muted-foreground',
                'cursor-grab active:cursor-grabbing touch-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                'transition-colors duration-150 motion-reduce:transition-none',
            )}
        >
            <GripVertical aria-hidden className="h-4 w-4" />
        </button>
    )
}
