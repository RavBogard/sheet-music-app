"use client"

import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import {
    User,
    onAuthStateChanged,
    signInWithRedirect,
    signInWithPopup,
    getRedirectResult,
    signOut as firebaseSignOut,
} from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"
import { deriveRoles } from "@/lib/roles"
import { apiFetch } from "@/lib/api-client"

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
    signIn: async () => {},
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
    const canUpload = isAdmin || isBandLeader || isMusician || !!profile?.canUpload

    useEffect(() => {
        // Build-time safety: If auth is mock (empty object), return
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false)
            return
        }

        // Complete the signInWithRedirect round-trip. If we're arriving back
        // from Google with a redirect payload, this call finalizes the auth
        // state in the main window context. No-op (resolves to null) if we
        // didn't just return from a redirect sign-in.
        getRedirectResult(auth).catch((err) => {
            logger.warn("getRedirectResult error:", err)
        })

        let unsubscribeProfile: (() => void) | null = null
        let sessionReady = false
        let profileReady = false

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }
            sessionReady = false
            profileReady = false

            setUser(currentUser)
            if (currentUser) {
                // CRITICAL: Re-enter loading state while session cookie syncs.
                // This prevents the race where middleware redirects before cookie exists.
                setLoading(true)

                // Sync session cookie BEFORE allowing loading to complete.
                // This prevents the race where middleware redirects before cookie exists.
                syncSessionCookie(currentUser).then((ok) => {
                    if (!ok) logger.warn("Session cookie sync failed — SSR auth may not work")
                    sessionReady = true
                    if (profileReady) setLoading(false)
                }).catch((err) => {
                    logger.error("syncSessionCookie rejected:", err)
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
                        // Refresh the ID token AND re-mint the session cookie so
                        // the proxy middleware sees the new role claim. Without
                        // the cookie re-sync, the middleware keeps redirecting
                        // role-gated routes to '/' (proxy.ts:101-104).
                        currentUser.getIdToken(true)
                            .then(() => syncSessionCookie(currentUser))
                            .then((ok) => {
                                if (!ok) logger.warn("Session cookie re-sync after claims update failed")
                            })
                            .catch(err => logger.warn("Claims refresh failed:", err))
                    }
                    lastClaimsUpdate.current = claimsTs

                    // v4.3 P9: repair Firestore↔claim drift for both
                    //   (a) server-side drift (Firestore role, no auth claim) —
                    //       sync-claims sets the claim + bumps claimsUpdatedAt
                    //   (b) client-side staleness (server has claim already,
                    //       but our cached ID token predates it) — we must
                    //       force-refresh the token AND re-mint the session
                    //       cookie so the proxy middleware sees the new role
                    if (p?.role && p.role !== "pending") {
                        currentUser
                            .getIdTokenResult()
                            .then(async (res) => {
                                const claimRole = res.claims.role as string | undefined
                                if (claimRole === p.role) return

                                // Ask the server to fix server-side drift first (no-op if already in sync)
                                try {
                                    const r = await apiFetch("/api/auth/sync-claims", { method: "POST" })
                                    if (!r.ok) logger.warn("[sync-claims] failed", r.status)
                                } catch (err) {
                                    logger.warn("[sync-claims] threw", err)
                                }

                                // Force-refresh the client token to pick up the
                                // latest custom claims, then re-mint the session
                                // cookie so the middleware sees them too.
                                try {
                                    await currentUser.getIdToken(true)
                                    const ok = await syncSessionCookie(currentUser)
                                    if (!ok) logger.warn("[sync-claims] cookie re-sync failed")
                                } catch (err) {
                                    logger.warn("[sync-claims] token+cookie refresh failed", err)
                                }
                            })
                            .catch((err) =>
                                logger.warn("[sync-claims] getIdTokenResult failed", err),
                            )
                    }

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

    // Refresh session cookie when user returns to the app.
    // The cookie expires after 14 days (Firebase max). Without refresh, mobile
    // users who open the app weekly would hit expired cookies — middleware
    // redirects to /login while Firebase client auth is still valid, and static
    // assets (like the PDF worker) get served as login HTML instead of JS.
    // Throttled to once per day to avoid spamming the server.
    useEffect(() => {
        if (!user || typeof document === 'undefined') return

        const REFRESH_INTERVAL = 24 * 60 * 60 * 1000 // 1 day
        const STORAGE_KEY = 'crc_session_refreshed_at'

        const maybeRefreshSession = () => {
            if (document.visibilityState !== 'visible') return
            const lastRefresh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
            if (Date.now() - lastRefresh < REFRESH_INTERVAL) return

            localStorage.setItem(STORAGE_KEY, String(Date.now()))
            syncSessionCookie(user).catch(() => {})
        }

        // Check on mount (covers first page load after days away)
        maybeRefreshSession()

        document.addEventListener('visibilitychange', maybeRefreshSession)
        return () => document.removeEventListener('visibilitychange', maybeRefreshSession)
    }, [user])

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

    const signIn = async (): Promise<void> => {
        // signInWithRedirect is the correct primary flow under Chrome's
        // Cross-Origin-Opener-Policy. signInWithPopup's credential-handoff
        // from popup→parent is unreliable under COOP — auth.currentUser
        // appears populated but the ID token isn't attached, so every
        // Firestore read fails with "Missing or insufficient permissions"
        // (including the user's own /users/{uid} doc). Redirect avoids
        // the popup entirely: full-page navigation to Google, full-page
        // return with getRedirectResult() providing the credential in the
        // main window context. Firebase JS rehydrates auth cleanly.
        try {
            await signInWithRedirect(auth, googleProvider)
        } catch (error: unknown) {
            // Redirect shouldn't throw for user-cancel (that happens on the
            // return trip), but handle unexpected initialization errors.
            const code = (error as { code?: string })?.code
            logger.error("signInWithRedirect error:", code, error)
            // Last-resort fallback to popup for environments where redirect
            // fails to initiate (rare — mostly test harnesses / file:// URLs).
            try {
                await signInWithPopup(auth, googleProvider)
            } catch (fallbackErr) {
                logger.error("Fallback popup sign-in also failed:", fallbackErr)
                throw error
            }
        }
    }

    const signOut = async () => {
        try {
            // Add a smooth loading overlay to mask the hard reload
            if (typeof document !== 'undefined') {
                document.body.insertAdjacentHTML(
                    'beforeend', 
                    '<div id="logout-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(var(--background),0.8);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;"><div style="width:32px;height:32px;border:3px solid transparent;border-top-color:hsl(var(--primary));border-radius:50%;animation:spin 1s linear infinite;"></div><p style="color:hsl(var(--foreground));font-size:14px;font-weight:500;">Logging out securely...</p></div>'
                )
            }
            localStorage.removeItem('crc_cached_user')
            localStorage.removeItem('crc_session_refreshed_at')
            // Clear server session cookie
            await fetch("/api/auth/session", { method: "DELETE" }).catch(() => { })
            await firebaseSignOut(auth)
            window.location.reload()
        } catch (error) {
            logger.error("Sign out error:", error)
            document.getElementById('logout-overlay')?.remove()
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
