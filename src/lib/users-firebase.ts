import { getDb, auth, recoverFromFirestoreShutdown, subscribeWithDb } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, onSnapshot, Timestamp } from "firebase/firestore"
import { User } from "firebase/auth"
import { UserProfile, UserRole } from "@/types/models"
import { logger } from "@/lib/logger"
import { userProfileConverter } from "@/types/schemas"
import { membershipId, type Membership, type TenantRole } from "@/lib/org/membership-types"
import type { OrgId } from "@/lib/org/types"

export type { UserProfile, UserRole }

/**
 * Multi-tenant phase 2: one person as `GET /api/tenant/people` returns them —
 * the profile plus their membership in the host tenant (`role` is the role in
 * that tenant, never a global one).
 */
export interface TenantPerson {
    uid: string
    displayName: string | null
    email: string | null
    photoURL: string | null
    role: TenantRole
    soundEngineer: boolean
    canUpload: boolean
    musicianProfile: Record<string, unknown> | null
    createdAt: unknown
    lastLoginAt: unknown
    addedAt: unknown
    requestedAt: unknown
}

export interface TenantPeopleResponse {
    tenant: OrgId
    people: TenantPerson[]
    pendingCount: number
}


/**
 * Ensures a user profile exists in Firestore.
 *
 * Multi-tenant phase 2: a new profile carries no `role` and no `orgIds` —
 * access comes from memberships, which only the server writes (the client
 * asks for one through POST /api/auth/join). The returned profile reads as
 * 'pending' until then.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
    const db = await getDb()
    if (!db || Object.keys(db).length === 0) {
        return { uid: user.uid, role: "pending" } as UserProfile
    }
    const ref = doc(db, "users", user.uid).withConverter(userProfileConverter)
    const snap = await getDoc(ref)

    if (snap.exists()) {
        const data = snap.data()
        if (!data) throw new Error("User profile corrupted or invalid")
        // Update last login in background — never block auth on this
        // Don't overwrite displayName if user has customized it
        const updates: Record<string, unknown> = {
            lastLoginAt: Timestamp.now(),
            email: user.email,
        }
        // Only write photoURL if the auth user actually has one —
        // prevents email/password users from blanking a manually-set avatar
        if (user.photoURL) {
            updates.photoURL = user.photoURL
        }
        // Only set displayName if user hasn't customized theirs
        if (user.displayName && !data.displayName) {
            updates.displayName = user.displayName
        }
        updateDoc(ref, updates).catch(() => { /* non-critical */ })
        return data
    } else {
        const newDoc: Record<string, unknown> = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Unknown",
            ...(user.photoURL ? { photoURL: user.photoURL } : {}),
            createdAt: Timestamp.now(),
            lastLoginAt: Timestamp.now()
        }

        await setDoc(doc(db, "users", user.uid), newDoc)
        return { ...newDoc, role: 'pending' } as unknown as UserProfile
    }
}

/**
 * Subscribe to the current user's profile.
 *
 * Deduplicates updates: only fires callback when meaningful fields change.
 * This prevents the ensureUserProfile() lastLoginAt update from triggering
 * a re-render cascade through the entire app via AuthContext.
 */
export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
    return subscribeWithDb((db) => {
        if (!db || Object.keys(db).length === 0) return () => { }
        const ref = doc(db, "users", uid).withConverter(userProfileConverter)
        // Use sentinel to distinguish "never fired" from "fired with null".
        // Without this, a new user whose profile doc doesn't exist yet would
        // never get the initial null callback (lastProfile starts null, guard
        // `lastProfile !== null` would be false), leaving loading stuck forever.
        const NEVER_FIRED = '__NEVER_FIRED__'
        let lastProfile: string | null = NEVER_FIRED as string | null

        return onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                const profile = snap.data()
                if (!profile) return // Zod conversion failed, essentially treat as non-existent or ignore invalid state
                // Compare meaningful fields only (skip lastLoginAt which changes every session).
                // Multi-tenant phase 2: claimsUpdatedAt and soundEngineer are included —
                // a membership change in another tenant can rebuild claims without
                // changing the legacy role mirror, and the auth context must still
                // see the new claimsUpdatedAt to refresh the token.
                const key = `${profile.uid}|${profile.role}|${profile.email}|${profile.displayName}|${profile.photoURL}|${profile.soundEngineer ? 1 : 0}|${profile.claimsUpdatedAt?.toString() ?? ''}`
                if (key !== lastProfile) {
                    lastProfile = key
                    callback(profile)
                }
            } else {
                if (lastProfile !== null) {
                    lastProfile = null
                    callback(null)
                }
            }
        }, (err) => {
            if (!recoverFromFirestoreShutdown(err)) {
                logger.error("[Users] Profile listener error:", err)
            }
        })
    })
}

