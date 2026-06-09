import { Footer } from "@/components/Footer"
import { AppNavigation } from "@/components/nav/AppNavigation"
import { AuthedQueryProvider } from "@/components/authed-query-provider"
import { LazyClientComponents } from "@/components/layout/LazyClientComponents"
import { PageTransition } from "@/components/layout/PageTransition"
import { getServerUser } from "@/lib/server-auth"
import { headers } from "next/headers"
import { coerceOrgId } from "@/lib/org/registry"
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
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
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
                    serverOrgShortName={branding.shortName}
                    serverLogoUrl={branding.logoUrl}
                />
                {/*
                    Padding Handling:
                    - Mobile: pt-16 to clear top mobile header + pb-24 to clear bottom tab bar
                    - Desktop: pt-20 to clear top sticky header
                */}
                <main id="main-content" className="flex-1 pt-16 pb-24 md:pt-20 md:pb-0">
                    <PageTransition>
                        {children}
                    </PageTransition>
                </main>
                <div className="hidden md:block">
                    <Footer />
                </div>
                <LazyClientComponents />
            </div>
        </AuthedQueryProvider>
    )
}
