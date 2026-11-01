"use client"

import { useAuth } from "@/lib/auth-context"
import { Users, Database, Radio, History } from "lucide-react"
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
import { useT } from "@/i18n/client"
import { PageContainer, PageHeader, CARD_CLASS } from "@/components/layout/Page"
import { SEGMENTED_GROUP_CLASS, SEGMENTED_CHIP_CLASS } from "@/components/ui/segmented-chips"
import { cn } from "@/lib/utils"

// The (unstyled) tab trigger takes the segmented-chip classes as they are:
// both key off data-state="active" | "inactive", which Radix sets.
const MANAGE_TAB_CLASS = SEGMENTED_CHIP_CLASS

export default function ManageClient({
    serverIsAdmin,
    adminOnlyNotice = false,
}: {
    serverIsAdmin: boolean
    adminOnlyNotice?: boolean
}) {
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
        <PageContainer className="space-y-5">
            {/* Consistency pass: the one page head (title, subtitle); the tab
                bar is the way out, so no back button. */}
            <PageHeader title={t("manage.title")} subtitle={t("manage.subtitle")} />

                {adminOnlyNotice && (
                    <p role="status" className="rounded-md border border-rule bg-accent px-4 py-3 text-sm font-medium">
                        {t("manage.adminOnlyNotice")}
                    </p>
                )}

                <Tabs defaultValue="people">
                    {/* The section tabs use the shared segmented chips (they wrap, never
                        scroll), keeping Radix tab semantics for the panels. */}
                    <TabsList unstyled className={SEGMENTED_GROUP_CLASS}>
                        <TabsTrigger unstyled value="people" className={MANAGE_TAB_CLASS}>
                            <Users className="w-4 h-4" />
                            {t("manage.tabPeople")}
                        </TabsTrigger>
                        <TabsTrigger unstyled value="library" className={MANAGE_TAB_CLASS}>
                            <Database className="w-4 h-4" />
                            {t("manage.tabLibrary")}
                        </TabsTrigger>
                        {mixerOn && (
                            <TabsTrigger unstyled value="sound" className={MANAGE_TAB_CLASS}>
                                <Radio className="w-4 h-4" />
                                {t("manage.tabSound")}
                            </TabsTrigger>
                        )}
                        {serverIsAdmin && (
                            <TabsTrigger unstyled value="audit" className={MANAGE_TAB_CLASS}>
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

                        <div className={cn(CARD_CLASS, "p-4 space-y-3")}>
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
        </PageContainer>
    )
}
