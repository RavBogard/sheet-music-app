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
 * Fetch public setlists server-side for instant SSR.
 * Returns the next 5 upcoming public setlists.
 */
export async function getUpcomingPublicSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const snap = await db
            .collection("setlists")
            .where("isPublic", "==", true)
            .where("eventDate", ">=", now)
            .orderBy("eventDate", "asc")
            .limit(5)
            .get()

        return snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }))
    } catch (error) {
        logger.warn("Server setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch recent public setlists (for users with no upcoming events).
 */
export async function getRecentPublicSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .where("isPublic", "==", true)
            .orderBy("date", "desc")
            .limit(5)
            .get()

        return snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }))
    } catch (error) {
        logger.warn("Server recent setlist fetch failed:", error)
        return []
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
