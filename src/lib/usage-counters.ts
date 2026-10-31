/**
 * TEL-02: the in-app page counter behind /api/web-vitals. Pure helpers; the
 * route does the (bounded) Firestore write.
 *
 * One document per (day, tenant, route): `usageCounters/{day}__{org}__{route}`.
 * The route key can only be one of a fixed set, so a caller cannot grow the
 * collection by inventing paths: anything else lands in "other".
 */
export const PAGEVIEW_DEVICES = ["mobile", "tablet", "desktop", "unknown"] as const
export type PageViewDevice = (typeof PAGEVIEW_DEVICES)[number]

const KNOWN_FIRST_SEGMENTS = new Set([
    "", "setlists", "perform", "library", "manage", "monitor", "settings", "schedule",
    "qr", "invite", "login", "privacy", "terms", "accessibility", "platform",
    "integrations", "sms-consent", "changelog", "test-login",
])

/** A route key from a client-reported surface; unknown shapes become "other". */
export function boundedSurface(surface: string): string {
    if (typeof surface !== "string" || !surface.startsWith("/") || surface.length > 100) return "other"
    const parts = surface.split("/").filter(Boolean)
    if (parts.length > 5) return "other"
    if (!KNOWN_FIRST_SEGMENTS.has(parts[0] ?? "")) return "other"
    // Only the placeholders the client emits, or plain words, may appear below the first segment.
    const ok = parts.slice(1).every((p) => /^(\[[A-Za-z]+\]|[a-z][a-z-]{0,30})$/.test(p))
    return ok ? surface : "other"
}

export function utcDay(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
}

export function counterDocId(day: string, orgId: string, surface: string): string {
    return `${day}__${orgId}__${surface.replace(/\//g, "~") || "~"}`
}
