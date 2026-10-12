import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { orgString } from "@/lib/org/strings"
import type { OrgId } from "@/lib/org/types"

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

/**
 * Multi-tenant phase 1: org-aware drop-in replacements for the two constants
 * above. A tenant whose `seo.baseUrl` is CRC's (crc itself, and Brothers
 * Lazaroff, frozen to the centralreform.live links it has always received)
 * gets BASE_URL exactly, env override included; any other tenant gets
 * https://{its primary host}.
 */
export function baseUrlFor(org: OrgId): string {
    const url = orgString(org, "seo.baseUrl")
    return url === orgString("crc", "seo.baseUrl") ? BASE_URL : url
}

/**
 * The congregation short-name fallback for an org (its
 * `congregationDefaults.shortName`): "CRC Music" for crc and, frozen, for
 * Brothers Lazaroff, exactly as DEFAULT_SHORT_NAME.
 */
export function shortNameFor(org: OrgId): string {
    const tenant = peekOrgConfig(org) ?? codeOrgConfig(org)
    return tenant?.congregationDefaults.shortName ?? DEFAULT_SHORT_NAME
}
