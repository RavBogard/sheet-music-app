import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * v11-02-01: the single seam for resolving an MCP caller's tenant inside a tool
 * handler.
 *
 * The MCP route (src/app/api/mcp/route.ts) stashes the verified bearer's
 * resolved `orgId` on `AuthInfo.extra` alongside `uid`. Read/write tools call
 * `orgFrom(extra)` to learn which tenant to filter reads by (v11-02-02) and
 * stamp writes with (v11-02-03). In v11-02-01 this seam exists but no tool
 * consumes it yet — the plan is behavior-neutral (every caller resolves crc).
 */

/** Minimal structural type — decoupled from the SDK's internal extra shape. */
export type AuthExtra = { authInfo?: { extra?: Record<string, unknown> } }

/**
 * Resolve the caller's tenant from the AuthInfo extras. Returns the bearer's
 * stamped orgId, defaulting to DEFAULT_ORG_ID ("crc") when the field is
 * absent/empty — the same backward-compat contract verifyBearer uses, so every
 * existing CRC bearer resolves crc.
 *
 * Throws `Unauthenticated MCP request` when there is no `uid` in the extras —
 * mirroring `uidFrom`'s contract, so a handler that resolves org on a malformed
 * (unauthenticated) context fails identically to one that resolves uid.
 */
export function orgFrom(extra: AuthExtra): OrgId {
    const e = extra.authInfo?.extra
    const uid = e?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    const orgId = e?.orgId
    return typeof orgId === "string" && orgId ? orgId : DEFAULT_ORG_ID
}

/**
 * v11-02-02: normalize a document's `orgId` field for tenant comparison. An
 * absent/empty orgId is treated as DEFAULT_ORG_ID ("crc") — defensive, though
 * v11-01-03 stamped every existing doc. Use as `rowOrg(doc.orgId) === callerOrg`
 * in MCP read/write scoping.
 */
export function rowOrg(orgId: unknown): OrgId {
    return typeof orgId === "string" && orgId ? orgId : DEFAULT_ORG_ID
}

/**
 * v11-02-03: stamp a chart's tenant onto BOTH catalog surfaces
 * (`library_index/{fileId}` + `songs/{fileId}`) after an MCP create. Existence-
 * gated — only writes the doc(s) that already exist, never creates a phantom row
 * (mirrors applySongMetadata's discipline). Used by the chart-create MCP tools
 * (upload_chart / import_chart_from_drive / save_scraped_chart) to tag the new
 * chart with the CALLER's org, so the v11-02-02 read tools isolate it.
 *
 * Org-stamping for MCP is intentionally confined to the MCP wrappers (not the
 * shared processChartUpload pipeline, which feeds the HTTP route + Drive-sync
 * cron — those stay default-crc). Behavior-neutral for crc (stamps "crc" where
 * reads already infer crc via rowOrg).
 */
export async function stampOrg(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    org: OrgId,
): Promise<void> {
    const [indexSnap, songSnap] = await Promise.all([
        db.collection("library_index").doc(fileId).get(),
        db.collection("songs").doc(fileId).get(),
    ])
    const batch = db.batch()
    let any = false
    if (indexSnap.exists) {
        batch.update(db.collection("library_index").doc(fileId), { orgId: org })
        any = true
    }
    if (songSnap.exists) {
        batch.update(db.collection("songs").doc(fileId), { orgId: org })
        any = true
    }
    if (any) await batch.commit()
}
