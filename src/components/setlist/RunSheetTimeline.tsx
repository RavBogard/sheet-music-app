"use client"

import { useMemo } from "react"
import { SetlistTrack } from "@/types/models"
import { Clock } from "lucide-react"

interface RunSheetTimelineProps {
    tracks: SetlistTrack[]
}

/**
 * Parse a duration string like "3:30" into minutes (3.5)
 */
function parseDuration(duration: string): number {
    if (!duration) return 0
    // Handle "3:30" format
    const colonMatch = duration.match(/^(\d+):(\d+)$/)
    if (colonMatch) {
        return parseInt(colonMatch[1]) + parseInt(colonMatch[2]) / 60
    }
    // Handle "~5 min" format
    const minMatch = duration.match(/(\d+)\s*min/)
    if (minMatch) {
        return parseInt(minMatch[1])
    }
    // Handle plain number
    const num = parseFloat(duration)
    return isNaN(num) ? 0 : num
}

/**
 * Estimate minutes for a track based on available data.
 */
function estimateTrackMinutes(track: SetlistTrack): number {
    // Use explicit estimatedMinutes if set
    if (track.estimatedMinutes && track.estimatedMinutes > 0) {
        return track.estimatedMinutes
    }
    // Use parsed duration string
    if (track.duration) {
        const parsed = parseDuration(track.duration)
        if (parsed > 0) return parsed
    }
    // Defaults by type
    const type = track.type || 'song'
    switch (type) {
        case 'song': return 3
        case 'header': return 0
        case 'reading': return 5
        case 'prayer': return 3
        case 'transition': return 1
        case 'note': return 0
        default: return 2
    }
}

export function RunSheetTimeline({ tracks }: RunSheetTimelineProps) {
    const totalMinutes = useMemo(() => {
        return tracks.reduce((sum, track) => sum + estimateTrackMinutes(track), 0)
    }, [tracks])

    if (tracks.length === 0) return null

    const songCount = tracks.filter(t => !t.type || t.type === 'song').length
    const flowCount = tracks.filter(t => t.type && t.type !== 'song' && t.type !== 'header').length

    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
            <Clock className="h-3 w-3 shrink-0" />
            <span>
                Est. {Math.round(totalMinutes)} min
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
                {songCount} song{songCount !== 1 ? 's' : ''}
                {flowCount > 0 && `, ${flowCount} other item${flowCount !== 1 ? 's' : ''}`}
            </span>
        </div>
    )
}

// Export for testing
export { parseDuration, estimateTrackMinutes }
