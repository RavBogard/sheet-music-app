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

/** Sync session cookie to server. Retries once on failure. Returns true on success. */
async function syncSessionCookie(user: User): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)
            const idToken = await user.getIdToken(attempt > 0) // force refresh on retry
            const res = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
                signal: controller.signal,
            })
            clearTimeout(timeout)
            if (res.ok) return true
            logger.warn(`Session cookie sync attempt ${attempt + 1} failed: ${res.status}`)
        } catch (err) {
            logger.warn(`Session cookie sync attempt ${attempt + 1} error:`, err)
        }
    }
    return false
}

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
    signIn: () => Promise<"popup" | "redirect">
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
    signIn: async () => "popup" as const,
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
        let sessionReady = false
        let profileReady = false

        // Handle redirect sign-in result (from signInWithRedirect on mobile).
        // The result itself is handled by onAuthStateChanged — we just need to
        // catch errors so they don't become unhandled rejections.
        getRedirectResult(auth).catch((err) => {
            if (err?.code !== 'auth/popup-closed-by-user') {
                logger.warn("Redirect sign-in result:", err)
            }
        })

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }
            sessionReady = false
            profileReady = false

            setUser(currentUser)
            if (currentUser) {
                // CRITICAL: Re-enter loading state while session cookie syncs.
                // Without this, signInWithRedirect causes a redirect loop:
                // onAuthStateChanged fires with null first (loading→false), then
                // fires again with user — but loading is already false, so the
                // login page navigates to /setlists before the cookie exists,
                // and middleware bounces back to /login.
                setLoading(true)

                // Sync session cookie BEFORE allowing loading to complete.
                // This prevents the race where middleware redirects before cookie exists.
                syncSessionCookie(currentUser).then((ok) => {
                    if (!ok) logger.warn("Session cookie sync failed — SSR auth may not work")
                    sessionReady = true
                    if (profileReady) setLoading(false)
                })

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
                    profileReady = true
                    if (sessionReady) setLoading(false)

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

    const signIn = async (): Promise<"popup" | "redirect"> => {
        // Always try popup first. signInWithRedirect is broken on modern Chrome
        // and Safari due to third-party cookie blocking — the auth domain
        // (firebaseapp.com) differs from the app domain, so the redirect result
        // is lost. Popup uses postMessage instead of cookies, avoiding this.
        // Popup from a user click gesture works on mobile browsers too.
        try {
            await signInWithPopup(auth, googleProvider)
            return "popup"
        } catch (error: unknown) {
            const code = (error as { code?: string })?.code
            if (
                code === "auth/popup-blocked" ||
                code === "auth/popup-closed-by-user" ||
                code === "auth/cancelled-popup-request"
            ) {
                logger.warn("Popup sign-in failed, falling back to redirect:", code)
                await signInWithRedirect(auth, googleProvider)
                return "redirect"
            }
            logger.error("Sign in error:", error)
            throw error
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
