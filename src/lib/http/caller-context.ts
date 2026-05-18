/**
 * Cycle-5 C5B-006 — branch unauth error hint messaging on the caller's
 * apparent context so production error envelopes don't leak MCP / internal
 * endpoint vocabulary to bare HTTP probes that have no business reading it.
 *
 * Daniel-ratified default (decisions.md / lane-5 prompt):
 *  - in-app + bearer-carrying callers (Authorization: Bearer header, OR
 *    `Sec-Fetch-Site: same-origin` from the app's own browser fetches) →
 *    keep the MCP-savvy hint ("Mint a fresh test bearer via /api/mcp/oauth/
 *    mint-test-token or the MCP create_test_account tool.") — they have the
 *    context to act on it.
 *  - bare HTTP unauth probes (no Authorization header, no Sec-Fetch-* in-
 *    app metadata) → strip MCP references and surface a generic "Sign in
 *    to continue." instead.
 */

export type CallerContextKind = "in_app" | "bearer" | "bare"

/**
 * Inspect the request headers to decide whether the caller is on the
 * authenticated app surface (in-app browser fetch with Sec-Fetch-Site:
 * same-origin), already carrying a Bearer token, or a bare HTTP probe.
 */
export function classifyCallerContext(req: Request): CallerContextKind {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization")
    if (auth && /^bearer\s/i.test(auth)) return "bearer"
    const secFetchSite = req.headers.get("sec-fetch-site")
    const secFetchDest = req.headers.get("sec-fetch-dest")
    if (
        secFetchSite === "same-origin" ||
        secFetchDest === "document" ||
        secFetchDest === "iframe"
    ) {
        return "in_app"
    }
    return "bare"
}

/**
 * Pick an unauth hint string: bearer/in-app callers see `richHint`
 * (typically referencing MCP endpoints + tool vocab), bare HTTP unauth
 * sees `genericHint` (default "Sign in to continue.") so external scrapers
 * never learn the MCP surface from a 401 envelope.
 */
export function selectUnauthHint(
    req: Request,
    richHint: string,
    genericHint: string = "Sign in to continue.",
): string {
    const context = classifyCallerContext(req)
    return context === "bare" ? genericHint : richHint
}
