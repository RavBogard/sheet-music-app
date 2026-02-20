"use client"

import { useState, useEffect } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { MonitorConfig } from "@/types/monitor"

/**
 * Returns monitor access info for the current user.
 *
 * Access granted if ANY of:
 *   - User is admin
 *   - User has soundEngineer flag
 *   - User has a bus assigned to them
 *
 * Musicians don't need sound engineer access to control their own bus.
 * Sound engineers get automatic access + extra controls (matrix, bus assignment).
 */
export function useMonitorAccess(): {
    hasAccess: boolean
    isAdmin: boolean
    isSoundEngineer: boolean
    hasBusAssigned: boolean
    loading: boolean
} {
    const { user, isAdmin, isSoundEngineer } = useAuth()
    const [hasBusAssigned, setHasBusAssigned] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) {
            setHasBusAssigned(false)
            setLoading(false)
            return
        }

        const unsub = onSnapshot(
            doc(db, "config", "monitor"),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data() as MonitorConfig
                    // Check if user has a bus assigned
                    const assignments = data.busAssignments || {}
                    const assigned = Object.values(assignments).some(
                        a => a && a.userId === user.uid
                    )
                    setHasBusAssigned(assigned)
                } else {
                    setHasBusAssigned(false)
                }
                setLoading(false)
            },
            () => {
                setHasBusAssigned(false)
                setLoading(false)
            }
        )

        return unsub
     
    }, [user?.uid])

    const hasAccess = isAdmin || isSoundEngineer || hasBusAssigned

    return { hasAccess, isAdmin, isSoundEngineer, hasBusAssigned, loading }
}
