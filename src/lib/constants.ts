export const MIME_TYPES = {
    FOLDER: 'application/vnd.google-apps.folder',
    SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
    DOCUMENT: 'application/vnd.google-apps.document'
} as const

export const APP_NAME = "Sheet Music App"

/**
 * Canonical base URL — used for emails, links, calendar feeds, etc.
 * Falls back to the hardcoded production URL if env var is not set.
 */
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://centralreform.live'

/**
 * Default congregation short name — used as a fallback when the Firestore
 * congregation config hasn't loaded yet (SSR, offline, first paint).
 */
export const DEFAULT_SHORT_NAME = "CRC Music"
