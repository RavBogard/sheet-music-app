import { db, auth } from "./firebase"
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, Timestamp } from "firebase/firestore"
import { User } from "firebase/auth"
import { UserProfile, UserRole } from "@/types/models"

export type { UserProfile, UserRole }


/**
 * Ensures a user profile exists in Firestore.
 * Creates one with 'pending' role if it doesn't exist.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
    const ref = doc(db, "users", user.uid)
    const snap = await getDoc(ref)

    if (snap.exists()) {
        const data = snap.data() as UserProfile
        // Update last login
        await updateDoc(ref, {
            lastLoginAt: Timestamp.now(),
            email: user.email, // Keep email in sync
            displayName: user.displayName,
            photoURL: user.photoURL
        })
        return data
    } else {
        // Create new profile
        // FIRST USER (you) should be Admin automatically? 
        // For safety, let's stick to 'pending' unless it's a known email, OR just manual update in DB for the first one.
        // Actually, if I lock myself out, I can't build the admin page.
        // Let's hardcode the user's email to be 'admin' for now?
        // No, I'll just make the default 'pending' and I'll tell the user to manually enable themselves or I'll add a backdoor for localhost.

        const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Unknown",
            photoURL: user.photoURL || undefined,
            role: 'pending',
            createdAt: Timestamp.now(),
            lastLoginAt: Timestamp.now()
        }

        await setDoc(ref, newProfile)
        return newProfile
    }
}

/**
 * Subscribe to the current user's profile
 */
export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
    const ref = doc(db, "users", uid)
    return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            callback(snap.data() as UserProfile)
        } else {
            callback(null)
        }
    })
}

/**
 * Subscribe to ALL users (for Admin page)
 */
export function subscribeToAllUsers(callback: (users: UserProfile[]) => void, onError?: (error: any) => void) {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"))
    return onSnapshot(q, (snap) => {
        const users = snap.docs.map(d => d.data() as UserProfile)
        callback(users)
    }, (error) => {
        if (onError) onError(error)
        else console.error("Snapshot error:", error)
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
