import { getDb, auth, recoverFromFirestoreShutdown, subscribeWithDb } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, Timestamp } from "firebase/firestore"
import { User } from "firebase/auth"
import { UserProfile, UserRole } from "@/types/models"
import { logger } from "@/lib/logger"
import { userProfileConverter } from "@/types/schemas"

export type { UserProfile, UserRole }


/**
 * Ensures a user profile exists in Firestore.
 * Creates one with 'pending' role if it doesn't exist.
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
        const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Unknown",
            photoURL: user.photoURL ?? undefined,
            role: 'pending',
            createdAt: Timestamp.now(),
            lastLoginAt: Timestamp.now()
        }

        await setDoc(doc(db, "users", user.uid), { ...newProfile })
        return newProfile
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
                // Compare meaningful fields only (skip lastLoginAt which changes every session)
                const key = `${profile.uid}|${profile.role}|${profile.email}|${profile.displayName}|${profile.photoURL}`
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
 * Subscribe to ALL users (for Admin page)
 */
/**
 * Subscribe to ALL users (for Admin page)
 */
export function subscribeToAllUsers(callback: (users: UserProfile[]) => void, onError?: (error: Error) => void) {
    return subscribeWithDb((db) => {
        // Build safety
        if (!db || Object.keys(db).length === 0) return () => { }

        const collectionRef = collection(db, "users").withConverter(userProfileConverter)
        const q = query(collectionRef, orderBy("createdAt", "desc"))
        return onSnapshot(q, (snap) => {
            const users = snap.docs.map(d => d.data()).filter(Boolean) as UserProfile[]
            callback(users)
        }, (error) => {
            if (onError) onError(error)
            else logger.error("Snapshot error:", error)
        })
    })
}

/**
 * Update a user's role (Admin only)
 * Calls the Secure API to set Custom Claims.
 */
export async function updateUserRole(targetUid: string, newRole: UserRole) {
    const user = auth.currentUser
    if (!user) throw new Error("Not authenticated")

    const token = await user.getIdToken()

    // Call the API
    const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: targetUid, newRole })
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
