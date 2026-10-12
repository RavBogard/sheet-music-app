"use client"

import { viewAsActiveInBrowser } from "@/lib/org/view-as"
import { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
} from "firebase/auth"
import { auth, googleProvider } from "./firebase"
// Phase 1.5 (Option B) — users-firebase is imported DYNAMICALLY below from
// the `if (currentUser)` branch so /login's static-import graph doesn't pull
// firestore symbols through this chain. Pre-auth (no currentUser) never
// enters that branch → users-firebase + its firestore imports stay out of
// /login's preload manifest. See
// `.paul/research/bundle-diet-firestore-lazy-import/FINDINGS.md` §Option-B.
import { UserProfile } from "@/types/models"
import { logger } from "@/lib/logger"
import { deriveRoles } from "@/lib/roles"
import { syncSessionCookie } from "@/lib/session-cookie"
import { repairDrift } from "@/lib/drift-repair"
import { useOrg } from "@/lib/org/org-context"
import type { OrgId } from "@/lib/org/types"
import type { Membership } from "@/lib/org/membership-types"
import {
    claimsHaveM,
    joinSessionKey,
    membershipClaimDrifted,
    resolveClientRole,
} from "@/lib/org/client-role"

interface CachedUser {
    displayName: string | null
    photoURL: string | null
    email: string | null
    /** Role in the tenant the cache was written on (`orgId`); null elsewhere. */
    role: string | null
    orgId?: string
}

interface AuthContextType {
    user: User | null
    profile: UserProfile | null
    cachedUser: CachedUser | null
    loading: boolean
    /** Multi-tenant phase 2: the host tenant this context speaks for. */
    orgId: OrgId
    /** My role in the host tenant (null = not a member here; treat as pending). */
    role: string | null
    isPlatformOwner: boolean
    /** Platform owner viewing this tenant read-only ("View as this tenant"). */
    readOnlyView: boolean
    /** My membership doc in the host tenant (null = none; undefined = not read yet). */
    membership: Membership | null | undefined
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
    orgId: "crc",
    role: null,
    isPlatformOwner: false,
    readOnlyView: false,
    membership: undefined,
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
    const org = useOrg()
    const orgRef = useRef(org)
    orgRef.current = org
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    // Multi-tenant phase 2: decoded ID-token claims (null until read for the
    // current user) and my membership in the host tenant (undefined until the
    // first snapshot; null = none).
    const [claims, setClaims] = useState<Record<string, unknown> | null>(null)
    const [membership, setMembership] = useState<Membership | null | undefined>(undefined)
    const lastClaimsUpdate = useRef<string | null>(null)
    const pushRegistered = useRef(false) // M5: prevent re-registration on every auth state change

    // Read cached user from localStorage for instant greeting (before Firebase Auth resolves)
    const [cachedUser] = useState<CachedUser | null>(() => {
        if (typeof window === 'undefined') return null
        try {
            const raw = localStorage.getItem('crc_cached_user')
            if (!raw) return null
            const parsed = JSON.parse(raw) as CachedUser
            // The cached role belongs to the tenant it was written on.
            if (parsed && parsed.orgId && parsed.orgId !== org) return { ...parsed, role: null }
            return parsed
        } catch { return null }
    })

