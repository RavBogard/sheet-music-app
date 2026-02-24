import { cookies } from "next/headers"
import { initAdmin } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"

const COOKIE_NAME = "__session"

export interface ServerUser {
    uid: string
    email: string | null
    displayName: string | null
    role: string | null
    isAdmin: boolean
    isBandLeader: boolean
    isMember: boolean
}

/**
 * Read and verify the session cookie in a Server Component.
 *
 * Returns the authenticated user or null if not signed in / cookie expired.
 * This is the server-side equivalent of `useAuth()`.
 *
 * Usage in a Server Component:
 *   const user = await getServerUser()
 *   if (!user) return <LoginPrompt />
 */
export async function getServerUser(): Promise<ServerUser | null> {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get(COOKIE_NAME)?.value
        if (!sessionCookie) return null

        initAdmin()
        const decoded = await getAuth().verifySessionCookie(sessionCookie, true)

        // Fetch the Firestore profile for role info
        const db = getFirestore()
        const profileSnap = await db.collection("users").doc(decoded.uid).get()
        const profile = profileSnap.exists ? profileSnap.data() : null

        const role = (profile?.role as string) || null
        const isAdmin = role === "admin"
        const isBandLeader = isAdmin || role === "band_leader" || role === "leader"
        const isMember = isBandLeader || role === "musician" || role === "member"

        return {
            uid: decoded.uid,
            email: decoded.email || null,
            displayName: profile?.displayName || decoded.name || null,
            role,
            isAdmin,
            isBandLeader,
            isMember,
        }
    } catch {
        // Cookie expired, revoked, or invalid — treat as unauthenticated
        return null
    }
}

/**
 * Helper to deeply serialize Firestore Timestamps to format safe for Next.js Client Boundaries
 */
function isFirestoreTimestamp(val: any): boolean {
    return val && typeof val === 'object' && typeof val.toDate === 'function'
}

function deepSerialize(obj: any): any {
    if (obj === null || obj === undefined) return obj
    if (isFirestoreTimestamp(obj)) return obj.toDate().toISOString()
    if (Array.isArray(obj)) return obj.map(deepSerialize)
    if (typeof obj === 'object') {
        const res: any = {}
        for (const key of Object.keys(obj)) {
            res[key] = deepSerialize(obj[key])
        }
        return res
    }
    return obj
}

export function serializeSetlist(id: string, data: any) {
    return {
        id,
        ...deepSerialize(data)
    }
}

/**
 * Fetch congregation config server-side.
 * Falls back to defaults if Firestore is unreachable.
 */
export async function getServerCongregationConfig() {
    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("config").doc("congregation").get()
        if (!snap.exists) return null
        return snap.data()
    } catch {
        return null
    }
}

// Re-export setlist queries from their new home for backward compatibility.
// New code should import directly from '@/lib/server-setlists'.
export {
    getUpcomingPublicSetlists,
    getRecentPublicSetlists,
    getPersonalSetlists,
    getAllPublicSetlists,
} from "@/lib/server-setlists"
