import { Footer } from "@/components/Footer"
import { ProtectedLayout } from "@/components/auth/ProtectedLayout"
import { AppNavigation } from "@/components/nav/AppNavigation"

export default function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ProtectedLayout>
            <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
                <AppNavigation />
                {/* 
                    Padding Handling:
                    - Mobile: pb-24 to clear bottom tab bar
                    - Desktop: pt-20 to clear top sticky header
                */}
                <main className="flex-1 pb-24 md:pb-0 md:pt-20">
                    {children}
                </main>
                <div className="hidden md:block">
                    <Footer />
                </div>
            </div>
        </ProtectedLayout>
    )
}
