/**
 * Shared Firestore utility functions.
 */

/**
 * Parse a Firestore date field that could be a Timestamp, string, or Date.
 * Handles both server-side (Admin SDK Timestamps with toDate()) and
 * client-side (string) date representations.
 */
export function parseFirestoreDate(val: unknown): Date | null {
    if (!val) return null
    if (typeof val === 'string') return new Date(val)
    if (typeof val === 'object' && val !== null && 'toDate' in val) {
        return (val as { toDate: () => Date }).toDate()
    }
    if (val instanceof Date) return val
    return null
}

/**
 * Sanitize a string for safe CSV output.
 * Prevents formula injection by prefixing cells that start with
 * =, +, -, @, tab, or carriage return.
 */
export function sanitizeCsvCell(value: string): string {
    const escaped = value.replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(escaped)) {
        return `"'${escaped}"`
    }
    return `"${escaped}"`
}
