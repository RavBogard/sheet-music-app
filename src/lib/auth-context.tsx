"use client"

import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"

interface AuthContextType {
    user: User | null
    profile: UserProfile | null
    loading: boolean
    signIn: () => Promise<void>
    signOut: () => Promise<void>
    isAdmin: boolean
    isMember: boolean
    isLeader: boolean
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    signIn: async () => { },
    signOut: async () => { },
    isAdmin: false,
    isMember: false,
    isLeader: false
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const lastClaimsUpdate = useRef<string | null>(null)

    // Derived roles for convenience
    const isAdmin = profile?.role === 'admin'
    const isLeader = profile?.role === 'leader' || isAdmin
    const isMember = profile?.role === 'member' || isLeader

    useEffect(() => {
        // Build-time safety: If auth is mock (empty object), return
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false)
            return
        }

        let unsubscribeProfile: (() => void) | null = null

        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }

            setUser(currentUser)
            if (currentUser) {
                // Start subscription IMMEDIATELY — for returning users (99% of sign-ins)
                // this returns profile data just as fast as a getDoc, without blocking.
                unsubscribeProfile = subscribeToUserProfile(currentUser.uid, (p) => {
                    // Detect when admin changes user's role: claimsUpdatedAt changes
                    // Force-refresh the ID token so new custom claims take effect immediately
                    const claimsTs = p?.claimsUpdatedAt?.toString() || null
                    if (claimsTs && lastClaimsUpdate.current && claimsTs !== lastClaimsUpdate.current) {
                        currentUser.getIdToken(true).catch(() => {})
                    }
                    lastClaimsUpdate.current = claimsTs

                    setProfile(p)
                    setLoading(false)
                })

                // Ensure profile exists + update lastLogin in the background (don't block UI)
                ensureUserProfile(currentUser).catch((e) => {
                    logger.error("Error ensuring user profile", e)
                })
            } else {
                setProfile(null)
                setLoading(false)
            }
        })

        return () => {
            unsubscribeAuth()
            if (unsubscribeProfile) unsubscribeProfile()
        }
    }, [])

    const signIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider)
        } catch (error) {
            logger.error("Sign in error:", error)
        }
    }

    const signOut = async () => {
        try {
            await firebaseSignOut(auth)
        } catch (error) {
            logger.error("Sign out error:", error)
        }
    }

    // CRITICAL: Memoize the context value.
    // Without this, every setProfile() creates a new value object, causing ALL
    // useAuth() consumers (PDFViewer, setlist editor, prefetcher, etc.) to
    // re-render even if only profile changed. This cascades into effect re-runs,
    // aborted PDF fetches, and general sluggishness.
    const value = useMemo(() => ({
        user,
        profile,
        loading,
        signIn,
        signOut,
        isAdmin,
        isLeader,
        isMember
    }), [user, profile, loading, isAdmin, isLeader, isMember])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
