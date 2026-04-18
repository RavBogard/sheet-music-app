import type { Setlist } from "@/lib/setlist-firebase"

export interface SetlistAuthContext {
    uid: string | null | undefined
    isBandLeader: boolean
    isAdmin: boolean
}

/**
 * Single source of truth for "can this user edit this setlist?".
 *
 * - Admins and band leaders can edit any setlist.
 * - Owners can edit their own setlists.
 * - Legacy docs without ownerId (v2.5 P8.1 decision) are treated as accessible —
 *   matches existing SetlistDashboard behaviour and read-rule semantics.
 */
export function canEditSetlist(
    setlist: Pick<Setlist, "ownerId"> | null | undefined,
    auth: SetlistAuthContext
): boolean {
    if (!setlist) return false
    if (auth.isAdmin || auth.isBandLeader) return true
    if (!setlist.ownerId) return true
    return !!auth.uid && auth.uid === setlist.ownerId
}
