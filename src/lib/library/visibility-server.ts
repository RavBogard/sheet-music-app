import "server-only"
/**
 * Multi-tenant phase 5 — server helpers around visibility.ts: the owner
 * tenant's display name and the "you can use it but not change it" refusal.
 */
import type { Firestore } from "firebase-admin/firestore"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { parseOrgConfig } from "@/lib/org/config-schema"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgId } from "@/lib/org/types"
import { isOwnedBy, notOwnerMessage, ownerOf, visibleTo, type VisibilityRow } from "@/lib/library/visibility"

/** The tenant's name (orgs/{id}.name, else its code config, else the id). */
export async function tenantDisplayName(orgId: OrgId, db?: Firestore): Promise<string> {
    try {
        if (!db) initAdmin()
        const snap = await (db ?? getFirestore()).collection("orgs").doc(orgId).get()
        if (snap.exists) {
            const parsed = parseOrgConfig(snap.data())
            if (parsed.ok && parsed.config.name) return parsed.config.name
            const raw = snap.data()?.name
            if (typeof raw === "string" && raw) return raw
        }
    } catch {
        // fall through to the code config
    }
    return codeOrgConfig(orgId)?.name ?? orgId
}

/** A chart's display title for messages: name, else title, else the id. */
export function chartTitle(row: Record<string, unknown> | null | undefined, fallback: string): string {
    const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const t = pick(row?.displayName) ?? pick(row?.name) ?? pick(row?.title) ?? fallback
    return t.replace(/\.(pdf|xml|musicxml|mxl|png|jpe?g)$/i, "")
}

export type WriteAccess =
    | { kind: "owned" }
    | { kind: "not_owner"; ownerOrgId: OrgId; ownerName: string; message: string }
    | { kind: "not_visible" }

/**
 * Writes stay OWNS. A row the caller can see but does not own gets the clear
 * refusal; a row it cannot see stays "not found" (no existence leak).
 */
export async function writeAccess(
    row: (VisibilityRow & Record<string, unknown>) | null | undefined,
    callerOrg: OrgId,
    fileId: string,
    db?: Firestore,
): Promise<WriteAccess> {
    if (!row) return { kind: "not_visible" }
    if (isOwnedBy(row, callerOrg)) return { kind: "owned" }
    if (!visibleTo(row, callerOrg)) return { kind: "not_visible" }
    const owner = ownerOf(row)
    const ownerName = await tenantDisplayName(owner, db)
    return { kind: "not_owner", ownerOrgId: owner, ownerName, message: notOwnerMessage(chartTitle(row, fileId), ownerName) }
}
