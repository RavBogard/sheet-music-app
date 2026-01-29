"use client"

import { useState, useEffect, useMemo } from "react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import buildInfo from "@/build-info.json"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, Plus, FileText, Trash2, Calendar, LogIn, LogOut, User, Globe, Lock, Copy, List } from "lucide-react"
import { CalendarView } from "@/components/calendar/CalendarView"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"


import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface SetlistDashboardProps {
    onBack: () => void
    onSelect: (setlist: Setlist) => void
    onImport: () => void
    onCreateNew: () => void
}

export function SetlistDashboard({ onBack, onSelect, onImport, onCreateNew }: SetlistDashboardProps) {
    const { user, loading: authLoading, signIn, signOut } = useAuth()
    const [personalSetlists, setPersonalSetlists] = useState<Setlist[]>([])
    const [publicSetlists, setPublicSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'personal' | 'public'>('public')
    const [view, setView] = useState<'list' | 'calendar'>('list')

    // Create service (works for guest too)
    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user])

    const [error, setError] = useState<string | null>(null)

    // Subscribe to personal setlists (Only if user exists)
    useEffect(() => {
        if (!user || !setlistService) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)
        const unsubscribe = setlistService.subscribeToPersonalSetlists(
            (data) => {
                setPersonalSetlists(data)
                setLoading(false)
            },
            (err) => {
                console.error("Personal setlist subscription error:", err)
                setError("Failed to load your personal setlists. Please check your connection.")
                setLoading(false)
            }
        )
        return () => unsubscribe()
    }, [setlistService, user])

    // Subscribe to public setlists (Everyone)
    useEffect(() => {
        if (!setlistService) return

        const unsubscribe = setlistService.subscribeToPublicSetlists(
            (data) => {
                setPublicSetlists(data)
            },
            (err) => {
                // Non-blocking error for public list if main personal list might still work?
                // Or just show global error? Let's show specific error if active tab is public?
                console.error("Public setlist subscription error:", err)
            }
        )
        return () => unsubscribe()
    }, [setlistService])

    // Force 'public' tab if guest
    useEffect(() => {
        if (!user) setActiveTab('public')
    }, [user])

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [setlistToDelete, setSetlistToDelete] = useState<Setlist | null>(null)

    const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false)
    const [setlistToDuplicate, setSetlistToDuplicate] = useState<Setlist | null>(null)

    const [showTransferDialog, setShowTransferDialog] = useState(false)
    const [selectedSetlistForTransfer, setSelectedSetlistForTransfer] = useState<Setlist | null>(null)
    const [transferEmail, setTransferEmail] = useState("")

    const handleDuplicateClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        setSetlistToDuplicate(setlist)
        setDuplicateConfirmOpen(true)
    }

    const confirmDuplicate = async () => {
        if (!setlistService || !user || !setlistToDuplicate) return

        try {
            await setlistService.copyToPersonal(setlistToDuplicate.id, setlistToDuplicate)
            toast.success("Setlist duplicated successfully!")
            setActiveTab('personal')
        } catch (err) {
            console.error("Duplicate failed:", err)
            toast.error("Failed to duplicate setlist.")
        }
        setDuplicateConfirmOpen(false)
        setSetlistToDuplicate(null)
    }

    const openTransferDialog = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedSetlistForTransfer(setlist)
        setShowTransferDialog(true)
    }

    const handleTransfer = async () => {
        if (!selectedSetlistForTransfer || !transferEmail) return

        try {
            const token = await user?.getIdToken()
            const res = await fetch('/api/setlist/transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    setlistId: selectedSetlistForTransfer.id,
                    newOwnerEmail: transferEmail
                })
            })

            if (!res.ok) {
                const msg = await res.text()
                throw new Error(msg)
            }

            toast.success("Transfer Successful!")
            setShowTransferDialog(false)
            setTransferEmail("")
            setSelectedSetlistForTransfer(null)
        } catch (err: any) {
            toast.error(`Transfer Failed: ${err.message}`)
        }
    }

    const handleDeleteClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService) return

        // Only owner can delete
        if (setlist.isPublic && setlist.ownerId !== user?.uid) {
            toast.error("You can only delete setlists you created")
            return
        }

        setSetlistToDelete(setlist)
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!setlistService || !setlistToDelete) return
        try {
            await setlistService.deleteSetlist(setlistToDelete.id, setlistToDelete.isPublic || false)
            toast.success("Setlist deleted")
        } catch (error) {
            toast.error("Failed to delete setlist")
        }
        setDeleteConfirmOpen(false)
        setSetlistToDelete(null)
    }

    const handleCreateFromCalendar = async (date: Date, type?: 'shabbat_morning') => {
        if (!setlistService || !user) return

        const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        const name = type === 'shabbat_morning' ? `Shabbat Morning ${formattedDate}` : 'New Setlist'

        try {
            const id = await setlistService.createSetlist(name, [], false, {
                eventDate: date.toISOString(),
                templateType: type
            })
            // await setlistService.updateSetlist(id, false, { ... }) // Removed in favor of atomic create

            const newSetlist: Setlist = {
                id,
                name,
                tracks: [],
                trackCount: 0,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
                eventDate: date.toISOString(),
                ownerId: user.uid,
                isPublic: false
            }
            onSelect(newSetlist)

        } catch (e) {
            console.error("Failed to create from calendar", e)
            toast.error("Failed to create setlist")
        }
    }

    const displayedSetlists = activeTab === 'personal' ? personalSetlists : publicSetlists

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img
                        src="/logo.jpg"
                        alt="CRC"
                        className="h-8 w-8 rounded-full border border-zinc-700 object-cover"
                    />
                    <h1 className="text-2xl font-bold">My Setlists</h1>
                </div>

                {user && (
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={onImport}
                            variant="outline"
                            size="sm"
                            className="hidden sm:flex gap-2 border-zinc-800 hover:bg-zinc-800"
                        >
                            <FileText className="h-4 w-4" />
                            Import Excel
                        </Button>
                        <Button
                            onClick={onCreateNew}
                            className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 px-6"
                        >
                            <Plus className="h-5 w-5" />
                            New Setlist
                        </Button>
                    </div>
                )}
                {!user && (
                    <Button onClick={signIn} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500">
                        <LogIn className="h-4 w-4" />
                        Sign In
                    </Button>
                )}
            </div>

            {/* Dialogs */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Setlist?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{setlistToDelete?.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Duplicate Setlist</AlertDialogTitle>
                        <AlertDialogDescription>
                            Create a personal copy of "{setlistToDuplicate?.name}"?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDuplicate}>Duplicate</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Transfer Dialog Overlay */}
            {showTransferDialog && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl max-w-md w-full space-y-4">
                        <h3 className="text-xl font-bold">Transfer Ownership</h3>
                        <p className="text-zinc-400">
                            Transferring <strong>{selectedSetlistForTransfer?.name}</strong> to another user.
                            You will lose access unless they share it back with you.
                        </p>
                        <input
                            type="email"
                            placeholder="New Owner's Email"
                            className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-white"
                            value={transferEmail}
                            onChange={(e) => setTransferEmail(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
                            <Button onClick={handleTransfer} disabled={!transferEmail}>Transfer</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs & View Toggle */}
            <div className="px-6 pt-6 shrink-0 flex items-center justify-between">
                <div className="flex bg-zinc-900 p-1 rounded-xl w-fit">
                    <Button
                        variant={activeTab === 'public' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('public')}
                        className={`transition-all ${activeTab === 'public' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent'}`}
                    >
                        Public Library
                    </Button>
                    {user && (
                        <Button
                            variant={activeTab === 'personal' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('personal')}
                            className={`transition-all ${activeTab === 'personal' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent'}`}
                        >
                            My Personal
                        </Button>
                    )}
                </div>

                <div className="flex bg-zinc-900 p-1 rounded-xl w-fit">
                    <Button
                        variant={view === 'list' ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setView('list')}
                        className={`h-9 w-9 transition-all ${view === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent'}`}
                        title="List View"
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={view === 'calendar' ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setView('calendar')}
                        className={`h-9 w-9 transition-all ${view === 'calendar' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-transparent'}`}
                        title="Calendar View"
                    >
                        <Calendar className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {view === 'calendar' ? (
                <div className="flex-1 p-6 overflow-hidden">
                    <CalendarView
                        setlists={[...personalSetlists, ...publicSetlists]}
                        onSelectSetlist={onSelect}
                        onCreateSetlist={handleCreateFromCalendar}
                    />
                </div>
            ) : (
                <ScrollArea className="flex-1 p-6">
                    {/* Error State */}
                    {!loading && error && (
                        <div className="max-w-md mx-auto mt-20">
                            <ErrorState
                                title="Unable to Load Setlists"
                                description={error}
                                onRetry={() => window.location.reload()}
                            />
                        </div>
                    )}

                    {/* Loader */}
                    {loading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} className="h-48 rounded-xl bg-zinc-900/50 border border-zinc-800" />
                            ))}
                        </div>
                    )}

                    {!loading && !error && (
                        <div className="space-y-10">
                            {/* UPCOMING SECTION (Only if Personal or Public has content, but technically Public usually implies upcoming services) */}
                            {/* Actually, let's show Upcoming for EVERYONE if we are in Public tab, or if we are in Personal tab show MY upcoming */}

                            {(() => {
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)

                                // Helper to parse setlist date
                                const getSetlistDate = (s: Setlist) => {
                                    if (s.eventDate) return new Date(s.eventDate)
                                    // Fallback to creation date if no event date? No, only event dates count for "Upcoming"
                                    return null
                                }

                                // 1. Identify Real Upcoming Setlists
                                const upcomingReal = displayedSetlists.filter(s => {
                                    const d = getSetlistDate(s)
                                    return d && d >= today
                                }).sort((a, b) => getSetlistDate(a)!.getTime() - getSetlistDate(b)!.getTime())

                                // 2. Identify Past/Other Setlists
                                const pastOrNoDate = displayedSetlists.filter(s => {
                                    const d = getSetlistDate(s)
                                    // If no date, show in main list. If past, show in main list.
                                    return !d || d < today
                                })

                                // 3. Generate Placeholders (Only for Public View & Logged In Users who can edit - essentially all logged in users for now)
                                // "Clarify that someone should grab it and create a setlist"
                                const placeholders = []
                                if (user && activeTab === 'public') { // Only show suggest placeholders in public library context? Or maybe Personal too? Protocol says "Planned services... listed" usually implies public/team context.
                                    for (let i = 0; i < 7; i++) {
                                        const d = new Date(today)
                                        d.setDate(today.getDate() + i)

                                        // Check if a setlist already exists for this date (in public list)
                                        const exists = publicSetlists.some(s => {
                                            const sd = getSetlistDate(s)
                                            return sd && sd.toDateString() === d.toDateString()
                                        })

                                        if (!exists) {
                                            // Is this a "Planned Service" day?
                                            // User said "Planned services that still need to be created". 
                                            // Assuming for now ALL next 6 days are valid slots, specifically Shabbat (Fri/Sat) are strictly required, but let's just show slots for next 6 days as requested.
                                            // Maybe emphasize Fri/Sat?
                                            const isShabbat = d.getDay() === 5 || d.getDay() === 6

                                            if (true) { // Show for all days or just Shabbat? "anything within the next 6 days should be listed" -> All days.
                                                placeholders.push({ date: d, isShabbat })
                                            }
                                        }
                                    }
                                }

                                const hasUpcoming = upcomingReal.length > 0 || placeholders.length > 0

                                return (
                                    <>
                                        {hasUpcoming && (
                                            <section>
                                                <h2 className="text-lg font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <Calendar className="h-4 w-4" />
                                                    Upcoming Services
                                                </h2>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {/* Real Upcoming */}
                                                    {upcomingReal.map(setlist => (
                                                        <button
                                                            key={setlist.id}
                                                            onClick={() => onSelect(setlist)}
                                                            className="bg-zinc-900/80 hover:bg-zinc-800 border-l-4 border-l-blue-500 border-y border-r border-zinc-800 rounded-r-xl p-6 text-left transition-all group relative overflow-hidden"
                                                        >
                                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                                                <Calendar className="h-24 w-24 -mr-4 -mt-4 text-blue-500" />
                                                            </div>

                                                            <div className="relative z-10">
                                                                <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider mb-2">
                                                                    {new Date(setlist.eventDate!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                                </div>
                                                                <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">{setlist.name}</h3>
                                                                {setlist.ownerName && <p className="text-zinc-500 text-sm">Leader: {setlist.ownerName}</p>}

                                                                <div className="mt-4 flex items-center gap-4 text-sm text-zinc-400">
                                                                    <span>{setlist.trackCount || 0} songs</span>
                                                                    {setlist.isPublic && <Globe className="h-3 w-3" />}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}

                                                    {/* Placeholders */}
                                                    {placeholders.map((p, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleCreateFromCalendar(p.date)}
                                                            className="border border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/50 rounded-xl p-6 text-left transition-all flex flex-col justify-center items-center gap-3 group opacity-70 hover:opacity-100"
                                                        >
                                                            <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-colors">
                                                                <Plus className="h-6 w-6" />
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="font-bold text-zinc-300">
                                                                    {p.date.toLocaleDateString('en-US', { weekday: 'long' })}
                                                                </div>
                                                                <div className="text-sm text-zinc-500">
                                                                    {p.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs font-medium text-blue-500/80 bg-blue-500/10 px-3 py-1 rounded-full uppercase tracking-wider">
                                                                Plan Service
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Main Library / Past Setlists */}
                                        <section>
                                            {hasUpcoming && (
                                                <h2 className="text-lg font-bold text-zinc-400 uppercase tracking-wider mb-4 border-t border-zinc-800 pt-8">
                                                    Library & Past Events
                                                </h2>
                                            )}

                                            {pastOrNoDate.length === 0 ? (
                                                <div className="text-zinc-500 italic py-10 text-center">No other setlists found.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {pastOrNoDate.map(setlist => (
                                                        <button
                                                            key={setlist.id}
                                                            onClick={() => onSelect(setlist)}
                                                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-6 text-left transition-all group relative"
                                                        >
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    {setlist.isPublic ? (
                                                                        <Globe className="h-4 w-4 text-zinc-600" />
                                                                    ) : (
                                                                        <Lock className="h-4 w-4 text-zinc-600" />
                                                                    )}
                                                                    {/* Add Date to Name for standard items as requested "names... should have that date... added" */}
                                                                    <div className="flex flex-col">
                                                                        <h3 className="text-xl font-semibold truncate max-w-[200px] group-hover:text-white text-zinc-200">{setlist.name}</h3>
                                                                        {setlist.eventDate && (
                                                                            <span className="text-xs text-zinc-500">
                                                                                {new Date(setlist.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Action Buttons (Copy/Delete) */}
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {user && (
                                                                        <div
                                                                            className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-white"
                                                                            onClick={(e) => handleDuplicateClick(setlist, e)}
                                                                            title="Duplicate"
                                                                        >
                                                                            <Copy className="h-4 w-4" />
                                                                        </div>
                                                                    )}
                                                                    {(!setlist.isPublic || setlist.ownerId === user?.uid) && (
                                                                        <div
                                                                            className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-red-400"
                                                                            onClick={(e) => handleDeleteClick(setlist, e)}
                                                                            title="Delete"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {setlist.isPublic && setlist.ownerName && (
                                                                <div className="text-sm text-zinc-500">
                                                                    by {setlist.ownerName}
                                                                </div>
                                                            )}
                                                            <div className="mt-2 text-zinc-400 text-sm">
                                                                {setlist.trackCount || 0} songs
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </section>
                                    </>
                                )
                            })()}
                        </div>
                    )}
                </ScrollArea>
            )}

            {/* Version Footer */}
            <div className="absolute bottom-2 right-2 text-[10px] text-zinc-800 pointer-events-none select-none z-50">
                v{buildInfo.version}
            </div>
        </div>
    )
}
