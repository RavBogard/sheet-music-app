import { AppNavigation } from "@/components/nav/AppNavigation"
import { getOrgBranding } from "@/lib/org/branding"
import { requestOrg } from "@/lib/org/request-org"

/**
 * Rehearse sits in the same app shell as the Perform setlist page: the top
 * bar and, below 1024px, the bottom tab bar. The host's brand is resolved on
 * the server, as /perform/setlist does, so Brothers Lazaroff never paints the
 * CRC wordmark. The chart page draws full screen over it.
 */
export default async function RehearseLayout({ children }: { children: React.ReactNode }) {
    const branding = getOrgBranding((await requestOrg()).orgId)
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