/**
 * Multi-tenant phase 2: listen to my own membership in one tenant
 * (`memberships/{org}__{uid}`; the rules let me read my own id even before it
 * exists). `null` = no membership here. Errors (e.g. rules not yet deployed)
 * are reported to `onError`; the caller decides the fallback.
 */
export function subscribeToMembership(
    org: OrgId,
    uid: string,
    callback: (membership: Membership | null) => void,
    onError?: (err: Error) => void,
) {
    return subscribeWithDb((db) => {
        if (!db || Object.keys(db).length === 0) return () => { }
        return onSnapshot(doc(db, "memberships", membershipId(org, uid)), (snap) => {
            callback(snap.exists() ? (snap.data() as Membership) : null)
        }, (err) => {
            if (!recoverFromFirestoreShutdown(err)) {
                logger.warn("[Users] Membership listener error:", err)
            }
            onError?.(err)
        })
    })
}

export interface JoinResult {
    tenant: OrgId
    role: TenantRole | null
    created: boolean
    claimsChanged: boolean
}

/**
 * Multi-tenant phase 2: ask the host tenant for a membership (POST
 * /api/auth/join). The server creates a pending request when I have none and
 * never changes an existing one. Throws on a non-OK response.
 */
export async function requestTenantJoin(): Promise<JoinResult> {
    const { apiFetch } = await import("@/lib/api-client")
    const res = await apiFetch("/api/auth/join", { method: "POST", body: "{}" })
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(detail || `Join failed (${res.status})`)
    }
    const data = (await res.json()) as Partial<JoinResult>
    return {
        tenant: data.tenant as OrgId,
        role: (data.role ?? null) as TenantRole | null,
        created: data.created === true,
        claimsChanged: data.claimsChanged === true,
    }
}

/**
 * Multi-tenant phase 2: the people of the host tenant (band leaders and up).
 * Replaces the old whole-collection `users` listener, which the rules no
 * longer allow. Throws on a non-OK response; callers decide whether an empty
 * list is the right fallback.
 */
export async function fetchTenantPeople(): Promise<TenantPeopleResponse> {
    const { apiFetch } = await import("@/lib/api-client")
    const res = await apiFetch("/api/tenant/people", { method: "GET" })
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(detail || `Request failed (${res.status})`)
    }
    const data = (await res.json()) as Partial<TenantPeopleResponse>
    const people = Array.isArray(data.people) ? data.people : []
    return {
        tenant: data.tenant as OrgId,
        people,
        pendingCount: typeof data.pendingCount === "number"
            ? data.pendingCount
            : people.filter((p) => p.role === "pending").length,
    }
}

/**
 * Set a person's role in one tenant (admins of that tenant only).
 * `newRole: null` removes them from the tenant; `'denied'` declines a request.
 * `tenant` defaults to the host tenant on the server.
 */
export async function updateUserRole(
    targetUid: string,
    newRole: TenantRole | null,
    opts?: { tenant?: OrgId },
) {
    const user = auth.currentUser
    if (!user) throw new Error("Not authenticated")

    const token = await user.getIdToken()

    const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: targetUid, newRole, ...(opts?.tenant ? { tenant: opts.tenant } : {}) })
    })

    if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg)
    }

    // The API handles the Firestore update too, so we don't need to do it here.
    // Client snapshot listeners will update the UI automatically.
}

/**
 * Update user's profile display name.
 *
 * v4.4 DL-010: routes through /api/profile/update so the server can fan out the
 * new name to every scheduling_assignments doc (musicianName / assignedByName)
 * in the same round-trip. Direct Firestore writes from the browser would leave
 * the denormalized copies drifting until the assignment reached a terminal state.
 *
 * The `uid` parameter is retained for backwards-compatibility with callers but
 * the server route uses ctx.auth.uid — users can only self-update.
 */
export async function updateUserDisplayName(_uid: string, displayName: string) {
    const { apiFetch } = await import("@/lib/api-client")
    const res = await apiFetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(`Failed to update display name (${res.status}): ${detail}`)
    }
}

/**
 * Mark that the user has seen the welcome modal
 */
export async function markWelcomeModalViewed(uid: string) {
    const db = await getDb()
    if (!db || Object.keys(db).length === 0) return
    await updateDoc(doc(db, "users", uid), { viewedWelcomeModal: true })
}
