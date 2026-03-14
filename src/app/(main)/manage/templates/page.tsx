"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TemplatesSection } from "@/components/admin/TemplatesSection"
import { UnauthorizedState } from "@/components/ui/unauthorized-state"

export default function TemplatesPage() {
    const { isBandLeader, loading: authLoading } = useAuth()
    const router = useRouter()

    if (authLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        )
    }

    if (!isBandLeader) {
        return (
            <UnauthorizedState 
                title="Leaders Only" 
                description="Only Band Leaders can manage global liturgical templates." 
            />
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" aria-label="Back to manage" onClick={() => router.push("/manage")} className="rounded-full hover:bg-accent">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-semibold">Template Editor</h1>
                </div>
                <TemplatesSection />
            </div>
        </div>
    )
}
