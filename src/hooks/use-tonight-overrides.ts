"use client"

import { useEffect, useState } from "react"

import { useAuth } from "@/lib/auth-context"
import { logger } from "@/lib/logger"
import { eventDayOf, overridesApply, type OverridesDoc } from "@/lib/performance/tonight"
import { subscribeTonight } from "@/lib/performance/tonight-client"

/**
 * Tonight's swaps for the setlist edit page (David's ask 4): row id → the
 * title playing tonight, only while the overrides apply (the service day, in
 * America/Chicago). A read failure answers {} — the page shows the plan.
 */
export function useTonightTitles(setlistId: string, eventDate: unknown): Record<string, string> {
    const { user } = useAuth()
    const [doc, setDoc] = useState<OverridesDoc | null>(null)
    useEffect(() => {
        setDoc(null)
        if (!setlistId || !user) return
        return subscribeTonight(setlistId, setDoc, (err) =>
            logger.warn(`[useTonightTitles] overrides unavailable for ${setlistId}`, err),
        )
    }, [setlistId, user])
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(t)
    }, [])
    const day = eventDayOf(eventDate)
    if (!overridesApply(doc, day, now)) return {}
    return Object.fromEntries(Object.entries(doc!.rows).map(([id, o]) => [id, o.title]))
}
