"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { LiveServiceSection } from "@/components/admin/LiveServiceSection"

export default function SoundSettingsPage() {
    const { isBandLeader, loading } = useAuth()
    const router = useRouter()

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
    )

    if (!isBandLeader) {
        router.replace('/setlists')
        return null
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/manage')} className="rounded-full hover:bg-accent">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <Radio className="w-6 h-6 text-brand" />
                            Sound System Settings
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Monitor bridge configuration and live service overview
                        </p>
                    </div>
                </div>

                <div className="space-y-12">
                    <SectionErrorBoundary label="Live Production">
                        <LiveServiceSection />
                    </SectionErrorBoundary>

                    <hr className="border-border" />

                    <SectionErrorBoundary label="Sound System">
                        <SoundSystemSection />
                    </SectionErrorBoundary>
                </div>
            </div>
        </div>
    )
}
