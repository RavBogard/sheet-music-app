"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, AreaChart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BandPrepSection } from "@/components/admin/BandPrepSection"
import { UsageAnalyticsSection } from "@/components/admin/UsageAnalyticsSection"

export default function LeaderDashboardPage() {
    const { isBandLeader, loading } = useAuth()
    const router = useRouter()

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
    )

    if (!isBandLeader) {
        if (typeof window !== "undefined") {
            router.replace('/setlists')
        }
        return null
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <AreaChart className="w-6 h-6 text-violet-500" />
                            Leader Dashboard
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Insights and preparation metrics for your team
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 space-y-8">
                    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                        <BandPrepSection />
                    </div>

                    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                        <UsageAnalyticsSection />
                    </div>
                </div>
            </div>
        </div>
    )
}
