import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"
import { getServerUser, getPersonalSetlists, getAllPublicSetlists } from "@/lib/server-auth"

export default async function SetlistsPage() {
    // 1. Fetch user to know if we need personal setlists
    const user = await getServerUser()

    // 2. Fetch data server-side
    // We can fetch concurrently for speed
    const [publicSetlists, personalSetlists] = await Promise.all([
        getAllPublicSetlists(),
        user ? getPersonalSetlists(user.uid) : Promise.resolve([])
    ])

    return (
        <SetlistDashboard
            initialPersonalSetlists={personalSetlists as any}
            initialPublicSetlists={publicSetlists as any}
        />
    )
}
