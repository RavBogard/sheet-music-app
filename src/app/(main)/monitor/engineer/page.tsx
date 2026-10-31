import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-auth"
import { getT } from "@/i18n/server"
import { EngineerConsole } from "@/components/monitor/EngineerConsole"

/**
 * BET-4: the engineer console. The monitor layout already 404s every tenant
 * without the mixer (everyone but CRC); this page adds the role gate: the
 * sound engineer and admins only.
 */
export default async function EngineerConsolePage() {
    const user = await getServerUser()
    if (!user) redirect("/login")
    const t = await getT()
    if (!user.isAdmin && !user.isSoundEngineer) {
        return (
            <div className="flex items-center justify-center h-[60vh] p-6 text-center text-muted-foreground">
                <p data-testid="engineer-denied">{t("monitor.engineerDenied")}</p>
            </div>
        )
    }
    return <EngineerConsole />
}
