"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert, Radio, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { AccessAuditLog } from "@/components/admin/people/AccessAuditLog"
import { BandPrepSection } from "@/components/admin/BandPrepSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import Link from "next/link"

export default function ManagePage() {
    const { isAdmin, isBandLeader, loading } = useAuth()
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
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6 text-brand" />
                            Manage
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            User management and library overview
                        </p>
                    </div>
                </div>

                {/* Section 1: People */}
                <div className="space-y-8">
                    <SectionErrorBoundary label="People">
                        <PeopleSection />
                    </SectionErrorBoundary>

                    <SectionErrorBoundary label="Band Prep">
                        <BandPrepSection />
                    </SectionErrorBoundary>

                    {isAdmin && (
                        <SectionErrorBoundary label="Access Audit">
                            <AccessAuditLog />
                        </SectionErrorBoundary>
                    )}
                </div>

                <hr className="border-border" />

                {/* Section 2: Library */}
                <div className="space-y-8">
                    <SectionErrorBoundary label="Library">
                        <LibraryDataSection />
                    </SectionErrorBoundary>
                </div>

                {/* Footer links */}
                <div className="pt-4 border-t border-border space-y-2">
                    <Link
                        href="/manage/templates"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Template Editor
                    </Link>
                    <Link
                        href="/settings/sound"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Radio className="w-4 h-4" />
                        Sound System Settings
                    </Link>
                </div>
            </div>
        </div>
    )
}
