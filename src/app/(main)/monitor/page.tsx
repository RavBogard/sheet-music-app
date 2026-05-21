import { getServerUser } from "@/lib/server-auth"
import { redirect } from "next/navigation"
import MonitorClient from "./MonitorClient"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { MonitorConfig } from "@/types/monitor"
import { hasMonitorPageAccess } from "@/lib/mcp/server-monitor"

export default async function MonitorPage() {
    const user = await getServerUser()

    if (!user) {
        redirect("/login")
    }

    // Only allow members, musicians, band leaders, admins, or pending users who are sound engineers
    // Actually, just blocking guests is the most critical to prevent unauthorized WebSockets.
    // We can also fetch the monitor config to strictly gate it on the server.
    
    // Access = admin OR sound engineer OR owns >= 1 assigned bus — the SAME
    // predicate as the client `useMonitorAccess` hook, via the shared
    // hasMonitorPageAccess helper, so the server gate cannot drift from it.
    let hasAccess = user.isAdmin || user.isSoundEngineer

    if (!hasAccess) {
        // busAssignments is keyed by bus index (not uid), so the has-a-bus check
        // value-iterates via getOwnedBuses inside hasMonitorPageAccess.
        initAdmin()
        const db = getFirestore()
        const docSnap = await db.collection("config").doc("monitor").get()
        const config = docSnap.exists ? (docSnap.data() as MonitorConfig) : null
        hasAccess = hasMonitorPageAccess(
            { isAdmin: user.isAdmin, isSoundEngineer: user.isSoundEngineer },
            config,
            user.uid,
        )
    }

    if (!hasAccess) {
        // Render a server-side "Unauthorized" message instead of loading the client app
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 p-6 text-center">
                <h2 className="text-xl font-bold">Monitor Access Denied</h2>
                <p className="text-muted-foreground">
                    You don't have monitor access. Ask a sound engineer or admin to assign you a bus.
                </p>
            </div>
        )
    }

    return <MonitorClient />
}
