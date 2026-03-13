import { Footer } from "@/components/Footer"
import { AppNavigation } from "@/components/nav/AppNavigation"
import { LazyClientComponents } from "@/components/layout/LazyClientComponents"
import { PageTransition } from "@/components/layout/PageTransition"
import { getServerUser } from "@/lib/server-auth"

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getServerUser().catch(() => null)

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <AppNavigation
                serverIsAdmin={user?.isAdmin || false}
                serverIsSoundEngineer={user?.isSoundEngineer || false}
                serverIsMember={user?.isMember || false}
                serverIsBandLeader={user?.isBandLeader || false}
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
    )
}
