"use client"
import { useState, useCallback, useMemo, type ReactNode } from "react"
import buildInfo from "@/build-info.json"
import { ChevronLeft, Plus, LogIn, Calendar, Sparkles, FolderUp, Wand2, FileText, Menu, Bell, Music, Settings, Cloud, HelpCircle, Activity, Library, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"

import { getContextualGreeting } from "@/lib/greeting"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { UpcomingSetlistCard, SetlistCard, SetlistInfoLine, PlaceholderCard } from "./SetlistCards"
import { DeleteSetlistDialog, DuplicateSetlistDialog, TransferSetlistDialog } from "./SetlistDialogs"
import { ImporterModal } from "./importer/ImporterModal"
import { SetlistSearchButton, SetlistSearchField } from "./SetlistToolbar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { useCongregation } from "@/lib/congregation-store"
import { useI18n } from "@/i18n/client"
import { useSetlistDashboard, type UseSetlistDashboardProps } from "@/hooks/use-setlist-dashboard"
import { canEditSetlist } from "@/lib/setlist-permissions"
import { CreationWizard } from "./wizard/CreationWizard"
import { foldSetlistVariants } from "@/lib/setlist-variant-fold"
import { toDate } from "@/lib/firestore-helpers"
import { VariantGroupList } from "./VariantGroupList"
import { PageContainer, PageHeader, GROUP_HEADING_CLASS } from "@/components/layout/Page"
import { cn } from "@/lib/utils"

export function SetlistDashboard({ serverShortName, ...props }: UseSetlistDashboardProps & { serverShortName?: string }) {
    const congregation = useCongregation()
    const { t, lang } = useI18n()
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
        loading, error,
        searchQuery, setSearchQuery, navigatingTo,
        deleteConfirmOpen, setDeleteConfirmOpen, setlistToDelete,
        duplicateConfirmOpen, setDuplicateConfirmOpen, setlistToDuplicate,
        showTransferDialog, setShowTransferDialog,
        showImporterModal, setShowImporterModal,
        selectedSetlistForTransfer,
        transferEmail, setTransferEmail,
        handleSelect, handleDeleteClick, confirmDelete,
        handleDuplicateClick, confirmDuplicate, handleCloneNextWeekClick,
        handleSaveAsTemplateClick, handleSaveAsDefaultClick, handleTransfer, transferring,
        handleCreateFromTemplate, handleDownload,
        displayedSetlists,
        upcoming, pastOrNoDate, placeholders, hasUpcoming, isDownloading,
        nextCursor, loadMore, loadingMore,
    } = useSetlistDashboard(props)
    const [searchOpen, setSearchOpen] = useState(() => !!searchQuery)

    // WEB-05: per-instrument and (Copy) setlists fold under their parent service.
    const pastGroups = useMemo(
        () => foldSetlistVariants(pastOrNoDate, (x) => {
            const d = x.eventDate ? toDate(x.eventDate) : null
            return d ? d.toISOString().slice(0, 10) : null
        }),
        [pastOrNoDate],
    )
    const greetingText = useMemo(() => {
        const firstName = user?.displayName?.split(' ')[0] || null
        return getContextualGreeting(
            firstName,
            undefined,
            serverShortName || congregation.shortName || DEFAULT_SHORT_NAME,
            { t, lang },
        ).text
    }, [user?.displayName, serverShortName, congregation.shortName, t, lang])

    const renderPastCard = (setlist: (typeof pastOrNoDate)[number], extra?: ReactNode) => (
        <SetlistCard
                                                            extra={extra}
                                                            onDownload={handleDownload}
                                                            isDownloading={isDownloading}
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
                                                            canEdit={!!user}
                                                            isAdmin={isAdmin}
                                                        />
    )

    return (
        <div className="bg-background text-foreground">
            {/* Consistency pass: the one page container and head row. */}
            <div>
                <div>
                    <PageContainer className="space-y-3">
                        {/* Head row: the page title matches its tab; the greeting
                            and the upcoming count are the subtitle; one blue action. */}
                        <PageHeader
                                title={t("nav.setlists")}
                                subtitle={user ? (
                                    <>
                                        <span data-testid="setlists-greeting" suppressHydrationWarning>{greetingText}</span>
                                        <span aria-hidden="true"> · </span>
                                        {t("setlist.upcomingScheduled", { count: upcoming.length })}
                                    </>
                                ) : undefined}
                                actions={<>
                                    <SetlistSearchButton open={searchOpen} onOpenChange={setSearchOpen} onSearchChange={setSearchQuery} />
                                    {user && isMember ? (
                                    <Button
                                        type="button"
                                        onClick={() => setShowWizard(true)}
                                        data-testid="setlists-new-setlist"
                                        size="sm"
                                        className="h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm"
                                    >
                                        <Plus aria-hidden className="h-4 w-4" />
                                        {t("org.createNewSetlistHeading")}
                                    </Button>
                                    ) : null}
                                </>}
                            />

                        {/* Search opens under the head row; there is no filter row
                            (Daniel 2026-11-01: the rabbi chips are cut). */}
                        {searchOpen && <SetlistSearchField searchQuery={searchQuery} onSearchChange={setSearchQuery} />}

                            <div className="space-y-5">
                                {!loading && error && (
                                    <ErrorState title={t("setlist.loadErrorTitle")} description={error} retryLabel={t("setlist.tryAgain")} onRetry={() => window.location.reload()} />
                                )}

                                {loading && (
                                    <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card">
                                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-11 rounded-none bg-muted/60" />)}
                                    </div>
                                )}

                                {!loading && !error && (
                                    <>
                                        {hasUpcoming && (
                                            <section>
                                                <h2 className={cn(GROUP_HEADING_CLASS, "mb-2")}>{t("org.upcomingSection")}</h2>
                                                <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card">
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
                                                            canEdit={!!user}
                                                            isAdmin={isAdmin}
                                                        />
                                                    ))}
                                                    {placeholders.map((p, idx) => (
                                                        <PlaceholderCard key={idx} date={p.date} onCreate={openWizardForDate} />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        <section>
                                            <h2 className={cn(GROUP_HEADING_CLASS, "mb-2")}>{t("setlist.pastEventsSection")}</h2>
                                            {pastOrNoDate.length === 0 ? (
                                                <div className="text-muted-foreground py-10 text-center bg-card rounded-lg border border-rule">{t("setlist.noOtherSetlists")}</div>
                                            ) : (
                                                <VariantGroupList
                                                    groups={pastGroups}
                                                    renderRow={renderPastCard}
                                                    renderInfo={(v, extra) => <SetlistInfoLine setlist={v} extra={extra} />}
                                                />
                                            )}
                                            {nextCursor && (
                                                <div className="mt-6 flex justify-center">
                                                    <Button
                                                        variant="outline"
                                                        onClick={loadMore}
                                                        disabled={loadingMore}
                                                        aria-label={t("setlist.loadOlder")}
                                                    >
                                                        {loadingMore ? t("setlist.loadingEllipsis") : t("setlist.loadOlder")}
                                                    </Button>
                                                </div>
                                            )}
                                        </section>
                                    </>
                                )}
                            </div>
                    </PageContainer>
                </div>
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
