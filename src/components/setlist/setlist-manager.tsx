"use client"

import { useState } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSetlistStore, SetlistItem } from '@/lib/setlist-store'
import { Button } from '@/components/ui/button'
import { GripVertical, Trash2, Music2, FileText, Play } from 'lucide-react'
import { useMusicStore } from '@/lib/store'

function SortableItem({ item, isActive, onDelete, onSelect }: {
    item: SetlistItem
    isActive: boolean
    onDelete: (id: string) => void
    onSelect: (item: SetlistItem) => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: item.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
         group flex items-center gap-2 p-2 rounded-md border mb-2 bg-card
         ${isActive ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}
      `}
        >
            <button {...attributes} {...listeners} className="cursor-grab hover:text-primary text-muted-foreground p-1">
                <GripVertical className="h-4 w-4" />
            </button>

            <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelect(item)}
            >
                <div className="flex items-center gap-2 font-medium text-sm truncate">
                    {item.type === 'musicxml' ? <Music2 className="h-3 w-3 text-blue-400" /> : <FileText className="h-3 w-3 text-red-400" />}
                    <span className="truncate">{item.name}</span>
                </div>
                {(item.transposition !== undefined && item.transposition !== 0) && (
                    <div className="text-xs text-muted-foreground">
                        Key: {item.transposition > 0 ? `+${item.transposition}` : item.transposition}
                    </div>
                )}
            </div>

            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(item.id)}
            >
                <Trash2 className="h-3 w-3" />
            </Button>
        </div>
    )
}

export function SetlistManager() {
    const { items, moveItem, removeItem, activeIndex, setActiveIndex } = useSetlistStore()
    const { setFile, setTransposition, reset } = useMusicStore()

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id)
            const newIndex = items.findIndex((item) => item.id === over.id)

            moveItem(oldIndex, newIndex)
        }
    }

    const handleSelect = (item: SetlistItem, index: number) => {
        setActiveIndex(index)
        if (item.url) {
            setFile(item.url, item.type)
            if (item.transposition !== undefined) {
                setTransposition(item.transposition)
            } else {
                setTransposition(0)
            }
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Current Setlist</h3>
                <span className="text-xs text-muted-foreground">{items.length} songs</span>
            </div>

            <div className="flex-1 overflow-auto">
                {items.length === 0 ? (
                    <div className="text-center p-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                        Drag songs here or click "Add to Setlist" from the library.
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map((item, index) => (
                                <SortableItem
                                    key={item.id}
                                    item={item}
                                    isActive={activeIndex === index}
                                    onDelete={removeItem}
                                    onSelect={(i) => handleSelect(i, index)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    )
}