    // Multi-tenant phase 2: po -> admin; token with `m` -> membership role in
    // this tenant; token without `m` -> legacy profile role (unchanged).
    const resolved = resolveClientRole({
        claims,
        membership,
        profileRole: profile?.role,
        profileSoundEngineer: profile?.soundEngineer,
    })
    const isPlatformOwner = resolved.isPlatformOwner
    // Multi-tenant phase 4: "View as this tenant" — the platform owner sees the
    // tenant as a member would (read-only); the proxy sets the cookie.
    const [viewAsCookie, setViewAsCookie] = useState(false)
    useEffect(() => { setViewAsCookie(viewAsActiveInBrowser()) }, [])
    const readOnlyView = isPlatformOwner && viewAsCookie
    const role = readOnlyView ? "member" : resolved.role
    // Derived roles — uses shared hierarchy from @/lib/roles
    const { isAdmin, isBandLeader, isMusician, isMember } = deriveRoles(role)
    const isSoundEngineer = resolved.isSoundEngineer
    const canUpload = isAdmin || isBandLeader || isMusician || !!profile?.canUpload
    // Hold `loading` until the token's claims are read and, for a token with
    // `m`, until the membership's first snapshot, so the UI never flashes a
    // legacy or pending role before the tenant role is known.
    const roleLoading = !!user && (claims === null || (claimsHaveM(claims) && membership === undefined))
    const effectiveLoading = loading || roleLoading

