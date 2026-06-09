import { headers } from "next/headers"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { getServerUser } from "@/lib/server-auth"
import { getSetlistsPage } from "@/lib/server-setlists"
import { coerceOrgId } from "@/lib/org/registry"

export default async function SetlistsPage() {
    // v11-04-03: scope the authed dashboard SSR prefetch to the host's tenant
    // (Edge-resolved x-org-id → coerceOrgId, same seam as /perform + the root
    // layout). A signed-in BL user sees only BL setlists; CRC unchanged.
    const org = coerceOrgId((await headers()).get("x-org-id"))
    const [user, page] = await Promise.all([
        getServerUser(),
        getSetlistsPage({ pageSize: 50, org }),
    ])

    return (
        <SetlistDashboard
            initialSetlists={page.items as any}
            initialNextCursor={page.nextCursor}
            serverIsBandLeader={user?.isBandLeader || false}
            serverIsMember={user?.isMember || false}
            serverIsAdmin={user?.isAdmin || false}
            serverUid={user?.uid || null}
        />
    )
}
