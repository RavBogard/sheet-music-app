import { getServerUser, getServerCongregationConfig } from "@/lib/server-auth"
import { getContextualGreeting } from "@/lib/greeting"
import DashboardClient from "./DashboardClient"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { headers } from "next/headers"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgBranding } from "@/lib/org/branding"

/**
 * Dashboard — Server Component wrapper.
 *
 * Computes the greeting and congregation name on the server so the
 * initial HTML includes real content instead of a blank white screen.
 * The client component hydrates and takes over for real-time updates.
 *
 * Before this change, users saw a white screen for 1-2 seconds while
 * JS downloaded, React booted, and Firebase Auth resolved. Now the
 * greeting + branding + skeleton render instantly in the HTML.
 */
export default async function DashboardPage() {
    // v11.2-05-01 (BUG-6): resolve the host org from the x-org-id proxy header
    // (same seam the (main) layout uses for the nav) so the dashboard hero brand
    // is host-correct — broslaz no longer renders the CRC "/logo.jpg" + "CRC MUSIC"
    // lockup. The per-org congregation doc is read with the host org too.
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
    const branding = getOrgBranding(orgId)

    // These run in parallel on the server — adds ~50ms to TTFB but
    // eliminates 1-2s of client-side blank screen.
    const [user, config] = await Promise.all([
        getServerUser().catch(() => null),
        getServerCongregationConfig(orgId).catch(() => null),
    ])

    // Brand name: prefer the authoritative host branding (matches the nav header);
    // fall back to the per-org congregation doc, then the default.
    const shortName = branding.shortName || (config?.shortName as string) || DEFAULT_SHORT_NAME
    const firstName = user?.displayName?.split(" ")[0] || null
    const greeting = getContextualGreeting(firstName, undefined, shortName)

    return (
        <DashboardClient
            serverGreeting={greeting}
            serverShortName={shortName}
            serverLogoUrl={branding.logoUrl}
            serverIsMember={user?.isMember || false}
            serverIsBandLeader={user?.isBandLeader || false}
            serverIsAdmin={user?.isAdmin || false}
            serverUid={user?.uid || null}
        />
    )
}
