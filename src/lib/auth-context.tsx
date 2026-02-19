"use client"

import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"

interface CachedUser {
    displayName: string | null
    photoURL: string | null
    email: string | null
    role: string | null
}

interface AuthContextType {
    user: User | null
    profile: UserProfile | null
    cachedUser: CachedUser | null
    loading: boolean
    signIn: () => Promise<void>
    signOut: () => Promise<void>
    isAdmin: boolean
    isBandLeader: boolean
    isMusician: boolean
    isMember: boolean
    isSoundEngineer: boolean
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    cachedUser: null,
    loading: true,
    signIn: async () => { },
    signOut: async () => { },
    isAdmin: false,
    isBandLeader: false,
    isMusician: false,
    isMember: false,
    isSoundEngineer: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const lastClaimsUpdate = useRef<string | null>(null)

    // Read cached user from localStorage for instant greeting (before Firebase Auth resolves)
    const [cachedUser] = useState<CachedUser | null>(() => {
        if (typeof window === 'undefined') return null
        try {
            const raw = localStorage.getItem('crc_cached_user')
            return raw ? JSON.parse(raw) : null
        } catch { return null }
    })

    // Derived roles — hierarchical: admin > band_leader > musician > member > pending
    // Backward compat: old 'leader' maps to band_leader, old 'member' maps to musician (until migration)
    const role = profile?.role
    const isAdmin = role === 'admin'
    const isBandLeader = isAdmin || role === 'band_leader' || role === 'leader' as string
    const isMusician = isBandLeader || role === 'musician'
    const isMember = isMusician || role === 'member'
    const isSoundEngineer = !!profile?.soundEngineer

    useEffect(() => {
        // Build-time safety: If auth is mock (empty object), return
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false)
            return
        }

        let unsubscribeProfile: (() => void) | null = null

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }

            setUser(currentUser)
            if (currentUser) {
                // Sync session cookie for SSR — fire-and-forget, don't block UI
                currentUser.getIdToken().then((idToken) => {
                    fetch("/api/auth/session", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ idToken }),
                    }).catch(() => {/* non-critical: SSR just won't have auth */})
                }).catch(() => {})

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

                    // Cache for instant greeting on next visit
                    if (p) {
                        try {
                            localStorage.setItem('crc_cached_user', JSON.stringify({
                                displayName: p.displayName,
                                photoURL: p.photoURL || null,
                                email: p.email,
                                role: p.role,
                                soundEngineer: p.soundEngineer || false,
                            }))
                        } catch { /* quota exceeded or private browsing */ }
                    }
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
            localStorage.removeItem('crc_cached_user')
            // Clear server session cookie
            fetch("/api/auth/session", { method: "DELETE" }).catch(() => {})
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
        cachedUser,
        loading,
        signIn,
        signOut,
        isAdmin,
        isBandLeader,
        isMusician,
        isMember,
        isSoundEngineer,
    }), [user, profile, cachedUser, loading, isAdmin, isBandLeader, isMusician, isMember, isSoundEngineer])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
