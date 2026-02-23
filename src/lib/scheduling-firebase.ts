/**
 * Scheduling Client-Side Firebase Helpers
 *
 * Real-time subscriptions and queries for scheduling data.
 * Write operations go through API routes (Admin SDK).
 */

import { db } from '@/lib/firebase'
import {
    collection, query, where, orderBy, onSnapshot, getDocs,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import type { SchedulingAssignment, MusicianBlockout } from '@/types/models'
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

// ── Musician Availability (Blockout Dates) ──

/**
 * Subscribe to a musician's blockout dates.
 */
export function subscribeToMyBlockouts(
    uid: string,
    callback: (blockouts: MusicianBlockout[]) => void
): () => void {
    const q = query(
        collection(db, 'musician_availability'),
        where('musicianUid', '==', uid),
        orderBy('startDate', 'asc'),
    )

    return onSnapshot(q, (snap) => {
        const blockouts = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        } as MusicianBlockout))
        callback(blockouts)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to my blockouts failed:', err)
        callback([])
    })
}

/**
 * Subscribe to ALL musicians' blockouts (band leader view).
 */
export function subscribeToAllBlockouts(
    callback: (blockouts: MusicianBlockout[]) => void
): () => void {
    const q = query(
        collection(db, 'musician_availability'),
        orderBy('startDate', 'asc'),
    )

    return onSnapshot(q, (snap) => {
        const blockouts = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
        } as MusicianBlockout))
        callback(blockouts)
    }, (err) => {
        logger.warn('[Scheduling] Subscribe to all blockouts failed:', err)
        callback([])
    })
}

/**
 * Create a blockout date range (client-side write — allowed by Firestore rules).
 */
export async function createBlockout(
    uid: string,
    startDate: string,
    endDate: string,
    reason?: string,
): Promise<string> {
    const ref = await addDoc(collection(db, 'musician_availability'), {
        musicianUid: uid,
        startDate,
        endDate,
        reason: reason || null,
        recurring: false,
        createdAt: serverTimestamp(),
    })
    return ref.id
}

/**
 * Delete a blockout date.
 */
export async function deleteBlockout(blockoutId: string): Promise<void> {
    await deleteDoc(doc(db, 'musician_availability', blockoutId))
}

// ── Helpers ──

/**
 * Check if a musician is blocked out for a given date.
 */
export function isBlockedOut(
    blockouts: MusicianBlockout[],
    date: string, // 'YYYY-MM-DD'
): boolean {
    return blockouts.some(b => date >= b.startDate && date <= b.endDate)
}

/**
 * Get availability status for a musician on a given date.
 * Returns 'available', 'blocked', or 'unknown'.
 */
export function getAvailabilityStatus(
    blockouts: MusicianBlockout[],
    musicianUid: string,
    date: string,
): 'available' | 'blocked' | 'unknown' {
    const musicianBlockouts = blockouts.filter(b => b.musicianUid === musicianUid)
    if (musicianBlockouts.length === 0) return 'available' // No blockouts = assume available
    return isBlockedOut(musicianBlockouts, date) ? 'blocked' : 'available'
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
