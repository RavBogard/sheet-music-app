"use client"

import { Trash2, X, CopyPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BatchActionBarProps {
    selectedCount: number
    totalCount: number
    onDelete: () => void
    onDuplicate: () => void
    onSelectAll: () => void
    onClearSelection: () => void
    onExitSelectMode: () => void
}

export function BatchActionBar({
    selectedCount,
    totalCount,
    onDelete,
    onDuplicate,
    onSelectAll,
    onClearSelection,
    onExitSelectMode,
}: BatchActionBarProps) {
    const allSelected = selectedCount === totalCount && totalCount > 0

    return (
        <div className="sticky bottom-0 z-30 bg-background/95 backdrop-blur border-t border-border px-4 py-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-auto">
                {selectedCount} selected
            </span>

            <Button
                variant="ghost"
                size="sm"
                onClick={allSelected ? onClearSelection : onSelectAll}
                className="text-xs"
            >
                {allSelected ? "Deselect All" : "Select All"}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                onClick={onDuplicate}
                disabled={selectedCount === 0}
                className="text-xs gap-1"
            >
                <CopyPlus className="h-3.5 w-3.5" />
                Duplicate
            </Button>

            <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={selectedCount === 0}
                className="text-xs gap-1 text-red-500 hover:text-red-400 hover:bg-red-500/10"
            >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
            </Button>

            <Button
                variant="ghost"
                size="icon"
                onClick={onExitSelectMode}
                className="h-8 w-8 ml-1"
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
