"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, setDoc, Timestamp, serverTimestamp } from "firebase/firestore"
import { toDate } from "@/lib/firestore-helpers"
import { Setlist } from "@/lib/setlist-firebase"
import {
    CalendarDays, ChevronRight, Eye, EyeOff,
    CheckCircle2, Circle, Clock, AlertCircle,
} from "lucide-react"

interface SongPref {
    lastViewedAt?: string | { seconds: number }
}

interface PrepStatus {
    total: number
    viewed: number
    stale: number // Charts updated since last viewed
}

/**
 * "Your Week" — personalized preparation dashboard.
 * Shows upcoming setlists with per-chart preparation progress.
 */
export function YourWeekSection() {
    const { user, isMember } = useAuth()
    const router = useRouter()
    const [setlists, setSetlists] = useState<Setlist[]>([])
    const [prepMap, setPrepMap] = useState<Record<string, PrepStatus>>({})
    const [songPrefs, setSongPrefs] = useState<Record<string, SongPref>>({})
    const [lastVisitedAt, setLastVisitedAt] = useState<Date | null>(null)

    // Track last visit time — read the old value, then write the new one
    useEffect(() => {
        if (!user) return
        const prefRef = doc(db, 'users', user.uid, 'preferences', 'app')
        getDoc(prefRef).then(snap => {
            const ts = snap.data()?.lastVisitedAt
            if (ts?.toDate) setLastVisitedAt(ts.toDate())
            else if (ts) setLastVisitedAt(new Date(ts))
            // Write the new visit time
            setDoc(prefRef, { lastVisitedAt: serverTimestamp() }, { merge: true }).catch(() => {})
        }).catch(() => {})
    }, [user])

    // Subscribe to upcoming public setlists (next 7 days)
    useEffect(() => {
        if (!user || !isMember) return

        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const nextWeek = new Date(now)
        nextWeek.setDate(nextWeek.getDate() + 7)

        const q = query(
            collection(db, 'setlists'),
            where('isPublic', '==', true),
            where('eventDate', '>=', Timestamp.fromDate(now)),
            where('eventDate', '<=', Timestamp.fromDate(nextWeek)),
            orderBy('eventDate', 'asc'),
            limit(5)
        )

        return onSnapshot(q, (snap) => {
            const results = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Setlist)
            setSetlists(results)
        }, () => {/* silent on permission errors */})
    }, [user, isMember])

    // Load user's song preferences (for "last viewed" tracking)
    useEffect(() => {
        if (!user || setlists.length === 0) return

        // Collect all file IDs across setlists
        const fileIds = new Set<string>()
        for (const s of setlists) {
            for (const t of (s.tracks || [])) {
                if (t.fileId) fileIds.add(t.fileId)
            }
        }

        if (fileIds.size === 0) return

        // Load preferences for each file
        const prefs: Record<string, SongPref> = {}
        const loads = Array.from(fileIds).map(async (fileId) => {
            try {
                const ref = doc(db, 'users', user.uid, 'songPreferences', fileId)
                const snap = await getDoc(ref)
                if (snap.exists()) {
                    prefs[fileId] = snap.data() as SongPref
                }
            } catch {/* silent */}
        })

        Promise.all(loads).then(() => setSongPrefs(prefs))
    }, [user, setlists])

    // Calculate preparation status per setlist
    useEffect(() => {
        const map: Record<string, PrepStatus> = {}

        for (const s of setlists) {
            const tracks = (s.tracks || []).filter(t => t.fileId && t.type !== 'header')
            const total = tracks.length
            let viewed = 0
            let stale = 0

            for (const t of tracks) {
                const pref = songPrefs[t.fileId!]
                if (pref?.lastViewedAt) {
                    viewed++
                    // Check if chart was updated after last viewed (stale)
                    // For now, just count as viewed
                }
            }

            if (s.id) {
                map[s.id] = { total, viewed, stale }
            }
        }

        setPrepMap(map)
    }, [setlists, songPrefs])

    if (!user || !isMember || setlists.length === 0) return null

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Your Week
                </h2>
            </div>

            {setlists.map(s => {
                const prep = prepMap[s.id!]
                const eventDate = toDate(s.eventDate)
                const daysUntil = eventDate
                    ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const updatedAt = toDate((s as any).updatedAt) || toDate(s.date)
                const isNew = lastVisitedAt && updatedAt ? updatedAt > lastVisitedAt : false

                return (
                    <YourWeekCard
                        key={s.id}
                        setlist={s}
                        prep={prep}
                        daysUntil={daysUntil}
                        songPrefs={songPrefs}
                        isNew={isNew}
                        onClick={() => router.push(`/setlists/${s.id}`)}
                    />
                )
            })}
        </div>
    )
}

function YourWeekCard({
    setlist,
    prep,
    daysUntil,
    songPrefs,
    isNew,
    onClick,
}: {
    setlist: Setlist
    prep?: PrepStatus
    daysUntil: number | null
    songPrefs: Record<string, SongPref>
    isNew?: boolean
    onClick: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const tracks = (setlist.tracks || []).filter(t => t.fileId && t.type !== 'header')

    const progress = prep ? (prep.total > 0 ? Math.round((prep.viewed / prep.total) * 100) : 100) : 0
    const isComplete = prep ? prep.viewed === prep.total : false

    const urgencyColor = daysUntil !== null && daysUntil <= 1
        ? 'text-amber-500'
        : daysUntil !== null && daysUntil <= 3
            ? 'text-muted-foreground'
            : 'text-muted-foreground/70'

    const eventDate = toDate(setlist.eventDate)
    const dateStr = eventDate
        ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : ''

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Main row */}
            <button
                onClick={onClick}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
            >
                {/* Progress ring */}
                <div className="relative w-10 h-10 shrink-0">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                        <circle
                            cx="18" cy="18" r="15.9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className="text-muted/30"
                        />
                        <circle
                            cx="18" cy="18" r="15.9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeDasharray={`${progress} 100`}
                            strokeLinecap="round"
                            className={isComplete ? 'text-green-500' : 'text-violet-500'}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                        {prep ? `${prep.viewed}/${prep.total}` : '—'}
                    </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                        {setlist.name}
                        {isNew && (
                            <span className="text-[9px] font-bold bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded-full shrink-0">
                                New
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {dateStr && <span>{dateStr}</span>}
                        {daysUntil !== null && (
                            <span className={urgencyColor}>
                                {daysUntil === 0 ? 'Today' :
                                    daysUntil === 1 ? 'Tomorrow' :
                                        `${daysUntil} days`}
                            </span>
                        )}
                        {prep && prep.stale > 0 && (
                            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                {prep.stale} updated
                            </span>
                        )}
                    </div>
                </div>

                {/* Expand toggle */}
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"
                    title="Show track details"
                >
                    <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>
            </button>

            {/* Expanded: per-track status */}
            {expanded && tracks.length > 0 && (
                <div className="border-t border-border px-4 py-2 space-y-1 bg-muted/30">
                    {tracks.map((track, i) => {
                        const viewed = !!songPrefs[track.fileId!]?.lastViewedAt
                        return (
                            <div key={`${track.fileId}-${i}`} className="flex items-center gap-2 py-1 text-xs">
                                {viewed ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                ) : (
                                    <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                                )}
                                <span className={`truncate ${viewed ? 'text-muted-foreground' : 'text-foreground'}`}>
                                    {track.title}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
