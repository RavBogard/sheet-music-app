import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { BASE_URL } from "@/lib/constants"

/**
 * GET /api/scheduling/calendar-feed/[token]
 *
 * Public iCal (.ics) feed for a musician's schedule.
 * The token is a unique per-musician feed token stored in their profile.
 * No authentication required — the token acts as the credential.
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ token: string }> }
) {
    try {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const { token } = await context.params

        if (!token || token.length < 10) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
        }

        const db = getFirestore()

        // Find the musician by calendar feed token
        const usersSnap = await db.collection('users')
            .where('musicianProfile.calendarFeedToken', '==', token)
            .limit(1)
            .get()

        if (usersSnap.empty) {
            return NextResponse.json({ error: 'Invalid feed token' }, { status: 404 })
        }

        const userDoc = usersSnap.docs[0]
        const uid = userDoc.id
        const userData = userDoc.data()
        const displayName = userData.displayName || 'Musician'

        // Get confirmed + pending assignments for this musician
        const assignmentsSnap = await db.collection('scheduling_assignments')
            .where('musicianUid', '==', uid)
            .where('status', 'in', ['confirmed', 'pending'])
            .get()

        interface CalendarAssignment {
            id: string
            eventDate: unknown
            instrument: string
            status: string
            setlistName: string
            setlistId: string
        }
        const assignments: CalendarAssignment[] = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as CalendarAssignment)

        // Generate iCal
        const now = new Date()
        const dtstamp = formatICalDate(now)

        const ical = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//CRC Music//Musician Schedule//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:CRC Music - ${escapeICalText(displayName)}`,
            'X-WR-TIMEZONE:America/Chicago',
        ]

        for (const a of assignments) {
            const eventDate = parseEventDate(a.eventDate)
            if (!eventDate) continue

            const startDate = new Date(eventDate)
            // Assume services are 1.5 hours
            const endDate = new Date(eventDate.getTime() + 90 * 60 * 1000)

            const instrumentText = a.instrument ? ` (${a.instrument})` : ''
            const statusText = a.status === 'confirmed' ? 'Confirmed' : 'Pending'
            const baseUrl = BASE_URL

            const description = [
                `Status: ${statusText}`,
                a.instrument ? `Instrument: ${a.instrument}` : '',
                `Setlist: ${baseUrl}/setlists/${a.setlistId}`,
                `Schedule: ${baseUrl}/schedule`,
            ].filter(Boolean).join('\\n')

            ical.push(
                'BEGIN:VEVENT',
                `UID:crc-${a.id}@centralreform.live`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART:${formatICalDate(startDate)}`,
                `DTEND:${formatICalDate(endDate)}`,
                `SUMMARY:${escapeICalText(a.setlistName)}${escapeICalText(instrumentText)}`,
                `DESCRIPTION:${description}`,
                'LOCATION:Central Reform Congregation',
                `STATUS:${a.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
                `URL:${baseUrl}/setlists/${a.setlistId}`,
                'END:VEVENT',
            )
        }

        ical.push('END:VCALENDAR')

        const icsContent = ical.join('\r\n')

        return new NextResponse(icsContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': `attachment; filename="crc-schedule-${token.slice(0, 8)}.ics"`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        })
    } catch (error) {
        logger.error('[Calendar Feed] Error generating iCal:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

function hasSeconds(v: unknown): v is { seconds: number } {
    return typeof v === 'object' && v !== null && 'seconds' in v && typeof (v as Record<string, unknown>).seconds === 'number'
}

function parseEventDate(eventDate: unknown): Date | null {
    if (!eventDate) return null
    try {
        if (typeof eventDate === 'string') return new Date(eventDate)
        if (hasSeconds(eventDate)) {
            return new Date(eventDate.seconds * 1000)
        }
        if (eventDate instanceof Date) return eventDate
    } catch (e) { logger.warn('[Calendar] Failed to parse eventDate:', e) }
    return null
}

function formatICalDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n')
}
