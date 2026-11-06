import { AuthedQueryProvider } from "@/components/authed-query-provider"
import { AppNavigation } from "@/components/nav/AppNavigation"
import { getOrgBranding } from "@/lib/org/branding"
import { requestOrg } from "@/lib/org/request-org"

/**
 * Rehearse sits in the same app shell as the Perform setlist page: the top
 * bar and, below 1024px, the bottom tab bar. The host's brand is resolved on
 * the server, as /perform/setlist does, so Brothers Lazaroff never paints the
 * CRC wordmark. The nav reads queries, so it needs the query provider the
 * (main) and /perform layouts give it. The chart page draws full screen over it.
 */
export default async function RehearseLayout({ children }: { children: React.ReactNode }) {
    const branding = getOrgBranding((await requestOrg()).orgId)
    return (
        <AuthedQueryProvider>
            <AppNavigation
                serverOrgShortName={branding.shortName}
                serverLogoUrl={branding.logoUrl}
                serverWordmarkUrl={branding.wordmarkUrl}
            />
            {children}
        </AuthedQueryProvider>
    )
}
