"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, ShieldAlert, Users, Database, Radio, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { PeopleSection } from "@/components/admin/PeopleSection"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"
import { AccessAuditLog } from "@/components/admin/people/AccessAuditLog"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { DuplicateScanner } from "@/components/library/DuplicateScanner"
import { PDFHealthScanner } from "@/components/library/PDFHealthScanner"
import { useLibrary } from "@/hooks/use-library"
import { useLibraryStore } from "@/lib/library-store"
import { useFeature } from "@/lib/org/use-feature"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"

export default function ManageClient({ serverIsAdmin }: { serverIsAdmin: boolean }) {
    const router = useRouter()
    const t = useT()
    const { refetch } = useLibrary()
    const allFiles = useLibraryStore(s => s.allFiles)
    // Multi-tenant phase 6: the Sound tab is the mixer's (crc only).
    const mixerOn = useFeature("mixer")

    const chartFiles = allFiles.filter(f =>
        f.mimeType?.includes('pdf') ||
        f.mimeType?.includes('xml') ||
        f.name?.toLowerCase().endsWith('.pdf')
    )

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-2">
                    <Button variant="ghost" size="icon" aria-label={t("manage.back")} onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <DirectionalIcon icon={ArrowLeft} className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6 text-brand" />
                            {t("manage.title")}
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            {t("manage.subtitle")}
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="people">
                    <TabsList className="w-full">
                        <TabsTrigger value="people" className="min-h-11 gap-1.5">
                            <Users className="w-4 h-4" />
                            {t("manage.tabPeople")}
                        </TabsTrigger>
                        <TabsTrigger value="library" className="min-h-11 gap-1.5">
                            <Database className="w-4 h-4" />
                            {t("manage.tabLibrary")}
                        </TabsTrigger>
                        {mixerOn && (
                            <TabsTrigger value="sound" className="min-h-11 gap-1.5">
                                <Radio className="w-4 h-4" />
                                {t("manage.tabSound")}
                            </TabsTrigger>
                        )}
                        {serverIsAdmin && (
                            <TabsTrigger value="audit" className="min-h-11 gap-1.5">
                                <History className="w-4 h-4" />
                                {t("manage.tabAudit")}
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="people" className="mt-6">
                        <SectionErrorBoundary label={t("manage.sectionPeople")}>
                            <PeopleSection />
                        </SectionErrorBoundary>
                    </TabsContent>

                    <TabsContent value="library" className="mt-6 space-y-6">
                        <SectionErrorBoundary label={t("manage.sectionLibrary")}>
                            <LibraryDataSection />
                        </SectionErrorBoundary>

                        <div className="border border-border rounded-xl p-4 space-y-3">
                            <h3 className="text-sm font-medium text-foreground">{t("manage.libraryToolsTitle")}</h3>
                            <div className="flex flex-wrap gap-3">
                                <DuplicateScanner
                                    files={chartFiles}
                                    onArchiveComplete={() => refetch()}
                                />
                                <PDFHealthScanner
                                    files={allFiles}
                                    onArchiveComplete={() => refetch()}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t("manage.libraryToolsHint")}
                            </p>
                        </div>
                    </TabsContent>

                    {mixerOn && (
                        <TabsContent value="sound" className="mt-6 space-y-8">
                            <SectionErrorBoundary label={t("manage.sectionSound")}>
                                <SoundSystemSection />
                            </SectionErrorBoundary>
                        </TabsContent>
                    )}

                    {serverIsAdmin && (
                        <TabsContent value="audit" className="mt-6">
                            <SectionErrorBoundary label={t("manage.sectionAudit")}>
                                <AccessAuditLog />
                            </SectionErrorBoundary>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    )
}
