"use client"

import { useState, useEffect } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"

/**
 * Returns true if the current user is in the monitor authorizedUsers list.
 * Subscribes to live changes so access appears/disappears instantly.
 */
export function useMonitorAccess(): { hasAccess: boolean; isAdmin: boolean; loading: boolean } {
    const { user, isAdmin } = useAuth()
    const [hasAccess, setHasAccess] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) {
            setHasAccess(false)
            setLoading(false)
            return
        }

        const unsub = onSnapshot(
            doc(db, "config", "monitor"),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data()
                    const authorized: string[] = data.authorizedUsers || []
                    setHasAccess(authorized.includes(user.uid))
                } else {
                    setHasAccess(false)
                }
                setLoading(false)
            },
            () => {
                setHasAccess(false)
                setLoading(false)
            }
        )

        return unsub
    }, [user?.uid])

    return { hasAccess: hasAccess || isAdmin, isAdmin, loading }
}
