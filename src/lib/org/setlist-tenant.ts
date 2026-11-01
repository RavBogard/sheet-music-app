import type { NextResponse } from "next/server"
import { httpError } from "@/lib/http/error-envelope"
import { rowOrg } from "@/lib/org/membership"
import type { OrgId } from "@/lib/org/types"

/**
 * BET-5 fix round: a route that loads a setlist by id and then sends, prints
 * or writes must act only on a setlist of the HOST tenant (x-org-id, which the
 * caller's roles were read in). Another tenant's setlist answers exactly as a
 * missing one, before anything is sent or written.
 *
 * Returns the 404 response to send, or null when the setlist is the host's.
 */
export function crossTenantSetlist(
    setlist: Record<string, unknown> | undefined | null,
    hostOrg: OrgId,
    setlistId: string,
): NextResponse | null {
    if (setlist && rowOrg(setlist.orgId) === hostOrg) return null
    return httpError(404, "setlist_not_found", "Setlist not found.", { setlistId }, "Check the setlist id on this site.")
}
