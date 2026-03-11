import { Footer } from "@/components/Footer"
import { AppNavigation } from "@/components/nav/AppNavigation"
import { LazyClientComponents } from "@/components/layout/LazyClientComponents"
import { PageTransition } from "@/components/layout/PageTransition"

export default function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <AppNavigation />
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
