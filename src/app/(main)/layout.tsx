import { Footer } from "@/components/Footer"
import { ProtectedLayout } from "@/components/auth/ProtectedLayout"

export default function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ProtectedLayout>
            <div className="flex flex-col min-h-screen">
                <div className="flex-1">
                    {children}
                </div>
                <Footer />
            </div>
        </ProtectedLayout>
    )
}
