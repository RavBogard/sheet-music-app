"use client"

import { useState, useEffect } from "react"
import { doc, type DocumentReference } from "firebase/firestore"
import { getDb } from "@/lib/firebase"
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
export interface UseMonitorAccessProps {
    serverIsAdmin?: boolean
    serverIsSoundEngineer?: boolean
}

export function useMonitorAccess(props?: UseMonitorAccessProps): {
    hasAccess: boolean
    isAdmin: boolean
    isSoundEngineer: boolean
    hasBusAssigned: boolean
    loading: boolean
} {
    const { user, isAdmin: authIsAdmin, isSoundEngineer: authIsSoundEngineer } = useAuth()
    
    // Combine auth context with server props for immediate availability
    const isAdmin = authIsAdmin || !!props?.serverIsAdmin
    const isSoundEngineer = authIsSoundEngineer || !!props?.serverIsSoundEngineer
    
    const [hasBusAssigned, setHasBusAssigned] = useState(false)
    // If we already know they have access via server props, we don't strictly need to wait for config to say they have access,
    // but we still wait for config to know *which* bus they have if they aren't admin/SE.
    const [loading, setLoading] = useState(true)

    // Firestore SDK is lazy-loaded; resolve the doc-ref in an effect so the
    // module-top is still free of `firebase/firestore`. `useSafeFirestoreSync`
    // tolerates null and renders loading:false until the ref arrives.
    const [ref, setRef] = useState<DocumentReference | null>(null)
    useEffect(() => {
        if (!user) { setRef(null); return }
        let cancelled = false
        void getDb().then((d) => {
            if (!cancelled) setRef(doc(d, "config", "monitor"))
        })
        return () => { cancelled = true }
    }, [user])
    const { data: configData, loading: configLoading } = useSafeFirestoreSync<MonitorConfig>(ref)

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
            const assigned = Object.values(assignments).some(a => {
                if (!a) return false
                const list = Array.isArray(a) ? a : [a]
                return list.some(entry => entry.userId === user.uid)
            })
            setHasBusAssigned(assigned)
        } else {
            setHasBusAssigned(false)
        }
        setLoading(false)

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, configData, configLoading])

    const hasAccess = isAdmin || isSoundEngineer || hasBusAssigned

    return { hasAccess, isAdmin, isSoundEngineer, hasBusAssigned, loading }
}
