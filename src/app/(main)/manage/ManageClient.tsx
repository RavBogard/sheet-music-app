"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { ArrowLeft, Users, Database, Radio, History } from "lucide-react"
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

export default function ManageClient({
    serverIsAdmin,
    adminOnlyNotice = false,
}: {
    serverIsAdmin: boolean
    adminOnlyNotice?: boolean
}) {
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
        <div className="min-h-screen bg-background text-foreground px-4 sm:px-6 pt-5 sm:pt-6 pb-24">
            <div className="max-w-5xl mx-auto space-y-5">
                {/* Head row (web refresh, blend E): the title large, the
                    subtitle as its status line. */}
                <div className="flex items-start gap-2 sm:gap-3">
                    <Button variant="ghost" size="icon" aria-label={t("manage.back")} onClick={() => router.back()} className="h-11 w-11 rounded-md hover:bg-accent md:hidden shrink-0">
                        <DirectionalIcon icon={ArrowLeft} className="w-5 h-5" />
                    </Button>
                    <div className="min-w-0 pt-1 md:pt-0">
                        <h1 className="text-[1.35rem] sm:text-[1.6rem] font-extrabold leading-tight tracking-[-0.015em]">
                            {t("manage.title")}
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium mt-0.5">
                            {t("manage.subtitle")}
                        </p>
                    </div>
                </div>

                {adminOnlyNotice && (
                    <p role="status" className="rounded-md border border-rule bg-accent px-4 py-3 text-sm font-medium">
                        {t("manage.adminOnlyNotice")}
                    </p>
                )}

                <Tabs defaultValue="people">
                    <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b border-rule pb-[5px] h-auto">
                        <TabsTrigger value="people" className="min-h-11 flex-none gap-1.5 px-3 sm:px-4 text-[15px] font-semibold data-[state=active]:text-foreground after:bg-brand">
                            <Users className="w-4 h-4" />
                            {t("manage.tabPeople")}
                        </TabsTrigger>
                        <TabsTrigger value="library" className="min-h-11 flex-none gap-1.5 px-3 sm:px-4 text-[15px] font-semibold data-[state=active]:text-foreground after:bg-brand">
                            <Database className="w-4 h-4" />
                            {t("manage.tabLibrary")}
                        </TabsTrigger>
                        {mixerOn && (
                            <TabsTrigger value="sound" className="min-h-11 flex-none gap-1.5 px-3 sm:px-4 text-[15px] font-semibold data-[state=active]:text-foreground after:bg-brand">
                                <Radio className="w-4 h-4" />
                                {t("manage.tabSound")}
                            </TabsTrigger>
                        )}
                        {serverIsAdmin && (
                            <TabsTrigger value="audit" className="min-h-11 flex-none gap-1.5 px-3 sm:px-4 text-[15px] font-semibold data-[state=active]:text-foreground after:bg-brand">
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

                        <div className="border border-rule rounded-lg bg-card p-4 space-y-3">
                            <h3 className="text-sm font-bold text-foreground">{t("manage.libraryToolsTitle")}</h3>
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
