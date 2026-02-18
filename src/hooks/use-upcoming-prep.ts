"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, setDoc, Timestamp, serverTimestamp } from "firebase/firestore"
import { toDate } from "@/lib/firestore-helpers"
import { Setlist } from "@/lib/setlist-firebase"

interface SongPref {
    lastViewedAt?: string | { seconds: number }
}

export interface PrepStatus {
    total: number
    viewed: number
    percent: number
}

export interface UpcomingSetlistWithPrep {
    setlist: Setlist
    prep: PrepStatus
    daysUntil: number | null
    hoursUntil: number | null
    isNew: boolean
    dateStr: string
    urgencyLabel: string | null
    /** Set of fileIds the user has viewed (for per-track checkmarks) */
    viewedFileIds: Set<string>
}

/**
 * Fetches upcoming setlists (next 7 days) with per-setlist prep status.
 * Used by both the hero zone and upcoming timeline on the dashboard.
 */
export function useUpcomingPrep() {
    const { user, isMember } = useAuth()
    const [setlists, setSetlists] = useState<Setlist[]>([])
    const [songPrefs, setSongPrefs] = useState<Record<string, SongPref>>({})
    const [lastVisitedAt, setLastVisitedAt] = useState<Date | null>(null)

    // Minute-granularity timestamp for urgency calculations (pure memo dep)
    const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60_000) * 60_000)
    useEffect(() => {
        const iv = setInterval(() => setNowMinute(Math.floor(Date.now() / 60_000) * 60_000), 60_000)
        return () => clearInterval(iv)
    }, [])

    // Track last visit time
    useEffect(() => {
        if (!user) return
        const prefRef = doc(db, 'users', user.uid, 'preferences', 'app')
        getDoc(prefRef).then(snap => {
            const ts = snap.data()?.lastVisitedAt
            if (ts?.toDate) setLastVisitedAt(ts.toDate())
            else if (ts) setLastVisitedAt(new Date(ts))
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
        }, () => {/* silent */})
    }, [user, isMember])

    // Load user's song preferences
    useEffect(() => {
        if (!user || setlists.length === 0) return

        const fileIds = new Set<string>()
        for (const s of setlists) {
            for (const t of (s.tracks || [])) {
                if (t.fileId) fileIds.add(t.fileId)
            }
        }
        if (fileIds.size === 0) return

        const prefs: Record<string, SongPref> = {}
        const loads = Array.from(fileIds).map(async (fileId) => {
            try {
                const ref = doc(db, 'users', user.uid, 'songPreferences', fileId)
                const snap = await getDoc(ref)
                if (snap.exists()) prefs[fileId] = snap.data() as SongPref
            } catch {/* silent */}
        })

        Promise.all(loads).then(() => setSongPrefs(prefs))
    }, [user, setlists])

    // Build enriched list
    const enriched: UpcomingSetlistWithPrep[] = useMemo(() => {
        return setlists.map(s => {
            const tracks = (s.tracks || []).filter(t => t.fileId && t.type !== 'header')
            const total = tracks.length
            let viewed = 0
            const viewedIds = new Set<string>()
            for (const t of tracks) {
                if (songPrefs[t.fileId!]?.lastViewedAt) {
                    viewed++
                    viewedIds.add(t.fileId!)
                }
            }
            const percent = total > 0 ? Math.round((viewed / total) * 100) : 100

            const eventDate = toDate(s.eventDate)
            const msUntil = eventDate ? eventDate.getTime() - nowMinute : null
            const daysUntil = msUntil !== null ? Math.ceil(msUntil / (1000 * 60 * 60 * 24)) : null
            const hoursUntil = msUntil !== null ? Math.round(msUntil / (1000 * 60 * 60)) : null

            const updatedAt = toDate(s.updatedAt) || toDate(s.date)
            const isNew = lastVisitedAt && updatedAt ? updatedAt > lastVisitedAt : false

            const dateStr = eventDate
                ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : ''

            // Urgency label
            let urgencyLabel: string | null = null
            if (daysUntil !== null) {
                if (daysUntil <= 0) {
                    if (hoursUntil !== null && hoursUntil > 0 && hoursUntil <= 4) {
                        urgencyLabel = hoursUntil === 1 ? 'In 1 hour' : `In ${hoursUntil}h`
                    } else {
                        urgencyLabel = 'Today'
                    }
                } else if (daysUntil === 1) {
                    urgencyLabel = 'Tomorrow'
                } else {
                    urgencyLabel = `In ${daysUntil} days`
                }
            }

            return {
                setlist: s,
                prep: { total, viewed, percent },
                daysUntil,
                hoursUntil,
                isNew,
                dateStr,
                urgencyLabel,
                viewedFileIds: viewedIds,
            }
        })
    }, [setlists, songPrefs, lastVisitedAt, nowMinute])

    return {
        items: enriched,
        isLoading: user !== null && isMember && setlists.length === 0,
        hasData: enriched.length > 0,
    }
}
