import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { getServerUser } from "@/lib/server-auth"
import { getSetlistsPage } from "@/lib/server-setlists"

export default async function SetlistsPage() {
    const [user, page] = await Promise.all([
        getServerUser(),
        getSetlistsPage({ pageSize: 50 }),
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
