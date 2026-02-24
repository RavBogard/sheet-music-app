"use client"

import { Ban, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { UseBlockoutSelectionReturn } from "@/hooks/use-blockout-selection"

interface BlockoutConfirmPanelProps {
    selection: UseBlockoutSelectionReturn
}

export function BlockoutConfirmPanel({ selection }: BlockoutConfirmPanelProps) {
    if (!selection.selecting || !selection.selectionStart) return null

    return (
        <div className="p-4 border-t border-red-500/30 bg-red-500/5 space-y-3">
            <p className="text-sm font-medium text-foreground">
                Mark as unavailable:{' '}
                <span className="text-red-600 dark:text-red-400">
                    {selection.selectionLabel}
                </span>
            </p>
            <Input
                placeholder="Reason (optional) — e.g., vacation, out of town"
                value={selection.reason}
                onChange={(e) => selection.setReason(e.target.value)}
                className="h-9 text-sm rounded-lg"
            />
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={selection.cancelSelection}
                    className="text-xs rounded-lg"
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    onClick={selection.handleCreateBlockout}
                    disabled={selection.saving}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5 rounded-lg fluid-interaction"
                >
                    {selection.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                    {selection.saving ? 'Saving...' : 'Block These Dates'}
                </Button>
            </div>
        </div>
    )
}
