"use client"
import { useState, useCallback, useMemo } from "react"
import buildInfo from "@/build-info.json"
import { ChevronLeft, Plus, LogIn, Calendar, Sparkles, FolderUp, Wand2, FileText, Menu, Bell, Music, Settings, Cloud, HelpCircle, Activity, Library, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

import { getContextualGreeting } from "@/lib/greeting"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { UpcomingSetlistCard, SetlistCard, PlaceholderCard } from "./SetlistCards"
import { DeleteSetlistDialog, DuplicateSetlistDialog, TransferSetlistDialog } from "./SetlistDialogs"
import { ImporterModal } from "./importer/ImporterModal"
import { SetlistToolbar } from "./SetlistToolbar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { useCongregation } from "@/lib/congregation-store"
import { useSetlistDashboard, type UseSetlistDashboardProps } from "@/hooks/use-setlist-dashboard"
import { canEditSetlist } from "@/lib/setlist-permissions"
import { CreationWizard } from "./wizard/CreationWizard"
import { SetlistMatrixView } from "./SetlistMatrixView"

// Lazy-load UnifiedCalendar
const UnifiedCalendar = dynamic(
    () => import("@/components/calendar/UnifiedCalendar").then(m => m.UnifiedCalendar),
    { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-xl" /> }
)

export function SetlistDashboard(props: UseSetlistDashboardProps) {
    const congregation = useCongregation()
    const [showWizard, setShowWizard] = useState(false)
    const [wizardPrefilledDate, setWizardPrefilledDate] = useState<Date | null>(null)
    const openWizardForDate = useCallback((date: Date) => {
        setWizardPrefilledDate(date)
        setShowWizard(true)
    }, [])
    const handleWizardOpenChange = useCallback((open: boolean) => {
        setShowWizard(open)
        if (!open) setWizardPrefilledDate(null)
    }, [])

    const {
        router, user, signIn, isMember, isBandLeader, isAdmin, onBack, onCreateNew,
        loading, error, activeTab, setActiveTab, view, setView,
        searchQuery, setSearchQuery, rabbiFilter, setRabbiFilter, navigatingTo,
        deleteConfirmOpen, setDeleteConfirmOpen, setlistToDelete,
        duplicateConfirmOpen, setDuplicateConfirmOpen, setlistToDuplicate,
        showTransferDialog, setShowTransferDialog,
        showImporterModal, setShowImporterModal,
        selectedSetlistForTransfer,
        transferEmail, setTransferEmail,
        handleSelect, handleDeleteClick, confirmDelete,
        handleDuplicateClick, confirmDuplicate, handleCloneNextWeekClick,
        handleSaveAsTemplateClick, handleSaveAsDefaultClick, handleTransfer, transferring, handleCreateFromCalendar,
        handleCreateFromTemplate, handleDownload,
        availableRabbis, displayedSetlists,
        upcoming, pastOrNoDate, placeholders, hasUpcoming, isDownloading
    } = useSetlistDashboard(props)

    const greetingText = useMemo(() => {
        const firstName = user?.displayName?.split(' ')[0] || null
        return getContextualGreeting(
            firstName,
            undefined,
            congregation.shortName || DEFAULT_SHORT_NAME,
        ).text
    }, [user?.displayName, congregation.shortName])

    return (
        <div className="flex min-h-[100dvh] bg-background text-foreground relative overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col w-full">
                <main className="flex-1 p-4 md:p-8 pb-32">
                    <div className="max-w-5xl mx-auto space-y-8">
                        {/* Welcome Section */}
                        {user && (
                            <section className="mb-8 mt-2">
                                <h2 className="text-4xl font-bold tracking-tighter text-foreground mb-2">
                                    {greetingText}
                                </h2>
                                <p className="text-lg text-muted-foreground">
                                    Your stage is ready. {upcoming.length} upcoming setlists scheduled.
                                </p>
                            </section>
                        )}

                        {/* Toolbar */}
                        <SetlistToolbar
                            activeTab={activeTab} onTabChange={setActiveTab}
                            view={view} onViewChange={setView}
                            showPersonalTab={!!user}
                            searchQuery={searchQuery} onSearchChange={setSearchQuery}
                            rabbiFilter={rabbiFilter} onRabbiFilterChange={setRabbiFilter}
                            availableRabbis={availableRabbis}
                        />

                        {view === 'matrix' ? (
                            <div className="mt-4">
                                <SetlistMatrixView />
                            </div>
                        ) : view === 'calendar' ? (
                            <div className="mt-4 border border-border rounded-2xl overflow-hidden bg-card">
                                <UnifiedCalendar
                                    mode={isBandLeader ? 'planning' : 'viewer'}
                                    setlists={displayedSetlists}
                                    onSelectSetlist={handleSelect}
                                    onCreateSetlist={openWizardForDate}
                                />
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {!loading && error && (
                                    <ErrorState title="Unable to Load Setlists" description={error} onRetry={() => window.location.reload()} />
                                )}

                                {loading && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl bg-muted/50 border border-border" />)}
                                    </div>
                                )}

                                {!loading && !error && (
                                    <>
                                        {/* Create Action Card */}
                                        {user && isMember && (
                                            <section className="group cursor-pointer" onClick={() => setShowWizard(true)}>
                                                <div className="bg-card hover:bg-muted/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 border-dashed border-2 border-border hover:border-brand/60 transition-all relative overflow-hidden h-48">
                                                    <div className="w-16 h-16 rounded-full bg-brand flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:-translate-y-1">
                                                        <Plus className="w-8 h-8 text-white" />
                                                    </div>
                                                    <div className="z-10 mt-2">
                                                        <h3 className="text-xl font-bold text-foreground">Create New Setlist</h3>
                                                        <p className="text-sm text-muted-foreground mt-1">Start fresh or build from a template</p>
                                                    </div>
                                                </div>
                                            </section>
                                        )}

                                        {hasUpcoming && (
                                            <section>
                                                <div className="flex justify-between items-center px-2 mb-4">
                                                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Upcoming Services</h4>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {upcoming.map(setlist => (
                                                        <UpcomingSetlistCard
                                                            key={setlist.id}
                                                            setlist={setlist}
                                                            onEdit={(e) => { e.stopPropagation(); handleSelect(setlist) }}
                                                            onPerform={() => router.push(`/perform/setlist/${setlist.id}`)}
                                                            navigatingTo={navigatingTo}
                                                            onDownload={handleDownload}
                                                            isDownloading={isDownloading}
                                                            onDuplicate={handleDuplicateClick}
                                                            onCloneNextWeek={handleCloneNextWeekClick}
                                                            onSaveAsTemplate={handleSaveAsTemplateClick}
                                                            onSaveAsDefault={handleSaveAsDefaultClick}
                                                            onDelete={handleDeleteClick}
                                                            canDuplicate={!!user}
                                                            canDelete={canEditSetlist(setlist, { uid: user?.uid, isBandLeader, isAdmin })}
                                                            isAdmin={isAdmin}
                                                        />
                                                    ))}
                                                    {placeholders.map((p, idx) => (
                                                        <PlaceholderCard key={idx} date={p.date} onCreate={openWizardForDate} />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        <section className="mt-8">
                                            <div className="flex justify-between items-center px-2 mb-4">
                                                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Library & Past Events</h4>
                                            </div>
                                            {pastOrNoDate.length === 0 ? (
                                                <div className="text-muted-foreground italic py-10 text-center bg-card rounded-2xl border border-border">No other setlists found.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {pastOrNoDate.map(setlist => (
                                                        <SetlistCard
                                                            key={setlist.id}
                                                            setlist={setlist}
                                                            onEdit={(e) => { e.stopPropagation(); handleSelect(setlist) }}
                                                            onPerform={() => router.push(`/perform/setlist/${setlist.id}`)}
                                                            navigatingTo={navigatingTo}
                                                            onDuplicate={handleDuplicateClick}
                                                            onCloneNextWeek={handleCloneNextWeekClick}
                                                            onSaveAsTemplate={handleSaveAsTemplateClick}
                                                            onSaveAsDefault={handleSaveAsDefaultClick}
                                                            onDelete={handleDeleteClick}
                                                            canDuplicate={!!user}
                                                            canDelete={canEditSetlist(setlist, { uid: user?.uid, isBandLeader, isAdmin })}
                                                            isAdmin={isAdmin}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </section>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modals */}
            <CreationWizard open={showWizard} onOpenChange={handleWizardOpenChange} prefilledDate={wizardPrefilledDate} />
            <ImporterModal open={showImporterModal} onOpenChange={setShowImporterModal} onComplete={(id: string) => router.push(`/setlists/${id}`)} />
            <DeleteSetlistDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} setlistName={setlistToDelete?.name} onConfirm={confirmDelete} />
            <DuplicateSetlistDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen} setlistName={setlistToDuplicate?.name} onConfirm={confirmDuplicate} />
            <TransferSetlistDialog open={showTransferDialog} onClose={() => setShowTransferDialog(false)} setlistName={selectedSetlistForTransfer?.name} email={transferEmail} onEmailChange={setTransferEmail} onConfirm={handleTransfer} transferring={transferring} />
        </div>
    )
}
