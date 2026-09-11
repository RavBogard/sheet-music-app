import crypto from "node:crypto"

/**
 * MCP Apps — the stable origin a host serves this server's app iframes from.
 *
 * Claude renders an MCP App inside a sandboxed iframe on a per-connector
 * subdomain of `claudemcpcontent.com`. The subdomain is the first 32 hex
 * characters of `sha256(<connector url>)`, which makes it stable for a given
 * deployment: an external API the app talks to directly (for us, the Google
 * Cloud Storage signed-PUT host) can put that one origin on a CORS allow-list
 * instead of `*`.
 *
 * The formula belongs to the host, not to us — `mcp-apps-domain.test.ts` pins
 * it against an independent recomputation so a refactor here shows up as a
 * failing test rather than as a browser CORS rejection in production.
 *
 * Pure + dependency-free on purpose (only `node:crypto`), so it can be unit
 * tested without touching Firebase or the MCP server.
 */
export function mcpAppsStableDomain(connectorUrl: string): string {
    const hash = crypto
        .createHash("sha256")
        .update(connectorUrl)
        .digest("hex")
        .slice(0, 32)
    return `${hash}.claudemcpcontent.com`
}
