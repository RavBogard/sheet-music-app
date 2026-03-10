"use client"

import { useState, useEffect, useCallback } from "react"

type Priority = "polite" | "assertive"

interface Announcement {
    message: string
    priority: Priority
    id: number
}

let announcementId = 0
const listeners = new Set<(announcement: Announcement) => void>()

/**
 * Announce a message to screen readers via aria-live region.
 * Visual feedback is handled separately (toasts, spinners).
 */
export function announce(message: string, priority: Priority = "polite") {
    const announcement: Announcement = { message, priority, id: ++announcementId }
    listeners.forEach(fn => fn(announcement))
}

/**
 * Invisible aria-live region for screen reader announcements.
 * Mount once in the root layout.
 */
export function LiveRegion() {
    const [polite, setPolite] = useState("")
    const [assertive, setAssertive] = useState("")

    const handleAnnouncement = useCallback((announcement: Announcement) => {
        const setter = announcement.priority === "assertive" ? setAssertive : setPolite
        // Clear first to ensure re-announcement of identical messages
        setter("")
        requestAnimationFrame(() => {
            setter(announcement.message)
        })
    }, [])

    useEffect(() => {
        listeners.add(handleAnnouncement)
        return () => { listeners.delete(handleAnnouncement) }
    }, [handleAnnouncement])

    // Clear after 5 seconds so region is empty for next announcement
    useEffect(() => {
        if (!polite) return
        const t = setTimeout(() => setPolite(""), 5000)
        return () => clearTimeout(t)
    }, [polite])

    useEffect(() => {
        if (!assertive) return
        const t = setTimeout(() => setAssertive(""), 5000)
        return () => clearTimeout(t)
    }, [assertive])

    return (
        <>
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
            >
                {polite}
            </div>
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="sr-only"
            >
                {assertive}
            </div>
        </>
    )
}
