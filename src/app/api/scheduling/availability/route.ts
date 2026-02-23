import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"

/**
 * GET /api/scheduling/availability?date=2026-03-15
 *
 * Returns availability for all musicians on a given date (or date range).
 * Checks blockout dates and existing assignments.
 * Band leaders only.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const url = new URL(ctx.req.url)
        const date = url.searchParams.get('date')
        const startDate = url.searchParams.get('startDate') || date
        const endDate = url.searchParams.get('endDate') || date

        if (!startDate) {
            return NextResponse.json(
                { error: 'date or startDate parameter is required' },
                { status: 400 }
            )
        }

        // 1. Get all musicians (users with musician-level roles)
        const usersSnap = await db.collection('users')
            .where('role', 'in', ['musician', 'band_leader', 'admin'])
            .get()

        const musicians = usersSnap.docs.map(d => {
            const data = d.data()
            return {
                uid: d.id,
                name: data.displayName || data.email?.split('@')[0] || 'Unknown',
                email: data.email || '',
                instrument: data.musicianProfile?.instrument || null,
                schedulingTier: data.musicianProfile?.schedulingTier || 'regular',
                phone: data.musicianProfile?.phone || null,
            }
        })

        // 2. Get all blockouts that overlap the date range
        const blockoutsSnap = await db.collection('musician_availability')
            .where('startDate', '<=', endDate)
            .get()

        // Filter in memory for endDate >= startDate (Firestore can only do one range filter)
        const blockouts = blockoutsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((b: any) => b.endDate >= startDate!)

        // 3. Get existing assignments for the date range
        // We check by setlistId via eventDate matching — assignments have eventDate
        const assignmentsSnap = await db.collection('scheduling_assignments')
            .where('status', 'in', ['pending', 'confirmed'])
            .get()

        const assignmentsInRange = assignmentsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((a: any) => {
                if (!a.eventDate) return false
                // eventDate could be ISO string or Firestore Timestamp
                let dateStr: string
                if (typeof a.eventDate === 'string') {
                    dateStr = a.eventDate.split('T')[0]
                } else if (a.eventDate?.seconds) {
                    dateStr = new Date(a.eventDate.seconds * 1000).toISOString().split('T')[0]
                } else {
                    return false
                }
                return dateStr >= startDate! && dateStr <= (endDate || startDate!)
            })

        // 4. Build availability map
        const availability = musicians.map(musician => {
            const musicianBlockouts = blockouts.filter((b: any) => b.musicianUid === musician.uid)
            const musicianAssignments = assignmentsInRange.filter((a: any) => a.musicianUid === musician.uid)

            const isBlocked = musicianBlockouts.length > 0
            const isAssigned = musicianAssignments.length > 0
            const assignmentStatus = musicianAssignments.length > 0
                ? (musicianAssignments[0] as any).status
                : null

            let status: 'available' | 'blocked' | 'assigned' | 'pending'
            if (isBlocked) {
                status = 'blocked'
            } else if (isAssigned) {
                status = assignmentStatus === 'confirmed' ? 'assigned' : 'pending'
            } else {
                status = 'available'
            }

            return {
                ...musician,
                status,
                blockouts: musicianBlockouts.map((b: any) => ({
                    startDate: b.startDate,
                    endDate: b.endDate,
                    reason: b.reason,
                })),
                assignments: musicianAssignments.map((a: any) => ({
                    setlistId: a.setlistId,
                    setlistName: a.setlistName,
                    instrument: a.instrument,
                    status: a.status,
                })),
            }
        })

        return NextResponse.json({
            success: true,
            date: startDate,
            endDate: endDate || startDate,
            availability,
        })
    },
    { role: 'band_leader' }
)
