import { AppNavigation } from "@/components/nav/AppNavigation"
import { headers } from "next/headers"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgBranding } from "@/lib/org/branding"

/**
 * Setlist perform routes get the main app navigation bar,
 * unlike chart/PDF perform routes which stay minimal for stage use.
 *
 * v11.5-01 (H4): resolve the host org's brand server-side — the same x-org-id
 * seam as src/app/(main)/layout.tsx — and thread it into AppNavigation so the
 * nav wordmark + logo are host-correct on first paint (flash-free). Previously
 * this layout rendered <AppNavigation/> with NO props, so DesktopHeader +
 * MobileHeader fell back to the congregation-store default ("CRC Music" +
 * `/logo.jpg`) — a CRC branding leak on broslaz /perform/setlist/[id] and its
 * track/[trackId] sub-route. The v11.1-01 (main)-layout fix never reached this
 * route group: /perform/* lives outside the (main) group. Branding-only —
 * auth/role rendering is unchanged (still resolved on the client path, as before).
 */
export default async function SetlistPerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
    const branding = getOrgBranding(orgId)

    return (
        <>
            <AppNavigation
                serverOrgShortName={branding.shortName}
                serverLogoUrl={branding.logoUrl}
                serverWordmarkUrl={branding.wordmarkUrl}
            />
            {children}
        </>
    )
}
