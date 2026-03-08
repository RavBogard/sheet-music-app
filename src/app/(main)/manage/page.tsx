"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert, Radio, FileText, Users, Music, Database, History } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
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
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-2">
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

                {/* People Management */}
                <SectionErrorBoundary label="People">
                    <CollapsibleSection
                        icon={<Users className="w-5 h-5 text-brand" />}
                        title="People Management"
                        defaultOpen={true}
                    >
                        <PeopleSection />
                    </CollapsibleSection>
                </SectionErrorBoundary>

                {/* Band Prep */}
                <SectionErrorBoundary label="Band Prep">
                    <CollapsibleSection
                        icon={<Music className="w-5 h-5 text-brand" />}
                        title="Band Preparation"
                    >
                        <BandPrepSection />
                    </CollapsibleSection>
                </SectionErrorBoundary>

                {/* Access Audit */}
                {isAdmin && (
                    <SectionErrorBoundary label="Access Audit">
                        <CollapsibleSection
                            icon={<History className="w-5 h-5 text-muted-foreground" />}
                            title="Access Audit Log"
                        >
                            <AccessAuditLog />
                        </CollapsibleSection>
                    </SectionErrorBoundary>
                )}

                <hr className="border-border" />

                {/* Library */}
                <SectionErrorBoundary label="Library">
                    <CollapsibleSection
                        icon={<Database className="w-5 h-5 text-brand" />}
                        title="Library"
                        defaultOpen={true}
                    >
                        <LibraryDataSection />
                    </CollapsibleSection>
                </SectionErrorBoundary>

                {/* Footer links */}
                <div className="pt-4 border-t border-border space-y-1">
                    <Link
                        href="/manage/templates"
                        className={cn(
                            "flex items-center gap-3 text-sm text-muted-foreground",
                            "hover:text-foreground hover:bg-muted/50 transition-colors",
                            "rounded-lg px-3 min-h-11"
                        )}
                    >
                        <FileText className="w-5 h-5" />
                        Template Editor
                    </Link>
                    <Link
                        href="/settings/sound"
                        className={cn(
                            "flex items-center gap-3 text-sm text-muted-foreground",
                            "hover:text-foreground hover:bg-muted/50 transition-colors",
                            "rounded-lg px-3 min-h-11"
                        )}
                    >
                        <Radio className="w-5 h-5" />
                        Sound System Settings
                    </Link>
                </div>
            </div>
        </div>
    )
}
