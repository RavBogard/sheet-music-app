import "server-only"
/**
 * Multi-tenant phase 5 — the per-tenant "openable by link" setting for chart
 * bytes (`/api/library/file/[id]`, `/api/drive/file/[fileId]`).
 *
 * `library.openByLink` (tenant config, default TRUE) keeps today's behaviour:
 * the routes serve any existing chart to a trusted caller (signed in, in-app
 * browser fetch, or an MCP bearer), whichever tenant owns it — setlists hold
 * charts by fileId and a texted link must open.
 *
 * A chart opens by link only when BOTH the host tenant (the address the
 * request came to) and the chart's OWNER allow it: the owner decides about its
 * own charts at every address. Otherwise the
 * bytes need a signed-in member (not pending) of the host tenant, and the chart
 * must be visible to the host tenant (visibility.ts: owner, or shared with it).
 * Signed in means a Firebase ID token, the `__session` cookie, or an MCP bearer
 * minted for the host tenant. The response is then `private` so no CDN copy is
 * served to anyone else.
 */
import type { NextRequest } from "next/server"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import type { AuthResult } from "@/lib/api-auth"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { coerceOrgId } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { getTenantAccess, hasTenantRole } from "@/lib/org/access"
import { verifySessionCookieRequest } from "@/lib/drive-file-auth"
import { verifyBearer } from "@/lib/mcp/auth"
import { ownerOf, visibleTo, type VisibilityRow } from "@/lib/library/visibility"
import { logger } from "@/lib/logger"

export type LinkGate =
    | { mode: "open" }
    | { mode: "member"; orgId: OrgId; uid: string }
    | { mode: "refused"; status: 401 | 403 | 404; orgId: OrgId; reason: string }

/** A tenant's setting (host or chart owner); an unreadable config keeps today's behaviour (open). */
export async function hostOpensByLink(hostOrg: OrgId): Promise<boolean> {
    try {
        const c = await getOrgConfig(hostOrg)
        return c?.library?.openByLink !== false
    } catch (e) {
        logger.warn(`[open-by-link] config read for ${hostOrg} failed; serving as open`, e)
        return true
    }
}

/** The chart row the bytes belong to (library_index, or digitized_charts for `db-*`). */
async function chartRow(fileId: string): Promise<VisibilityRow | null> {
    if (!initAdmin()) return null
    const db = getFirestore()
    const ref = fileId.startsWith("db-")
        ? db.collection("digitized_charts").doc(fileId.slice(3))
        : db.collection("library_index").doc(fileId)
    const snap = await ref.get()
    return snap.exists ? (snap.data() as VisibilityRow) : null
}

async function memberUid(req: NextRequest, auth: AuthResult | undefined, hostOrg: OrgId): Promise<string | null> {
    // A Firebase ID token: api-auth already read the caller's access in the host tenant.
    if (auth?.uid) {
        if (auth.orgId === hostOrg && auth.access && hasTenantRole(auth.access, "member")) return auth.uid
        const a = await getTenantAccess(auth.uid, hostOrg).catch(() => null)
        return a && hasTenantRole(a, "member") ? auth.uid : null
    }
    const sessionUid = await verifySessionCookieRequest(req)
    if (sessionUid) {
        const a = await getTenantAccess(sessionUid, hostOrg).catch(() => null)
        return a && hasTenantRole(a, "member") ? sessionUid : null
    }
    if (req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) {
        const b = await verifyBearer(req)
        if ("uid" in b && b.orgId === hostOrg) return b.uid
    }
    return null
}

/**
 * Decide for one chart request. `open` = today's path, untouched. Called with
 * the route's optional auth (requireAuth: false).
 */
export async function chartLinkGate(req: NextRequest, auth: AuthResult | undefined, fileId: string): Promise<LinkGate> {
    const hostOrg = coerceOrgId(req.headers.get("x-org-id"))
    let row: VisibilityRow | null = null
    let rowRead = false
    const readRow = async () => {
        if (rowRead) return row
        rowRead = true
        try {
            row = await chartRow(fileId)
        } catch (e) {
            logger.warn(`[open-by-link] chart row read for ${fileId} failed`, e)
        }
        return row
    }
    if (await hostOpensByLink(hostOrg)) {
        // No row: the chart has no tenant record; it counts as crc's (the missing-orgId rule).
        const owner = ownerOf((await readRow()) ?? {})
        if (owner === hostOrg || (await hostOpensByLink(owner))) return { mode: "open" }
    }
    const uid = await memberUid(req, auth, hostOrg)
    if (!uid) {
        return {
            mode: "refused",
            status: 401,
            orgId: hostOrg,
            reason: "This site's charts open only for its signed-in members. Sign in at this address to open the chart.",
        }
    }
    if (!visibleTo((await readRow()) ?? {}, hostOrg)) {
        return { mode: "refused", status: 404, orgId: hostOrg, reason: "No chart found for the given fileId." }
    }
    return { mode: "member", orgId: hostOrg, uid }
}

/** Cache-Control for a served chart: CDN-cacheable when open, browser-only otherwise. */
export function chartCacheControl(gate: LinkGate): string {
    return gate.mode === "member" ? "private, max-age=86400" : "public, max-age=86400, s-maxage=604800"
}
