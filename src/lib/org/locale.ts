import { codeOrgConfig } from "@/lib/org/config-code"
import { peekOrgConfig } from "@/lib/org/config-cache"
import type { OrgConfig } from "@/lib/org/config-schema"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — a tenant's time zone and Hebcal schedule.
 *
 * Isomorphic and synchronous: the primed config (getOrgConfig on the server,
 * OrgProvider in the browser) first, then the code tables (crc and
 * brotherslazaroff), then CRC's zone. A tenant that has not been primed in this
 * process therefore reads as CRC; server paths that serve other tenants prime
 * first (the crons call getOrgConfig for every tenant they loop over).
 */

/** CRC's zone: the fallback for an org with no config. */
export const FALLBACK_TIME_ZONE = "America/Chicago"

function localeOf(org: OrgId | null | undefined): OrgConfig["locale"] | null {
    const id = org || DEFAULT_ORG_ID
    return (peekOrgConfig(id) ?? codeOrgConfig(id))?.locale ?? null
}

/** IANA zone a tenant's wall-clock times (service starts, service days) are in. */
export function orgTimeZone(org?: OrgId | null): string {
    return localeOf(org)?.timeZone ?? FALLBACK_TIME_ZONE
}

/** Hebcal parasha schedule for the tenant. */
export function orgCalendar(org?: OrgId | null): "diaspora" | "israel" {
    return localeOf(org)?.calendar ?? "diaspora"
}

/** `YYYY-MM-DD` calendar day an instant falls on in a zone. */
export function dayInZone(ms: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(ms))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}
