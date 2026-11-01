import { Footer } from "@/components/Footer"
import { ViewAsBanner } from "@/components/platform/ViewAsBanner"
import { AppNavigation } from "@/components/nav/AppNavigation"
import { AuthedQueryProvider } from "@/components/authed-query-provider"
import { LazyClientComponents } from "@/components/layout/LazyClientComponents"
import { PageTransition } from "@/components/layout/PageTransition"
import { getServerUser } from "@/lib/server-auth"
import { requestOrg } from "@/lib/org/request-org"
import { getOrgBranding } from "@/lib/org/branding"

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getServerUser().catch(() => null)

    // v11.1-01: resolve the host org's brand server-side (same x-org-id seam as
    // the root layout, src/app/layout.tsx) so the authed nav wordmark + logo are
    // host-correct on first paint — no "CRC Music"/`/logo.jpg` flash on broslaz.
    const orgId = (await requestOrg()).orgId
    const branding = getOrgBranding(orgId)

    return (
        <AuthedQueryProvider>
            <div className="flex flex-col min-h-screen bg-background text-foreground">
                <AppNavigation
                    serverIsAdmin={user?.isAdmin || false}
                    serverIsSoundEngineer={user?.isSoundEngineer || false}
                    serverIsMember={user?.isMember || false}
                    serverIsBandLeader={user?.isBandLeader || false}
                    serverIsAuthed={!!user}
                    serverIsPlatformOwner={user?.po || false}
                    serverOrgShortName={branding.shortName}
                    serverLogoUrl={branding.logoUrl}
                    serverWordmarkUrl={branding.wordmarkUrl}
                />
                {/*
                    Padding: pt-14 clears the top bar. The footer shows on every
                    non-Perform page at every width (consistency pass); below lg
                    its wrapper pads by --tabbar-h so the bottom tab bar never
                    covers it.
                */}
                <ViewAsBanner />
                <main id="main-content" className="flex-1 pt-14">
                    <PageTransition>
                        {children}
                    </PageTransition>
                </main>
                <div className="bg-card" style={{ paddingBottom: "var(--tabbar-h)" }}>
                    <Footer />
                </div>
                <LazyClientComponents />
            </div>
        </AuthedQueryProvider>
    )
}
