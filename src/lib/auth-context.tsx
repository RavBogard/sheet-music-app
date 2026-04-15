"use client"

import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
} from "firebase/auth"
import { auth, googleProvider } from "./firebase"
import { ensureUserProfile, subscribeToUserProfile } from "./users-firebase"
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"
import { deriveRoles } from "@/lib/roles"
import { syncSessionCookie } from "@/lib/session-cookie"
import { repairDrift } from "@/lib/drift-repair"

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
    const router = useRouter()
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
                    // v4.3 P10-02: re-run the current route through middleware so
                    // the proxy sees the freshly-set __session cookie. Fixes the
                    // cold-load race where the first nav precedes Set-Cookie.
                    if (ok) router.refresh()
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

                    // v4.3 P10-03: Firestore↔claim↔cookie drift repair, now
                    // a retried + telemetry-tagged chain in src/lib/drift-repair.ts.
                    if (p?.role && p.role !== "pending") {
                        currentUser
                            .getIdTokenResult()
                            .then(async (res) => {
                                const claimRole = res.claims.role as string | undefined
                                if (claimRole === p.role) return
                                const summary = await repairDrift(currentUser)
                                logger.info(
                                    `[drift] complete syncClaims=${summary.syncClaims} idToken=${summary.idTokenRefresh} cookie=${summary.sessionCookie} refresh=${summary.refreshSession}`,
                                )
                                router.refresh()
                            })
                            .catch((err) =>
                                logger.warn("[drift] getIdTokenResult failed", err),
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
    // router is stable across renders (next/navigation); safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Refresh session cookie when user returns to the app.
    // The cookie expires after 14 days (Firebase max). Without refresh, mobile
    // users who open the app weekly would hit expired cookies — middleware
    // redirects to /login while Firebase client auth is still valid, and static
    // assets (like the PDF worker) get served as login HTML instead of JS.
    // v4.3 P10-02: mount always refreshes (bypasses throttle); visibilitychange
    // stays throttled to once per day.
    useEffect(() => {
        if (!user || typeof document === 'undefined') return

        const REFRESH_INTERVAL = 24 * 60 * 60 * 1000 // 1 day
        const STORAGE_KEY = 'crc_session_refreshed_at'

        const refreshOnMount = () => {
            // Bypass throttle on first mount — stale-but-recent flag shouldn't
            // block a refresh if the cookie was cleared between sessions.
            localStorage.setItem(STORAGE_KEY, String(Date.now()))
            syncSessionCookie(user)
                .then((ok) => { if (ok) router.refresh() })
                .catch(() => { })
        }

        const maybeRefreshOnVisibility = () => {
            if (document.visibilityState !== 'visible') return
            const lastRefresh = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
            if (Date.now() - lastRefresh < REFRESH_INTERVAL) return

            localStorage.setItem(STORAGE_KEY, String(Date.now()))
            syncSessionCookie(user)
                .then((ok) => { if (ok) router.refresh() })
                .catch(() => { })
        }

        // Mount fires every time this effect re-runs for a new user uid.
        refreshOnMount()

        document.addEventListener('visibilitychange', maybeRefreshOnVisibility)
        return () => document.removeEventListener('visibilitychange', maybeRefreshOnVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])

    // v4.3 P10-06: cross-tab sign-out. If another tab signs out, reload this
    // tab so it doesn't keep showing stale authenticated UI until the next
    // user interaction.
    useEffect(() => {
        if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
        let channel: BroadcastChannel | null = null
        try {
            channel = new BroadcastChannel('auth-signout')
        } catch {
            return
        }
        const onMessage = () => {
            // Keep it simple: mirror the sign-out tab's hard-reload behavior.
            // The middleware on next request sees the cleared cookies and
            // routes to /login, matching the source tab's end state.
            localStorage.removeItem('crc_cached_user')
            localStorage.removeItem('crc_session_refreshed_at')
            window.location.reload()
        }
        channel.addEventListener('message', onMessage)
        return () => {
            channel?.removeEventListener('message', onMessage)
            channel?.close()
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

    const signIn = async (): Promise<void> => {
        try {
            await signInWithPopup(auth, googleProvider)
        } catch (error: unknown) {
            const code = (error as { code?: string })?.code
            if (
                code === "auth/popup-blocked" ||
                code === "auth/popup-closed-by-user" ||
                code === "auth/cancelled-popup-request"
            ) {
                logger.warn("Popup sign-in cancelled or blocked:", code)
                return
            }
            logger.error("Sign in error:", error)
            throw error
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
            // v4.3 P10-06: notify sibling tabs so they reload too instead of
            // sitting on stale UI until the user interacts with them.
            if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
                try {
                    const channel = new BroadcastChannel('auth-signout')
                    channel.postMessage({ at: Date.now() })
                    channel.close()
                } catch { /* unsupported browser — fall through */ }
            }
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
