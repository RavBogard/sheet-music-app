import { db, auth } from "./firebase"
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
    if (!db || Object.keys(db).length === 0) return () => { }
    const ref = doc(db, "users", uid).withConverter(userProfileConverter)
    let lastProfile: string | null = null

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
    })
}

/**
 * Subscribe to ALL users (for Admin page)
 */
/**
 * Subscribe to ALL users (for Admin page)
 */
export function subscribeToAllUsers(callback: (users: UserProfile[]) => void, onError?: (error: Error) => void) {
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
 * Update user's profile display name
 */
export async function updateUserDisplayName(uid: string, displayName: string) {
    if (!db || Object.keys(db).length === 0) return
    await updateDoc(doc(db, "users", uid), { displayName })
}

/**
 * Mark that the user has seen the welcome modal
 */
export async function markWelcomeModalViewed(uid: string) {
    if (!db || Object.keys(db).length === 0) return
    await updateDoc(doc(db, "users", uid), { viewedWelcomeModal: true })
}
