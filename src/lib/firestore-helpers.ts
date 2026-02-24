/**
 * Firestore document converters for type-safe reads and writes.
 * Handles the messy Timestamp ↔ Date conversion that's scattered everywhere.
 */

import { Timestamp } from "firebase/firestore"

/**
 * Convert a Firestore Timestamp or string to a JS Date.
 * Handles all the variants stored in the database.
 */
export function toDate(value: string | number | Date | { seconds: number; nanoseconds: number } | { toDate: () => Date } | null | undefined): Date | null {
    if (!value) return null
    if (value instanceof Date) return value
    if (value instanceof Timestamp) return value.toDate()
    if (typeof value === 'string') return new Date(value)
    if (typeof value === 'number') return new Date(value)
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') return value.toDate()
    if (typeof value === 'object' && value !== null && 'seconds' in value) return new Timestamp(value.seconds, value.nanoseconds || 0).toDate()
    return null
}

/**
 * Convert a Firestore Timestamp or string to an ISO string.
 * For consistent serialization to the client.
 */
export function toISOString(value: string | number | Date | { seconds: number; nanoseconds: number } | { toDate: () => Date } | null | undefined): string | null {
    const d = toDate(value)
    return d ? d.toISOString() : null
}

/**
 * Format a date value (Timestamp | string | Date) for display.
 * Returns a user-friendly string like "Friday, February 14".
 */
export function formatEventDate(value: string | number | Date | { seconds: number; nanoseconds: number } | { toDate: () => Date } | null | undefined): string | null {
    const d = toDate(value)
    if (!d) return null
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    })
}

/**
 * Convert any Firestore date variant to a 'YYYY-MM-DD' string.
 * Useful for calendar day-key comparisons.
 */
export function dateStr(value: string | number | Date | { seconds: number; nanoseconds: number } | { toDate: () => Date } | null | undefined): string | null {
    const d = toDate(value)
    if (!d) return null
    return d.toISOString().split('T')[0]
}

/**
 * Get a relative label for an event date: "Tonight", "Tomorrow", or the formatted date.
 */
export function getRelativeDateLabel(value: string | number | Date | { seconds: number; nanoseconds: number } | { toDate: () => Date } | null | undefined): string | null {
    const d = toDate(value)
    if (!d) return null

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.floor((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return now.getHours() >= 12 ? "Tonight" : "Today"
    }
    if (diffDays === 1) return "Tomorrow"
    if (diffDays > 1 && diffDays <= 6) {
        return d.toLocaleDateString('en-US', { weekday: 'long' })
    }

    return formatEventDate(value)
}
