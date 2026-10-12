import { notFound } from "next/navigation"
import { requestOrg } from "@/lib/org/request-org"
import { hasFeature } from "@/lib/org/features"

/**
 * Multi-tenant phase 6: /monitor and /monitor/admin are the mixer's. The mixer
 * is a tenant flag and CRC-only whatever the flag says (its `config/monitor`
 * and `monitor-live/*` documents and the one bridge are CRC's), so every other
 * tenant gets a 404 here.
 */
export default async function MonitorLayout({ children }: { children: React.ReactNode }) {
    const { orgId } = await requestOrg()
    if (!(await hasFeature(orgId, "mixer"))) notFound()
    return <>{children}</>
}
