"use client"

import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut as firebaseSignOut,
} from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"
import { deriveRoles } from "@/lib/roles"

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
    canUpload: boolean
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
    canUpload: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const lastClaimsUpdate = useRef<string | null>(null)
    const pushRegistered = useRef(false) // M5: prevent re-registration on every auth state change

    // Read cached user from localStorage for instant greeting (before Firebase Auth resolves)
    const [cachedUser] = useState<CachedUser | null>(() => {
        if (typeof window === 'undefined') return null
        try {
            const raw = localStorage.getItem('crc_cached_user')
            return raw ? JSON.parse(raw) : null
        } catch { return null }
    })

    // Derived roles — uses shared hierarchy from @/lib/roles
    const { isAdmin, isBandLeader, isMusician, isMember } = deriveRoles(profile?.role)
    const isSoundEngineer = !!profile?.soundEngineer
    const canUpload = isAdmin || isBandLeader || !!profile?.canUpload

    useEffect(() => {
        // Build-time safety: If auth is mock (empty object), return
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false)
            return
        }

        let unsubscribeProfile: (() => void) | null = null

        // Handle redirect sign-in result (from signInWithRedirect fallback on mobile)
        getRedirectResult(auth).catch((err) => {
            logger.warn("Redirect sign-in result:", err)
        })

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }

            setUser(currentUser)
            if (currentUser) {
                // Sync session cookie for SSR — force refresh (true) to prevent 401s on stale cached tokens
                currentUser.getIdToken(true).then((idToken) => {
                    fetch("/api/auth/session", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ idToken }),
                    }).catch(() => {/* non-critical: SSR just won't have auth */ })
                }).catch(err => logger.warn("Token refresh failed:", err))

                // Start subscription IMMEDIATELY — for returning users (99% of sign-ins)
                // this returns profile data just as fast as a getDoc, without blocking.
                unsubscribeProfile = subscribeToUserProfile(currentUser.uid, (p) => {
                    // Detect when admin changes user's role: claimsUpdatedAt changes
                    // Force-refresh the ID token so new custom claims take effect immediately
                    const claimsTs = p?.claimsUpdatedAt?.toString() || null
                    if (claimsTs && lastClaimsUpdate.current && claimsTs !== lastClaimsUpdate.current) {
                        currentUser.getIdToken(true).catch(err => logger.warn("Claims refresh failed:", err))
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

    // Re-register push token if user previously opted in (once per session).
    // Separated from the auth listener to keep concerns clean.
    useEffect(() => {
        if (!user || pushRegistered.current) return
        if (typeof window === 'undefined' || !localStorage.getItem('crc_push_token')) return
        pushRegistered.current = true
        import('./push-notifications').then(({ registerPushNotifications }) => {
            registerPushNotifications(user.uid).catch(() => {})
        }).catch(() => {})
    }, [user])

    const signIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider)
        } catch (error: unknown) {
            const code = (error as { code?: string })?.code
            // Popup blocked (common on mobile) or COOP killed the popup — fall back to redirect
            if (
                code === "auth/popup-blocked" ||
                code === "auth/popup-closed-by-user" ||
                code === "auth/cancelled-popup-request"
            ) {
                logger.warn("Popup sign-in failed, falling back to redirect:", code)
                await signInWithRedirect(auth, googleProvider)
            } else {
                logger.error("Sign in error:", error)
            }
        }
    }

    const signOut = async () => {
        try {
            localStorage.removeItem('crc_cached_user')
            // Clear server session cookie
            fetch("/api/auth/session", { method: "DELETE" }).catch(() => { })
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
        canUpload,
    }), [user, profile, cachedUser, loading, isAdmin, isBandLeader, isMusician, isMember, isSoundEngineer, canUpload])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
