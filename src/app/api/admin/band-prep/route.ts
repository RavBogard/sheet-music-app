import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

/**
 * GET /api/admin/band-prep
 * Returns band preparation status for upcoming public setlists.
 * Requires admin or leader role.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()

        // 1. Get upcoming public setlists (next 14 days)
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const twoWeeks = new Date(now)
        twoWeeks.setDate(twoWeeks.getDate() + 14)

        const setlistSnap = await db.collection('setlists')
            .where('isPublic', '==', true)
            .where('eventDate', '>=', now)
            .where('eventDate', '<=', twoWeeks)
            .orderBy('eventDate', 'asc')
            .limit(10)
            .get()

        if (setlistSnap.empty) {
            return NextResponse.json({ setlists: [] })
        }

        // 2. Get all band members (musicians and above — not community members)
        const usersSnap = await db.collection('users').get()
        const members: { uid: string; name: string }[] = []
        const bandRoles = new Set(['musician', 'band_leader', 'leader', 'admin'])
        usersSnap.docs.forEach(d => {
            const data = d.data()
            const role = data.role
            if (role && bandRoles.has(role)) {
                members.push({
                    uid: d.id,
                    name: data.displayName || data.email || d.id,
                })
            }
        })

        // 3. For each setlist, check each member's prep
        const results = await Promise.all(setlistSnap.docs.map(async (setlistDoc) => {
            const setlist = setlistDoc.data()
            const tracks = (setlist.tracks || []).filter(
                (t: { fileId?: string; type?: string }) => t.fileId && t.type !== 'header'
            )
            const fileIds = tracks.map((t: { fileId: string }) => t.fileId)

            const memberPrep = await Promise.all(members.map(async (member) => {
                let viewed = 0
                let practiceSeconds = 0

                // Batch read songPreferences for this member
                for (const fileId of fileIds) {
                    try {
                        const prefDoc = await db
                            .collection('users')
                            .doc(member.uid)
                            .collection('songPreferences')
                            .doc(fileId)
                            .get()

                        if (prefDoc.exists) {
                            const data = prefDoc.data()!
                            if (data.lastViewedAt) viewed++
                            if (data.practiceSeconds) practiceSeconds += data.practiceSeconds
                        }
                    } catch {
                        // Skip on permission errors
                    }
                }

                return {
                    uid: member.uid,
                    name: member.name,
                    viewed,
                    total: fileIds.length,
                    practiceSeconds,
                }
            }))

            return {
                id: setlistDoc.id,
                name: setlist.name,
                eventDate: setlist.eventDate?.toDate?.()?.toISOString() || null,
                trackCount: fileIds.length,
                members: memberPrep.sort((a, b) => b.viewed - a.viewed),
            }
        }))

        return NextResponse.json({ setlists: results })
    } catch (e) {
        logger.error('[BandPrep] Error:', e)
        return NextResponse.json({ error: 'Failed to load band prep' }, { status: 500 })
    }
}
