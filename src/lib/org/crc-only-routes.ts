/**
 * LAYOUT-404 (2026-11-02): the page routes that belong to CRC alone. Their
 * layouts call notFound() for any other tenant, but the (main) group streams
 * behind loading.tsx, so that notFound() runs after the 200 status is sent and
 * the response still carries the page's RSC payload. The proxy answers these
 * with a real 404 for every other tenant before rendering starts (#68 did
 * /help this way).
 *
 * - /help: the guides describe CRC's iPads, studio PC and sound desk.
 * - /monitor (and /monitor/admin, /monitor/engineer): the mixer. CRC-only
 *   whatever a tenant's flag says (effectiveFeatures), because config/monitor,
 *   monitor-live/* and the one bridge are CRC's.
 *
 * Feature-flag routes that another tenant may turn on (e.g. /perform) are not
 * here: those stay with their layout check.
 */
export const CRC_ONLY_ROUTE_ROOTS = ["/help", "/monitor"] as const

/**
 * The pathname as the router would resolve it, for matching only: percent-
 * decoded once, duplicate slashes collapsed, lowercased. So `/%6Donitor`,
 * `/Monitor` and `//monitor` all match `/monitor` rather than slipping past to
 * the layout's 200 notFound(). A malformed encoding returns null: not ours to
 * judge, Next answers it.
 */
export function normalizePathForMatch(pathname: string): string | null {
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        return null
    }
    return decoded.replace(/\/{2,}/g, "/").toLowerCase()
}

/** True for a root itself or anything under it; a sibling like /helpdesk is not. */
export function isCrcOnlyPath(pathname: string): boolean {
    const p = normalizePathForMatch(pathname)
    if (p === null) return false
    return CRC_ONLY_ROUTE_ROOTS.some((root) => p === root || p.startsWith(`${root}/`))
}
