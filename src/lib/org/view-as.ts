/**
 * Multi-tenant phase 4 — "View as this tenant" (ruling: read-only, as Daniel).
 * The console opens the tenant's address with `?viewAs=1`; the proxy turns
 * that into a host-only cookie (and `?viewAs=0` clears it). While the cookie is
 * set, the platform owner's API writes on that address are refused and the
 * browser treats him as a member with a banner. Firestore rules cannot see a
 * cookie, so direct browser writes are prevented by the UI (no edit controls
 * for a member), not by the rules.
 */
export const VIEW_AS_COOKIE = "__view_as"
export const VIEW_AS_PARAM = "viewAs"

export function hasViewAsCookie(cookieHeader: string | null | undefined): boolean {
    if (!cookieHeader) return false
    return cookieHeader.split(";").some((c) => c.trim() === `${VIEW_AS_COOKIE}=1`)
}

/** Browser only. */
export function viewAsActiveInBrowser(): boolean {
    return typeof document !== "undefined" && hasViewAsCookie(document.cookie)
}

export function isWriteMethod(method: string | undefined): boolean {
    return !["GET", "HEAD", "OPTIONS"].includes((method ?? "GET").toUpperCase())
}
