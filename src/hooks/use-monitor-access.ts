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
 *   - User is in authorizedUsers list
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
    const [inAuthorizedList, setInAuthorizedList] = useState(false)
    const [hasBusAssigned, setHasBusAssigned] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) {
            setInAuthorizedList(false)
            setHasBusAssigned(false)
            setLoading(false)
            return
        }

        const unsub = onSnapshot(
            doc(db, "config", "monitor"),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data() as MonitorConfig
                    const authorized: string[] = data.authorizedUsers || []
                    setInAuthorizedList(authorized.includes(user.uid))

                    // Check if user has a bus assigned
                    const assignments = data.busAssignments || {}
                    const assigned = Object.values(assignments).some(
                        a => a && a.userId === user.uid
                    )
                    setHasBusAssigned(assigned)
                } else {
                    setInAuthorizedList(false)
                    setHasBusAssigned(false)
                }
                setLoading(false)
            },
            () => {
                setInAuthorizedList(false)
                setHasBusAssigned(false)
                setLoading(false)
            }
        )

        return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on uid, not user object
    }, [user?.uid])

    const hasAccess = isAdmin || isSoundEngineer || inAuthorizedList || hasBusAssigned

    return { hasAccess, isAdmin, isSoundEngineer, hasBusAssigned, loading }
}
