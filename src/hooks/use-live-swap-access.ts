"use client"

import { useAuth } from "@/lib/auth-context"

/**
 * Returns whether the current user can perform live song swaps.
 *
 * Access granted if ANY of:
 *   - User is admin
 *   - User is band leader
 *   - User has canLiveSwap flag on profile
 *
 * No Firestore read needed — all data comes from auth context / profile.
 */
export function useLiveSwapAccess(): {
    canSwap: boolean
    loading: boolean
} {
    const { user, profile, isAdmin, isBandLeader, loading } = useAuth()

    if (!user || loading) {
        return { canSwap: false, loading }
    }

    const canSwap = isAdmin || isBandLeader || !!profile?.canLiveSwap

    return { canSwap, loading: false }
}
