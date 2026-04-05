import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { getServerUser } from "@/lib/server-auth"
import { getAllSetlists } from "@/lib/server-setlists"

export default async function SetlistsPage() {
    const [user, allSetlists] = await Promise.all([
        getServerUser(),
        getAllSetlists(),
    ])

    return (
        <SetlistDashboard
            initialSetlists={allSetlists as any}
            serverIsBandLeader={user?.isBandLeader || false}
            serverIsMember={user?.isMember || false}
            serverIsAdmin={user?.isAdmin || false}
            serverUid={user?.uid || null}
        />
    )
}
