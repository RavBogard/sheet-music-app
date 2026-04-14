"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SetlistChangedBannerProps {
    onTakeRemote: () => void
    onKeepLocal: () => void
}

/**
 * Appears when another device writes to the same setlist while the user has
 * unsaved edits. Forces an explicit choice instead of silently dropping data.
 */
export function SetlistChangedBanner({ onTakeRemote, onKeepLocal }: SetlistChangedBannerProps) {
    return (
        <div className="mx-4 my-2 flex flex-col gap-2 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <div className="text-sm">
                    <div className="font-medium">Setlist changed on another device</div>
                    <div className="text-muted-foreground">Your unsaved edits will be lost if you take the remote version.</div>
                </div>
            </div>
            <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={onKeepLocal}>
                    Keep my changes
                </Button>
                <Button variant="default" size="sm" onClick={onTakeRemote}>
                    Take remote
                </Button>
            </div>
        </div>
    )
}
