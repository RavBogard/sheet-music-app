"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert, Users, Database, FileText, Radio, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import { AccessAuditLog } from "@/components/admin/people/AccessAuditLog"
import { TemplatesSection } from "@/components/admin/TemplatesSection"
import { LiveServiceSection } from "@/components/admin/LiveServiceSection"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"

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
            <div className="max-w-5xl mx-auto space-y-6">
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
                            Band management, library, templates, and sound system
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

                {/* Templates */}
                <SectionErrorBoundary label="Templates">
                    <CollapsibleSection
                        icon={<FileText className="w-5 h-5 text-brand" />}
                        title="Service Templates"
                    >
                        <TemplatesSection />
                    </CollapsibleSection>
                </SectionErrorBoundary>

                <hr className="border-border" />

                {/* Sound System */}
                <SectionErrorBoundary label="Sound System">
                    <CollapsibleSection
                        icon={<Radio className="w-5 h-5 text-brand" />}
                        title="Sound System"
                    >
                        <div className="space-y-8">
                            <LiveServiceSection />
                            <SoundSystemSection />
                        </div>
                    </CollapsibleSection>
                </SectionErrorBoundary>

                {/* Access Audit Log — last */}
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
            </div>
        </div>
    )
}
