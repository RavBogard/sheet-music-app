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

/** Hour of the day (0-23) an instant falls on in a zone. */
export function hourInZone(ms: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(ms))
    return Number(parts.find((p) => p.type === "hour")?.value ?? 0)
}

/**
 * Whether the daily scheduling reminder is due for this tenant in the hour
 * containing `nowMs`. A pinned `reminderUtcHour` wins (CRC and BL: 10, the
 * historical cron slot); otherwise the tenant-local `reminderLocalHour`, so a
 * Jerusalem tenant gets 05:00 local in summer and in winter.
 */
export function reminderDue(org: OrgId, nowMs: number): boolean {
    const locale = localeOf(org)
    if (!locale) return false
    if (locale.reminderUtcHour !== null && locale.reminderUtcHour !== undefined) {
        return new Date(nowMs).getUTCHours() === locale.reminderUtcHour
    }
    return hourInZone(nowMs, locale.timeZone) === locale.reminderLocalHour
}
