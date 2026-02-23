import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getFullServiceContext, getNextFriday, getNextSaturday } from "@/lib/liturgical-calendar"
import { getTemplate } from "@/lib/liturgical-templates"
import { Setlist } from "@/types/models"

export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth // 401

        const uid = auth.uid
        if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { searchParams } = new URL(req.url)
        const type = searchParams.get('type') || 'friday_night'

        initAdmin()
        const db = getFirestore()

        // 1. Generate the date columns (-3 weeks to +4 weeks)
        const columns: any[] = []
        let baseDate = new Date()
        baseDate.setDate(baseDate.getDate() - 21) // Go back 3 weeks

        for (let i = 0; i < 8; i++) {
            let targetDate: Date
            if (type === 'shabbat_morning') {
                targetDate = getNextSaturday(baseDate)
            } else {
                targetDate = getNextFriday(baseDate)
            }

            const context = await getFullServiceContext(targetDate)
            columns.push({
                id: `col_${i}`,
                date: targetDate.toISOString(),
                context,
            })

            // Advance by a week for the next iteration
            baseDate = new Date(targetDate)
            baseDate.setDate(baseDate.getDate() + 1)
        }

        // 2. Fetch Setlists strictly within this 8-week window to avoid over-fetching
        const startDate = new Date(columns[0].date)
        startDate.setHours(0, 0, 0, 0)

        const endDate = new Date(columns[columns.length - 1].date)
        endDate.setHours(23, 59, 59, 999)

        // Note: We fetch from the 'setlists' collection. Since we want an overarching matrix,
        // we might just fetch public setlists or setlists owned by this user. 
        // For CRC, the Matrix should probably reflect the *actual* planned setlists (public ones).
        const snapshot = await db.collection('setlists')
            .where('isPublic', '==', true)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get()

        const setlists = snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                ...data,
                // Convert Firestore Timestamp to ISO string
                date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
                eventDate: data.eventDate?.toDate ? data.eventDate.toDate().toISOString() : data.eventDate
            } as Setlist
        })

        // 3. Map setlists to columns based on chronological proximity
        // A setlist "belongs" to a column if its eventDate or date falls within +/- 3 days of the column date
        columns.forEach(col => {
            const colTime = new Date(col.date).getTime()
            const match = setlists.find(s => {
                const sDate = new Date((s.eventDate || s.date) as string)
                return Math.abs(sDate.getTime() - colTime) < 3 * 24 * 60 * 60 * 1000 // 3 days tolerance
            })
                ; (col as any).setlist = match || null
        })

        // 4. Get the liturgical slots (Rows)
        const template = getTemplate(type) || []

        // Filter out headers for the grid rows—we only care about actionable slots
        const rows = template
            .filter(slot => (!slot.isHeader && slot.type !== 'header'))
            .map(slot => ({
                id: slot.label.toLowerCase().replace(/\s+/g, '_'),
                label: slot.label,
                queries: slot.queries,
                type: slot.type || 'song'
            }))

        // 5. Build the Grid 
        // grid[rowId][colId] = { track: SetlistTrack | null }
        const grid: Record<string, Record<string, any>> = {}

        rows.forEach(row => {
            grid[row.id] = {}
            columns.forEach(col => {
                const setlist: Setlist | null = (col as any).setlist
                let matchedTrack = null

                if (setlist && setlist.tracks) {
                    // Primitive matching: if the track title exists and closely matches the slot label or queries
                    // A true rigorous match would use Fuse.js here too, but simple string matching is fast for now
                    matchedTrack = setlist.tracks.find(t => {
                        const tTitle = t.title.toLowerCase()
                        const tFile = (t.fileName || '').toLowerCase()
                        if (tTitle.includes(row.label.toLowerCase())) return true
                        return row.queries.some(q => tTitle.includes(q.toLowerCase()) || tFile.includes(q.toLowerCase()))
                    })
                }

                grid[row.id][col.id] = {
                    track: matchedTrack || null
                }
            })
        })

        return NextResponse.json({
            columns,
            rows,
            grid
        })

    } catch (e: any) {
        console.error("Matrix API Error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
