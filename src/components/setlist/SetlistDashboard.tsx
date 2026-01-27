"use client"

import { useState, useEffect, useMemo } from "react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, Plus, FileText, Trash2, Calendar, LogIn, LogOut, User, Globe, Lock, Copy, List } from "lucide-react"
import { CalendarView } from "@/components/calendar/CalendarView"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportDataButton } from "@/components/settings/ExportDataButton"

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

    // Subscribe to personal setlists (Only if user exists)
    useEffect(() => {
        if (!user || !setlistService) {
            setLoading(false)
            return
        }

        setLoading(true)
        const unsubscribe = setlistService.subscribeToPersonalSetlists((data) => {
            setPersonalSetlists(data)
            setLoading(false)
        })
        return () => unsubscribe()
    }, [setlistService, user])

    // Subscribe to public setlists (Everyone)
    useEffect(() => {
        if (!setlistService) return

        const unsubscribe = setlistService.subscribeToPublicSetlists((data) => {
            setPublicSetlists(data)
        })
        return () => unsubscribe()
    }, [setlistService])

    // Force 'public' tab if guest
    useEffect(() => {
        if (!user) setActiveTab('public')
    }, [user])

    const [showTransferDialog, setShowTransferDialog] = useState(false)
    const [selectedSetlistForTransfer, setSelectedSetlistForTransfer] = useState<Setlist | null>(null)
    const [transferEmail, setTransferEmail] = useState("")

    // ... existing hooks ...

    const handleDuplicate = async (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService || !user) return

        if (!confirm(`Create a copy of "${setlist.name}"?`)) return

        try {
            await setlistService.copyToPersonal(setlist.id, setlist)
            alert("Setlist duplicated successfully!")
            setActiveTab('personal')
        } catch (err) {
            console.error("Duplicate failed:", err)
            alert("Failed to duplicate setlist.")
        }
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

            alert("Transfer Successful!")
            setShowTransferDialog(false)
            setTransferEmail("")
            setSelectedSetlistForTransfer(null)
        } catch (err: any) {
            alert(`Transfer Failed: ${err.message}`)
        }
    }

    const handleDelete = async (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService) return

        // Only owner can delete
        if (setlist.isPublic && setlist.ownerId !== user?.uid) {
            alert("You can only delete setlists you created")
            return
        }

        if (confirm("Delete this setlist?")) {
            await setlistService.deleteSetlist(setlist.id, setlist.isPublic || false)
        }
    }

    const handleCreateFromCalendar = async (date: Date, type?: 'shabbat_morning') => {
        if (!setlistService || !user) return

        const name = type === 'shabbat_morning' ? 'Shabbat Morning' : 'New Setlist'
        // Future: Pre-fill tracks based on type
        // For now, empty, but we set the date.

        try {
            // We need to support passing eventDate to createSetlist in the service. 
            // Since the service method signature is fixed in the file we didn't fully see or edit (we only edited interface), 
            // we should assume we might need to update the service OR update the doc after creation.
            // Let's create then update.

            const id = await setlistService.createSetlist(name, [], false)
            await setlistService.updateSetlist(id, false, {
                eventDate: date.toISOString(), // Storing as string for simplicity or update types to handle Timestamp conversion 
                templateType: type
            })

            // Fetch the new setlist object to pass to onSelect
            // Since we don't have it synchronously, we can just trigger onSelect with a Partial or wait for subscription?
            // Subscription will update the list, but we want to navigate.

            // Hack: Construct a temporary object
            const newSetlist: Setlist = {
                id,
                name,
                tracks: [],
                trackCount: 0,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 } as any, // Mock timestamp
                eventDate: date.toISOString(),
                ownerId: user.uid,
                isPublic: false
            }
            onSelect(newSetlist)

        } catch (e) {
            console.error("Failed to create from calendar", e)
            alert("Failed to create setlist")
        }
    }

    // Show sign-in prompt if not authenticated
    if (!authLoading && !user) {
        return (
            <div className="h-screen flex flex-col bg-zinc-950 text-white">
                <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                    <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                        <ChevronLeft className="h-8 w-8" />
                    </Button>
                    <h1 className="text-2xl font-bold flex-1">My Setlists</h1>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="text-center">
                        <img
                            src="/logo.jpg"
                            alt="CRC"
                            className="h-20 w-20 rounded-full border-2 border-zinc-700 object-cover mx-auto mb-4"
                        />
                        <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
                        <p className="text-zinc-500 max-w-md">
                            Sign in with your Google account to create and manage your personal setlists.
                        </p>
                    </div>
                    <Button onClick={signIn} size="lg" className="gap-2 h-14 px-8 text-lg">
                        <LogIn className="h-5 w-5" />
                        Sign in with Google
                    </Button>
                </div>
            </div>
        )
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
                    <button
                        onClick={() => setActiveTab('public')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'public'
                            ? 'bg-zinc-800 text-white shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        Public Library
                    </button>
                    {user && (
                        <button
                            onClick={() => setActiveTab('personal')}
                            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'personal'
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            My Personal
                        </button>
                    )}
                </div>

                <div className="flex bg-zinc-900 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setView('list')}
                        className={`p-2 rounded-lg transition-all ${view === 'list'
                            ? 'bg-zinc-800 text-white shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        title="List View"
                    >
                        <List className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setView('calendar')}
                        className={`p-2 rounded-lg transition-all ${view === 'calendar'
                            ? 'bg-zinc-800 text-white shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        title="Calendar View"
                    >
                        <Calendar className="h-5 w-5" />
                    </button>
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
                    {/* Empty State */}
                    {!loading && displayedSetlists.length === 0 && (
                        <div className="max-w-md mx-auto mt-20">
                            <EmptyState
                                icon={Plus}
                                title={activeTab === 'personal' ? "No Personal Setlists" : "No Public Setlists"}
                                description={activeTab === 'personal'
                                    ? "You haven't created any setlists yet. Start by creating a new one or importing from Excel."
                                    : "There are no public setlists available yet."
                                }
                                actionLabel={activeTab === 'personal' ? "Create Your First Setlist" : undefined}
                                onAction={activeTab === 'personal' ? onCreateNew : undefined}
                            />
                        </div>
                    )}

                    {loading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-48 bg-zinc-900/50 rounded-xl animate-pulse border border-zinc-800" />
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {displayedSetlists.map(setlist => (
                            <button
                                key={setlist.id}
                                onClick={() => onSelect(setlist)}
                                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-6 text-left transition-all group relative"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {setlist.isPublic ? (
                                            <Globe className="h-4 w-4 text-green-400" />
                                        ) : (
                                            <Lock className="h-4 w-4 text-blue-400" />
                                        )}
                                        <h3 className="text-xl font-semibold truncate max-w-[200px]">{setlist.name}</h3>
                                    </div>
                                    <div className="flex gap-1">
                                        {/* Duplicate Button (Only Logged In) */}
                                        {user && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                                onClick={(e) => handleDuplicate(setlist, e)}
                                                title="Duplicate / Copy"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Transfer Button (Only Owner) */}
                                        {setlist.ownerId === user?.uid && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 hover:bg-zinc-700 text-zinc-400 hover:text-orange-400"
                                                onClick={(e) => openTransferDialog(setlist, e)}
                                                title="Transfer Ownership"
                                            >
                                                <User className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Delete button (Only Owner) */}
                                        {(!setlist.isPublic || setlist.ownerId === user?.uid) && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                                                onClick={(e) => handleDelete(setlist, e)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {setlist.isPublic && setlist.ownerName && (
                                    <div className="text-sm text-zinc-500">
                                        by {setlist.ownerName}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-3 text-zinc-500">
                                    <Calendar className="h-4 w-4" />
                                    <span className="text-sm">
                                        {(setlist.eventDate ? new Date(
                                            typeof setlist.eventDate === 'string' ? setlist.eventDate : (setlist.eventDate as any).toDate()
                                        ) : setlist.date?.toDate?.())?.toLocaleDateString() || "No date"}
                                    </span>
                                </div>
                                <div className="mt-2 text-zinc-400">
                                    {setlist.trackCount || setlist.tracks?.length || 0} songs
                                </div>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}
