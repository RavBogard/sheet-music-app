"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert } from "lucide-react"
import AdminSections from "@/components/admin/AdminSections"
import { Button } from "@/components/ui/button"

export default function AdminPage() {
    const { isBandLeader, loading } = useAuth()
    const router = useRouter()

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
    )

    if (!isBandLeader) {
        // middleware should catch this, but just in case
        if (typeof window !== "undefined") {
            router.replace('/setlists')
        }
        return null
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6 text-violet-500" />
                            Admin Console
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Site administration, access management, and system limits
                        </p>
                    </div>
                </div>

                <div className="bg-card border border-border p-5 rounded-2xl">
                    <AdminSections />
                </div>
            </div>
        </div>
    )
}
