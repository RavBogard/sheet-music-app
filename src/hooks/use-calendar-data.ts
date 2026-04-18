import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import {
    subscribeToMyAssignments,
    subscribeToAllUpcomingAssignments,
} from "@/lib/scheduling-firebase"
import { dateStr as toDateKey } from "@/lib/firestore-helpers"
import type { SchedulingAssignment } from "@/types/models"
import type { Setlist } from "@/lib/setlist-firebase"

// ── Public types ──

export type CalendarMode = 'viewer' | 'planning'

export interface CalendarDayData {
    /** Setlists on this day */
    setlists: Setlist[]
    /** Scheduling assignments grouped by setlist */
    assignmentsBySetlist: Map<string, SchedulingAssignment[]>
}

export interface UseCalendarDataReturn {
    /** Map of 'YYYY-MM-DD' → CalendarDayData */
    dayMap: Map<string, CalendarDayData>
    /** All assignments (raw) */
    assignments: SchedulingAssignment[]
    /** Loading flag */
    loading: boolean
}

/**
 * Central data-aggregation hook for the unified calendar.
 * Conditionally subscribes based on role + mode:
 *   - viewer  → my assignments, setlists (passed in)
 *   - planning → all assignments, setlists (passed in)
 */
export function useCalendarData(
    mode: CalendarMode,
    setlists: Setlist[],
): UseCalendarDataReturn {
    const { user, isBandLeader } = useAuth()

    const [assignments, setAssignments] = useState<SchedulingAssignment[]>([])
    const [loading, setLoading] = useState(true)

    // ── Assignments subscription ──
    useEffect(() => {
        if (!user) { setLoading(false); return }

        setLoading(true)

        const unsub = (mode === 'planning' && isBandLeader)
            ? subscribeToAllUpcomingAssignments((data) => {
                setAssignments(data)
                setLoading(false)
            })
            : subscribeToMyAssignments(user.uid, (data) => {
                setAssignments(data)
                setLoading(false)
            })

        return unsub
    }, [user, mode, isBandLeader])

    // ── Build day map ──
    const dayMap = useMemo(() => {
        const map = new Map<string, CalendarDayData>()

        function ensure(key: string): CalendarDayData {
            if (!map.has(key)) {
                map.set(key, {
                    setlists: [],
                    assignmentsBySetlist: new Map(),
                })
            }
            return map.get(key)!
        }

        // Setlists → days
        for (const s of setlists) {
            const key = toDateKey(s.eventDate)
            if (!key) continue
            ensure(key).setlists.push(s)
        }

        // Assignments → days (via setlist eventDate)
        for (const a of assignments) {
            const key = toDateKey(a.eventDate)
            if (!key) continue
            const day = ensure(key)
            if (!day.assignmentsBySetlist.has(a.setlistId)) {
                day.assignmentsBySetlist.set(a.setlistId, [])
            }
            day.assignmentsBySetlist.get(a.setlistId)!.push(a)
        }

        return map
    }, [setlists, assignments])

    return {
        dayMap,
        assignments,
        loading,
    }
}
