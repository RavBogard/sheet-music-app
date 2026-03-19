"use client"

import { Button } from "@/components/ui/button"
import { DriveFile } from "@/types/models"
import { toast } from "sonner"

interface SelectionActionBarProps {
    selectMode: boolean
    selectedIds: Set<string>
    combinedItems: DriveFile[]
    getCleanName: (name: string) => string
    onSelectAll: () => void
    onClear: () => void
    onDismiss: () => void
    onAddToSetlist?: (items: DriveFile[]) => void
}

export function SelectionActionBar({
    selectMode,
    selectedIds,
    combinedItems,
    getCleanName,
    onSelectAll,
    onClear,
    onDismiss,
    onAddToSetlist,
}: SelectionActionBarProps) {
    if (!selectMode || selectedIds.size === 0) return null

    return (
        <div className="border-t border-border bg-brand/10 backdrop-blur-sm px-4 py-3">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
                <span className="text-sm font-medium">
                    {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onSelectAll}
                    >
                        Select All
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClear}
                    >
                        Clear
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            const names = combinedItems
                                .filter(i => selectedIds.has(i.id))
                                .map(i => getCleanName(i.name))
                            navigator.clipboard.writeText(names.join('\n')).then(() => {
                                toast.success(`Copied ${names.length} file names`)
                            })
                        }}
                    >
                        Copy Names
                    </Button>
                    {onAddToSetlist && (
                        <Button
                            size="sm"
                            variant="default"
                            className="bg-brand hover:bg-brand/90 text-white"
                            onClick={() => {
                                const selectedItems = combinedItems.filter(i => selectedIds.has(i.id))
                                onAddToSetlist(selectedItems)
                            }}
                        >
                            Add {selectedIds.size} to Setlist
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