    useEffect(() => {
        // Build-time safety: If auth is mock (empty object), return
        if (!auth || Object.keys(auth).length === 0) {
            setLoading(false)
            return
        }

        let unsubscribeProfile: (() => void) | null = null
        let unsubscribeMembership: (() => void) | null = null
        let sessionReady = false
        let profileReady = false
        // Generation counter so a stale-by-the-time-the-dynamic-import-resolves
        // auth callback cannot overwrite a newer subscription. The original
        // sync-import code didn't need this — `subscribeToUserProfile` was
        // called synchronously inside the same tick as the cleanup-at-top.
        // The Option-B dynamic-import adds an await point between them, so we
        // gate the post-await assignment on the per-invocation generation
        // still being the latest.
        let callbackGen = 0

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            const myGen = ++callbackGen
            // Clean up previous profile subscription
            if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null }
            if (unsubscribeMembership) { unsubscribeMembership(); unsubscribeMembership = null }
            sessionReady = false
            profileReady = false
            setClaims(null)
            setMembership(undefined)

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

                // Phase 1.5 Option B: lazy-load users-firebase ONLY on the authed
                // path so /login (pre-auth) never reaches it through the static
                // import graph. After the first sign-in the module promise is
                // cached by the runtime, so subsequent auth events resolve it
                // synchronously — no perceptible latency penalty for returning
                // users (99% of sign-ins per existing inline comment).
                const {
                    ensureUserProfile,
                    subscribeToUserProfile,
                    subscribeToMembership,
                    requestTenantJoin,
                } = await import("./users-firebase")
                if (myGen !== callbackGen) return // a newer auth event has fired; abort

                const hostOrg = orgRef.current

                // Multi-tenant phase 2: read the token's claims (po / m / legacy).
                const readClaims = () =>
                    currentUser.getIdTokenResult()
                        .then((res) => {
                            if (myGen === callbackGen) setClaims({ ...(res.claims as Record<string, unknown>) })
                        })
                        .catch((err) => {
                            logger.warn("[auth] getIdTokenResult failed", err)
                            if (myGen === callbackGen) setClaims({})
                        })
                void readClaims()

                // Multi-tenant phase 2: my membership in the host tenant. A
                // listener error (rules not yet deployed) reads as "none"; it
                // only matters for tokens that carry `m`.
                unsubscribeMembership = subscribeToMembership(
                    hostOrg,
                    currentUser.uid,
                    (m) => { if (myGen === callbackGen) setMembership(m) },
                    () => { if (myGen === callbackGen) setMembership(null) },
                )

                // Multi-tenant phase 2: ask this tenant for a membership once
                // per (host, uid) per session. The server makes a pending
                // request when I have none and never changes an existing one;
                // when that changes my claims, refresh the token and cookie.
                let joinDue = true
                try { joinDue = sessionStorage.getItem(joinSessionKey(hostOrg, currentUser.uid)) !== "1" } catch { /* private mode */ }
                if (joinDue) {
                    requestTenantJoin()
                        .then(async (res) => {
                            try { sessionStorage.setItem(joinSessionKey(hostOrg, currentUser.uid), "1") } catch { /* private mode */ }
                            if (!res.created && !res.claimsChanged) return
                            await currentUser.getIdToken(true)
                            await syncSessionCookie(currentUser)
                            await readClaims()
                            router.refresh()
                        })
                        .catch((err) => logger.warn("[auth] join request failed", err))
                }

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
                                return readClaims()
                            })
                            .catch(err => logger.warn("Claims refresh failed:", err))
                    }
                    lastClaimsUpdate.current = claimsTs

                    // v4.3 P10-03: Firestore↔claim↔cookie drift repair, now
                    // a retried + telemetry-tagged chain in src/lib/drift-repair.ts.
                    // Multi-tenant phase 2: this legacy comparison applies only
                    // to tokens without `m`; tokens with `m` compare against
                    // the membership doc (effect below).
                    if (p?.role && p.role !== "pending") {
                        currentUser
                            .getIdTokenResult()
                            .then(async (res) => {
                                if (claimsHaveM(res.claims as Record<string, unknown>)) return
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

                    // Cache for instant greeting on next visit (the role is
                    // written by the tenant-role effect below, keyed by org).
                    if (p) {
                        try {
                            const prev = JSON.parse(localStorage.getItem('crc_cached_user') || 'null') as CachedUser | null
                            localStorage.setItem('crc_cached_user', JSON.stringify({
                                displayName: p.displayName,
                                photoURL: p.photoURL || null,
                                email: p.email,
                                role: prev && prev.orgId === hostOrg ? prev.role : null,
                                orgId: hostOrg,
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
            if (unsubscribeMembership) unsubscribeMembership()
        }
    // router is stable across renders (next/navigation); safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Multi-tenant phase 2: drift repair for tokens with `m`. The token's
    // m[org] must match the membership doc's role code. On mismatch, rebuild
    // the claims (sync-claims) and refresh token + cookie, once per state so
    // a persistent mismatch cannot loop.
    const lastDriftKey = useRef<string | null>(null)
    useEffect(() => {
        if (!user || membership === undefined || !claimsHaveM(claims)) return
        if (!membershipClaimDrifted(claims, org, membership)) return
        const claimCode = String((claims?.m as Record<string, unknown>)?.[org] ?? '')
        const key = `${user.uid}|${org}|${membership?.role ?? 'none'}|${claimCode}`
        if (lastDriftKey.current === key) return
        lastDriftKey.current = key
        repairDrift(user)
            .then(async (summary) => {
                logger.info(
                    `[drift] complete syncClaims=${summary.syncClaims} idToken=${summary.idTokenRefresh} cookie=${summary.sessionCookie} refresh=${summary.refreshSession}`,
                )
                const res = await user.getIdTokenResult()
                setClaims({ ...(res.claims as Record<string, unknown>) })
                router.refresh()
            })
            .catch((err) => logger.warn("[drift] membership repair failed", err))
    // router is stable across renders (next/navigation); safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, claims, membership, org])

    // Multi-tenant phase 2: cache the tenant role (keyed by org) for the
    // instant greeting on the next visit.
    useEffect(() => {
        if (!user || effectiveLoading) return
        try {
            const raw = localStorage.getItem('crc_cached_user')
            if (!raw) return
            const prev = JSON.parse(raw) as CachedUser
            if (prev.role === role && prev.orgId === org) return
            localStorage.setItem('crc_cached_user', JSON.stringify({ ...prev, role, orgId: org }))
        } catch { /* quota exceeded or private browsing */ }
    }, [user, effectiveLoading, role, org])

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
        loading: effectiveLoading,
        orgId: org,
        role,
        isPlatformOwner,
        readOnlyView,
        membership,
        signIn,
        signOut,
        isAdmin,
        isBandLeader,
        isMusician,
        isMember,
        isSoundEngineer,
        canUpload,
    }), [user, profile, cachedUser, effectiveLoading, org, role, isPlatformOwner, readOnlyView, membership, isAdmin, isBandLeader, isMusician, isMember, isSoundEngineer, canUpload])

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
