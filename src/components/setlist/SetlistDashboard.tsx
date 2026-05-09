"use client"
import { useState, useCallback } from "react"
import buildInfo from "@/build-info.json"
import { ChevronLeft, Plus, LogIn, Calendar, Sparkles, FolderUp, Wand2, FileText, Menu, Bell, Music, Settings, Cloud, HelpCircle, Activity, Library, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

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

    return (
        <div className="flex min-h-[100dvh] bg-background text-foreground relative overflow-hidden">
            
            {/* NavigationDrawer Sidebar (Desktop) */}
            <aside className="fixed left-0 top-0 bottom-0 z-[60] flex-col py-12 h-full w-80 rounded-r-2xl bg-black/40 backdrop-blur-3xl border-r border-white/10 shadow-2xl hidden md:flex">
                <div className="px-8 mb-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-brand/30">
                        {(user as any)?.photoURL ? (
                            <img src={(user as any).photoURL} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-brand/20 flex items-center justify-center">
                                <span className="text-brand font-bold">{user?.displayName?.charAt(0) || 'U'}</span>
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">{user?.displayName || 'Guest Performer'}</h3>
                        <p className="text-sm text-muted-foreground">{isBandLeader ? 'Band Leader' : isMember ? 'Team Member' : 'Viewing'}</p>
                    </div>
                </div>
                
                <nav className="flex-1 space-y-2">
                    <button className="w-full bg-brand/10 text-brand border-l-4 border-brand px-8 py-4 flex items-center gap-4 transition-all duration-300">
                        <Music className="w-5 h-5" />
                        <span className="font-semibold text-sm tracking-wide">Setlists</span>
                    </button>
                    <button onClick={() => router.push('/songs')} className="w-full text-muted-foreground px-8 py-4 flex items-center gap-4 hover:bg-white/5 transition-all duration-300">
                        <Library className="w-5 h-5" />
                        <span className="font-semibold text-sm tracking-wide">Library</span>
                    </button>
                    {isBandLeader && (
                        <button onClick={() => router.push('/manage/templates')} className="w-full text-muted-foreground px-8 py-4 flex items-center gap-4 hover:bg-white/5 transition-all duration-300">
                            <Settings className="w-5 h-5" />
                            <span className="font-semibold text-sm tracking-wide">Templates</span>
                        </button>
                    )}
                </nav>

                <div className="px-8 py-4 mt-auto">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand/50">{congregation.shortName}</span>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col md:ml-80">
                {/* TopAppBar */}
                <header className="sticky top-0 z-50 flex justify-between items-center w-full px-4 md:px-8 h-20 bg-background/60 backdrop-blur-xl border-b border-white/5 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.05)]">
                    <div className="flex items-center gap-4">
                        <button className="md:hidden text-foreground hover:bg-white/5 p-2 rounded-lg" onClick={onBack || (() => router.back())}>
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-2xl font-bold tracking-tighter text-foreground uppercase">Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {!user ? (
                            <Button onClick={signIn} size="sm" className="gap-2 bg-brand hover:bg-brand/90">
                                <LogIn className="h-4 w-4" /> Sign In
                            </Button>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Button variant="outline" className="hidden sm:flex gap-2 border-brand/30 text-brand hover:bg-brand/10" onClick={() => setShowWizard(true)}>
                                    <Plus className="h-4 w-4" /> New
                                </Button>
                                <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors text-muted-foreground">
                                    <Bell className="w-5 h-5" />
                                </button>
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 md:hidden">
                                    {(user as any)?.photoURL ? <img src={(user as any).photoURL} alt="Profile" /> : <div className="w-full h-full bg-brand/20" />}
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8 pb-32">
                    <div className="max-w-5xl mx-auto space-y-8">
                        {/* Welcome Section */}
                        {user && (
                            <section className="mb-8 mt-2">
                                <h2 className="text-4xl font-bold tracking-tighter text-foreground mb-2">
                                    Welcome Back{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
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

                        {view === 'calendar' ? (
                            <div className="mt-4 border border-white/5 rounded-2xl overflow-hidden bg-black/20">
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
                                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl bg-white/5 border border-white/10" />)}
                                    </div>
                                )}

                                {!loading && !error && (
                                    <>
                                        {/* Create Action Card */}
                                        {user && isMember && (
                                            <section className="group cursor-pointer" onClick={() => setShowWizard(true)}>
                                                <div className="bg-white/[0.03] backdrop-blur-xl rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 border-dashed border-2 border-brand/30 hover:border-brand/60 transition-all relative overflow-hidden h-48">
                                                    <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                    <div className="w-16 h-16 rounded-full bg-brand flex items-center justify-center shadow-[0_0_30px_rgba(67,56,202,0.5)] transition-transform group-hover:scale-110 group-hover:-translate-y-1">
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

                                        {/* Live Monitor Graphic */}
                                        {hasUpcoming && (
                                            <section className="mt-12 p-6 bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-2xl">
                                                <div className="flex justify-between items-center mb-6">
                                                    <h4 className="text-xl font-bold text-foreground flex items-center gap-2">
                                                        <Activity className="w-5 h-5 text-brand" /> Live Monitor
                                                    </h4>
                                                    <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Ready</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-3 items-end h-32 px-4 opacity-70">
                                                    {[65, 40, 85, 55, 70, 45, 90, 60].map((height, i) => (
                                                        <div key={i} className="flex-1 bg-black/40 rounded-t-sm h-full relative overflow-hidden group">
                                                            <div 
                                                                className="absolute bottom-0 w-full bg-brand shadow-[0_0_15px_rgba(67,56,202,0.6)] transition-all duration-300" 
                                                                style={{ height: `${height}%` }}
                                                            ></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        <section className="mt-8">
                                            <div className="flex justify-between items-center px-2 mb-4">
                                                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Library & Past Events</h4>
                                            </div>
                                            {pastOrNoDate.length === 0 ? (
                                                <div className="text-muted-foreground italic py-10 text-center bg-white/5 rounded-2xl border border-white/5">No other setlists found.</div>
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

                <div className="fixed bottom-4 right-4 text-[10px] font-mono text-muted-foreground/30 pointer-events-none select-none z-50">
                    v{buildInfo.version}
                </div>
            </div>

            {/* BottomNavBar (Mobile Only) */}
            <nav className="fixed bottom-0 w-full z-[100] rounded-t-2xl bg-black/80 backdrop-blur-2xl border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:hidden flex justify-around items-center h-20 pb-safe px-4">
                <button className="flex flex-col items-center justify-center text-brand drop-shadow-[0_0_8px_rgba(67,56,202,0.5)] scale-110 duration-200">
                    <Music className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Setlists</span>
                </button>
                <button onClick={() => router.push('/songs')} className="flex flex-col items-center justify-center text-muted-foreground/60 hover:text-brand/80 transition-all">
                    <Library className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Library</span>
                </button>
                <button onClick={() => setShowWizard(true)} className="flex flex-col items-center justify-center text-muted-foreground/60 hover:text-brand/80 transition-all relative">
                    <div className="absolute -top-6 bg-brand text-white p-2 rounded-full shadow-[0_0_20px_rgba(67,56,202,0.6)]">
                        <Plus className="w-6 h-6" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest mt-6">New</span>
                </button>
                <button className="flex flex-col items-center justify-center text-muted-foreground/60 hover:text-brand/80 transition-all">
                    <Mic className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Stage</span>
                </button>
            </nav>

            {/* Modals */}
            <CreationWizard open={showWizard} onOpenChange={handleWizardOpenChange} prefilledDate={wizardPrefilledDate} />
            <ImporterModal open={showImporterModal} onOpenChange={setShowImporterModal} onComplete={(id: string) => router.push(`/setlists/${id}`)} />
            <DeleteSetlistDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} setlistName={setlistToDelete?.name} onConfirm={confirmDelete} />
            <DuplicateSetlistDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen} setlistName={setlistToDuplicate?.name} onConfirm={confirmDuplicate} />
            <TransferSetlistDialog open={showTransferDialog} onClose={() => setShowTransferDialog(false)} setlistName={selectedSetlistForTransfer?.name} email={transferEmail} onEmailChange={setTransferEmail} onConfirm={handleTransfer} transferring={transferring} />
        </div>
    )
}
