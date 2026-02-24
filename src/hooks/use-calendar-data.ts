import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import {
    subscribeToMyAssignments,
    subscribeToAllUpcomingAssignments,
    subscribeToMyBlockouts,
    subscribeToAllBlockouts,
} from "@/lib/scheduling-firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { dateStr as toDateKey } from "@/lib/firestore-helpers"
import type {
    SchedulingAssignment,
    MusicianBlockout,
    SetlistTask,
} from "@/types/models"
import type { Setlist } from "@/lib/setlist-firebase"

// ── Public types ──

export type CalendarMode = 'viewer' | 'planning' | 'availability'

export interface CalendarDayData {
    /** Setlists on this day */
    setlists: Setlist[]
    /** Scheduling assignments grouped by setlist */
    assignmentsBySetlist: Map<string, SchedulingAssignment[]>
    /** Tasks due on this day (lazy — populated per-day when opened) */
    tasks: SetlistTask[]
    /** Number of musicians blocked out on this day */
    blockedCount: number
    /** UIDs blocked on this day */
    blockedUids: Set<string>
}

export interface UseCalendarDataReturn {
    /** Map of 'YYYY-MM-DD' → CalendarDayData */
    dayMap: Map<string, CalendarDayData>
    /** All blockouts (for availability mode rendering) */
    blockouts: MusicianBlockout[]
    /** All assignments (raw) */
    assignments: SchedulingAssignment[]
    /** Is a given date-key blocked for the current user? */
    isMyBlockedDate: (dateKey: string) => boolean
    /** Loading flag */
    loading: boolean
}

/**
 * Central data-aggregation hook for the unified calendar.
 * Conditionally subscribes based on role + mode:
 *   - viewer  → my assignments, my blockouts, setlists (passed in)
 *   - planning → all assignments, all blockouts, setlists (passed in)
 *   - availability → my blockouts only
 */
export function useCalendarData(
    mode: CalendarMode,
    setlists: Setlist[],
): UseCalendarDataReturn {
    const { user, isBandLeader } = useAuth()

    const [assignments, setAssignments] = useState<SchedulingAssignment[]>([])
    const [myBlockouts, setMyBlockouts] = useState<MusicianBlockout[]>([])
    const [allBlockouts, setAllBlockouts] = useState<MusicianBlockout[]>([])
    const [tasks, setTasks] = useState<SetlistTask[]>([])
    const [loading, setLoading] = useState(true)

    // Track individual stream completion
    const [loaded, setLoaded] = useState({ assignments: false, blockouts: false, tasks: false })

    // ── Assignments subscription ──
    useEffect(() => {
        if (!user) { setLoaded(p => ({ ...p, assignments: true })); return }
        if (mode === 'availability') { setLoaded(p => ({ ...p, assignments: true })); return }

        const unsub = (mode === 'planning' && isBandLeader)
            ? subscribeToAllUpcomingAssignments((data) => {
                setAssignments(data)
                setLoaded(p => ({ ...p, assignments: true }))
            })
            : subscribeToMyAssignments(user.uid, (data) => {
                setAssignments(data)
                setLoaded(p => ({ ...p, assignments: true }))
            })

        return unsub
    }, [user, mode, isBandLeader])

    // ── Blockouts subscription ──
    useEffect(() => {
        if (!user) { setLoaded(p => ({ ...p, blockouts: true })); return }

        if (mode === 'planning' && isBandLeader) {
            const unsub = subscribeToAllBlockouts((data) => {
                setAllBlockouts(data)
                setLoaded(p => ({ ...p, blockouts: true }))
            })
            return unsub
        }

        // viewer + availability both need own blockouts
        const unsub = subscribeToMyBlockouts(user.uid, (data) => {
            setMyBlockouts(data)
            setLoaded(p => ({ ...p, blockouts: true }))
        })
        return unsub
    }, [user, mode, isBandLeader])

    // ── Tasks subscription (viewer + planning) ──
    useEffect(() => {
        if (!user) { setLoaded(p => ({ ...p, tasks: true })); return }
        if (mode === 'availability') { setLoaded(p => ({ ...p, tasks: true })); return }

        // Subscribe to tasks relevant to the user
        const q = (mode === 'planning' && isBandLeader)
            ? query(collection(db, 'tasks'), where('status', '==', 'todo'))
            : query(collection(db, 'tasks'), where('assigneeId', '==', user.uid), where('status', '==', 'todo'))

        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as SetlistTask))
            setTasks(docs)
            setLoaded(p => ({ ...p, tasks: true }))
        }, () => {
            setLoaded(p => ({ ...p, tasks: true }))
        })
        return unsub
    }, [user, mode, isBandLeader])

    // ── Loading state ──
    useEffect(() => {
        if (loaded.assignments && loaded.blockouts && loaded.tasks) {
            setLoading(false)
        }
    }, [loaded])

    // Reset loading on mode change
    useEffect(() => {
        setLoading(true)
        setLoaded({ assignments: false, blockouts: false, tasks: false })
    }, [mode])

    // ── Resolve blockouts to use ──
    const blockouts = (mode === 'planning' && isBandLeader) ? allBlockouts : myBlockouts

    // ── Build day map ──
    const dayMap = useMemo(() => {
        const map = new Map<string, CalendarDayData>()

        function ensure(key: string): CalendarDayData {
            if (!map.has(key)) {
                map.set(key, {
                    setlists: [],
                    assignmentsBySetlist: new Map(),
                    tasks: [],
                    blockedCount: 0,
                    blockedUids: new Set(),
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

        // Tasks → days (via setlist eventDate)
        for (const t of tasks) {
            const key = toDateKey(t.eventDate)
            if (!key) continue
            ensure(key).tasks.push(t)
        }

        // Blockouts → days
        for (const b of blockouts) {
            // Expand range
            const start = new Date(b.startDate + 'T12:00:00')
            const end = new Date(b.endDate + 'T12:00:00')
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const key = d.toISOString().split('T')[0]
                const day = ensure(key)
                if (!day.blockedUids.has(b.musicianUid)) {
                    day.blockedUids.add(b.musicianUid)
                    day.blockedCount++
                }
            }
        }

        return map
    }, [setlists, assignments, tasks, blockouts])

    // ── Helper: is date blocked for current user ──
    const isMyBlockedDate = useMemo(() => {
        return (dateKey: string): boolean => {
            return myBlockouts.some(b => dateKey >= b.startDate && dateKey <= b.endDate)
        }
    }, [myBlockouts])

    return {
        dayMap,
        blockouts,
        assignments,
        isMyBlockedDate,
        loading,
    }
}
