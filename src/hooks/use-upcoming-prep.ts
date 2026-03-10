"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, doc, getDoc, getDocFromCache, setDoc, documentId, getDocs, Timestamp, serverTimestamp } from "firebase/firestore"
import { toDate } from "@/lib/firestore-helpers"
import { Setlist } from "@/lib/setlist-firebase"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"

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

    // Track last visit time — cache-first for instant load
    useEffect(() => {
        if (!user?.uid) return
        let cancelled = false
        const prefRef = doc(db, 'users', user.uid, 'preferences', 'app')
        // Read from cache first, then update in background
        getDocFromCache(prefRef).catch(() => getDoc(prefRef)).then(snap => {
            if (cancelled) return
            const ts = snap.data()?.lastVisitedAt
            if (ts?.toDate) setLastVisitedAt(ts.toDate())
            else if (ts) setLastVisitedAt(new Date(ts))
            setDoc(prefRef, { lastVisitedAt: serverTimestamp() }, { merge: true }).catch(() => { })
        }).catch(() => { })
        return () => { cancelled = true }
    }, [user?.uid])

    // Subscribe to upcoming public setlists (next 7 days)
    const q = useMemo(() => {
        if (!user || !isMember) return null

        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const nextWeek = new Date(now)
        nextWeek.setDate(nextWeek.getDate() + 7)

        return query(
            collection(db, 'setlists'),
            where('isPublic', '==', true),
            where('eventDate', '>=', Timestamp.fromDate(now)),
            where('eventDate', '<=', Timestamp.fromDate(nextWeek)),
            orderBy('eventDate', 'asc'),
            limit(5)
        )
    }, [user, isMember])

    const { data } = useSafeFirestoreSync<Setlist[]>(q)

    useEffect(() => {
        if (data) {
            setSetlists(data)
        } else {
            setSetlists([])
        }
    }, [data])

    // Load user's song preferences — batched query instead of N individual reads.
    // Firestore `in` queries support up to 30 items per batch, so we chunk if needed.
    useEffect(() => {
        if (!user || setlists.length === 0) return

        let cancelled = false

        const fileIds = new Set<string>()
        for (const s of setlists) {
            for (const t of (s.tracks || [])) {
                if (t.fileId) fileIds.add(t.fileId)
            }
        }
        if (fileIds.size === 0) return

        const allIds = Array.from(fileIds)
        const BATCH_SIZE = 30 // Firestore 'in' query limit

        const loadBatches = async () => {
            const prefs: Record<string, SongPref> = {}

            for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
                if (cancelled) return
                const batch = allIds.slice(i, i + BATCH_SIZE)
                try {
                    const colRef = collection(db, 'users', user.uid, 'songPreferences')
                    const q = query(colRef, where(documentId(), 'in', batch))
                    const snap = await getDocs(q)
                    snap.forEach(d => { prefs[d.id] = d.data() as SongPref })
                } catch {
                    // Fallback: read individually from cache on query failure
                    for (const fileId of batch) {
                        if (cancelled) return
                        try {
                            const ref = doc(db, 'users', user.uid, 'songPreferences', fileId)
                            const snap = await getDocFromCache(ref).catch(() => getDoc(ref))
                            if (snap.exists()) prefs[fileId] = snap.data() as SongPref
                        } catch {/* silent */ }
                    }
                }
            }

            if (!cancelled) setSongPrefs(prefs)
        }

        loadBatches()
        return () => { cancelled = true }
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
