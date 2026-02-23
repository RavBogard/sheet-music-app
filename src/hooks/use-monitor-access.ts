"use client"

import { useState, useEffect } from "react"
import { doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { MonitorConfig } from "@/types/monitor"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"

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

    const ref = user ? doc(db, "config", "monitor") : null
    const { data: configData, loading: configLoading } = useSafeFirestoreSync<MonitorConfig>(ref as any)

    useEffect(() => {
        if (!user) {
            setHasBusAssigned(false)
            setLoading(false)
            return
        }

        if (configLoading) {
            setLoading(true)
            return
        }

        if (configData) {
            // Check if user has a bus assigned
            const assignments = configData.busAssignments || {}
            const assigned = Object.values(assignments).some(
                a => a && a.userId === user.uid
            )
            setHasBusAssigned(assigned)
        } else {
            setHasBusAssigned(false)
        }
        setLoading(false)

    }, [user?.uid, configData, configLoading])

    const hasAccess = isAdmin || isSoundEngineer || hasBusAssigned

    return { hasAccess, isAdmin, isSoundEngineer, hasBusAssigned, loading }
}
