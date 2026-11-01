import { rowOrg } from "@/lib/org/membership"
import type { OrgId } from "@/lib/org/types"

/**
 * BET-5 fix round: a route that loads a setlist (or an assignment) by id and
 * then sends, prints or writes must act only on a document of the HOST tenant
 * (x-org-id, which the caller's roles were read in). Each route answers a
 * document of another tenant with its OWN not-found response, the same one a
 * missing document gets, so the two cannot be told apart.
 *
 * True only when the document exists and belongs to `hostOrg`.
 */
export function isHostTenantDoc(doc: Record<string, unknown> | undefined | null, hostOrg: OrgId): boolean {
    return !!doc && rowOrg(doc.orgId) === hostOrg
}
