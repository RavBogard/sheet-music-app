import { PageContainer, PageHeader } from "@/components/layout/Page"
import { getServerUser } from "@/lib/server-auth"
import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import MonitorClient from "./MonitorClient"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { MonitorConfig } from "@/types/monitor"
import { hasMonitorPageAccess } from "@/lib/mcp/server-monitor"

export default async function MonitorPage() {
    const user = await getServerUser()
    const t = await getT()

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
            <PageContainer className="space-y-4">
                <PageHeader title={t("nav.monitor")} />
                <div className="rounded-lg border border-rule bg-card p-3 sm:p-4">
                    <h2 className="text-sm font-bold text-foreground">{t("monitor.accessDeniedTitle")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("monitor.accessDeniedBody")}</p>
                </div>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <h1 className="sr-only">{t("nav.monitor")}</h1>
            <MonitorClient />
        </PageContainer>
    )
}
