/**
 * Scheduling Client-Side Firebase Helpers
 *
 * Real-time subscriptions and queries for scheduling data.
 * Write operations go through API routes (Admin SDK).
 */

import { db } from '@/lib/firebase'
import {
    collection, query, where, orderBy, onSnapshot,
    updateDoc, doc, Timestamp,
} from 'firebase/firestore'
import type { SchedulingAssignment } from '@/types/models'
import { logger } from '@/lib/logger'

// ── Scheduling Assignments ──

/**
 * Subscribe to a musician's upcoming assignments (confirmed + pending).
 */
export function subscribeToMyAssignments(
    uid: string,
    callback: (assignments: SchedulingAssignment[]) => void
): () => void {
    const q = query(
        collection(db, 'scheduling_assignments'),
        where('musicianUid', '==', uid),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('assignedAt', 'desc'),
    )

    return onSnapshot(q, (snap) => {
        const assignments = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        } as SchedulingAssignment))
        callback(assignments)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to my assignments failed:', err)
        callback([])
    })
}

/**
 * Subscribe to all assignments for a specific setlist.
 */
export function subscribeToSetlistAssignments(
    setlistId: string,
    callback: (assignments: SchedulingAssignment[]) => void
): () => void {
    const q = query(
        collection(db, 'scheduling_assignments'),
        where('setlistId', '==', setlistId),
        where('status', 'in', ['pending', 'confirmed', 'declined']),
    )

    return onSnapshot(q, (snap) => {
        const assignments = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        } as SchedulingAssignment))
        callback(assignments)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to setlist assignments failed:', err)
        callback([])
    })
}

/**
 * Get all assignments for upcoming services (band leader view).
 */
export function subscribeToAllUpcomingAssignments(
    callback: (assignments: SchedulingAssignment[]) => void
): () => void {
    const q = query(
        collection(db, 'scheduling_assignments'),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('assignedAt', 'desc'),
    )

    return onSnapshot(q, (snap) => {
        const assignments = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        } as SchedulingAssignment))
        callback(assignments)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to all assignments failed:', err)
        callback([])
    })
}

/**
 * Subscribe to all public setlists with upcoming event dates.
 * Used by the schedule page to show services even without assignments.
 */
export function subscribeToUpcomingSetlists(
    callback: (setlists: Array<{ id: string; name: string; eventDate: unknown }>) => void
): () => void {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const q = query(
        collection(db, 'setlists'),
        where('eventDate', '>=', Timestamp.fromDate(now)),
        orderBy('eventDate', 'asc'),
    )

    return onSnapshot(q, (snap) => {
        const setlists = snap.docs.map(d => ({
            id: d.id,
            name: (d.data().name as string) || 'Untitled',
            eventDate: d.data().eventDate,
        }))
        callback(setlists)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to upcoming setlists failed:', err)
        callback([])
    })
}

// ── API Wrappers ──

/**
 * Assign musicians to a setlist via API.
 */
export async function assignMusicians(params: {
    setlistId: string
    setlistName: string
    eventDate?: string | null
    serviceType?: string
    musicians: Array<{
        uid: string
        name: string
        email: string
        phone?: string
        instrument?: string
        schedulingTier?: 'core' | 'regular' | 'guest'
    }>
}): Promise<{ success: boolean; assigned?: number; errors?: string[] }> {
    const { apiFetch } = await import('@/lib/api-client')
    const res = await apiFetch('/api/scheduling/assign', {
        method: 'POST',
        body: JSON.stringify(params),
    })
    return res.json()
}

/**
 * Respond to a scheduling assignment via API.
 */
export async function respondToAssignment(params: {
    assignmentId: string
    action: 'accept' | 'decline'
    declineReason?: string
}): Promise<{ success: boolean; status?: string }> {
    const { apiFetch } = await import('@/lib/api-client')
    const res = await apiFetch('/api/scheduling/respond', {
        method: 'POST',
        body: JSON.stringify(params),
    })
    return res.json()
}

/**
 * Unassign a musician via API.
 */
export async function unassignMusician(assignmentId: string): Promise<{ success: boolean }> {
    const { apiFetch } = await import('@/lib/api-client')
    const res = await apiFetch('/api/scheduling/unassign', {
        method: 'POST',
        body: JSON.stringify({ assignmentId }),
    })
    return res.json()
}

/**
 * Generate a unique calendar feed token for a musician.
 * Saves it to the user's musicianProfile.
 */
export async function generateCalendarFeedToken(uid: string): Promise<string> {
    // Generate a secure random token
    const array = new Uint8Array(24)
    crypto.getRandomValues(array)
    const token = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')

    // Save to the user document
    const userRef = doc(db, 'users', uid)
    await updateDoc(userRef, {
        'musicianProfile.calendarFeedToken': token,
    })

    return token
}
