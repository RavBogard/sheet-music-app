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
import { LiveServiceSection } from "@/components/admin/LiveServiceSection"
import { SoundSystemSection } from "@/components/admin/SoundSystemSection"
import { DuplicateScanner } from "@/components/library/DuplicateScanner"
import { PDFHealthScanner } from "@/components/library/PDFHealthScanner"
import { useLibrary } from "@/hooks/use-library"
import { useLibraryStore } from "@/lib/library-store"

export default function ManagePage() {
    const { isAdmin, isBandLeader, loading } = useAuth()
    const router = useRouter()
    const { refetch } = useLibrary()
    const allFiles = useLibraryStore(s => s.allFiles)

    if (loading) return (
        <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
    )

    if (!isBandLeader) {
        router.replace('/setlists')
        return null
    }

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
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-accent md:hidden">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6 text-brand" />
                            Manage
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Band management, library, and sound system
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="people">
                    <TabsList className="w-full">
                        <TabsTrigger value="people" className="min-h-11 gap-1.5">
                            <Users className="w-4 h-4" />
                            People
                        </TabsTrigger>
                        <TabsTrigger value="library" className="min-h-11 gap-1.5">
                            <Database className="w-4 h-4" />
                            Library
                        </TabsTrigger>
<TabsTrigger value="sound" className="min-h-11 gap-1.5">
                            <Radio className="w-4 h-4" />
                            Sound
                        </TabsTrigger>
                        {isAdmin && (
                            <TabsTrigger value="audit" className="min-h-11 gap-1.5">
                                <History className="w-4 h-4" />
                                Audit
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="people" className="mt-6">
                        <SectionErrorBoundary label="People">
                            <PeopleSection />
                        </SectionErrorBoundary>
                    </TabsContent>

                    <TabsContent value="library" className="mt-6 space-y-6">
                        <SectionErrorBoundary label="Library">
                            <LibraryDataSection />
                        </SectionErrorBoundary>

                        <div className="border border-border rounded-xl p-4 space-y-3">
                            <h3 className="text-sm font-medium text-foreground">Library Tools</h3>
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
                                Scan for duplicate charts or check PDF files for corruption.
                            </p>
                        </div>
                    </TabsContent>

<TabsContent value="sound" className="mt-6 space-y-8">
                        <SectionErrorBoundary label="Sound System">
                            <LiveServiceSection />
                            <SoundSystemSection />
                        </SectionErrorBoundary>
                    </TabsContent>

                    {isAdmin && (
                        <TabsContent value="audit" className="mt-6">
                            <SectionErrorBoundary label="Access Audit">
                                <AccessAuditLog />
                            </SectionErrorBoundary>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    )
}
