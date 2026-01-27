"use client"

import { useState, useEffect, useMemo } from "react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, Plus, FileText, Trash2, Calendar, LogIn, LogOut, User, Globe, Lock, Copy } from "lucide-react"
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

    // Create user-specific service when user is available
    const setlistService = useMemo(() => {
        if (user) {
            return createSetlistService(user.uid, user.displayName)
        }
        return null
    }, [user])

    // Subscribe to personal setlists
    useEffect(() => {
        if (!setlistService) {
            setLoading(false)
            return
        }

        setLoading(true)
        const unsubscribe = setlistService.subscribeToPersonalSetlists((data) => {
            setPersonalSetlists(data)
            setLoading(false)
        })
        return () => unsubscribe()
    }, [setlistService])

    // Subscribe to public setlists
    useEffect(() => {
        if (!setlistService) return

        const unsubscribe = setlistService.subscribeToPublicSetlists((data) => {
            setPublicSetlists(data)
        })
        return () => unsubscribe()
    }, [setlistService])

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
            {/* ... Header ... */}

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

            {/* ... Tabs ... */}

            <ScrollArea className="flex-1 p-6">
                {/* ... Loading/Empty States ... */}

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
                                    {/* Duplicate Button (Available to everyone) */}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                        onClick={(e) => handleDuplicate(setlist, e)}
                                        title="Duplicate / Copy"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>

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
                                    {setlist.date?.toDate?.()?.toLocaleDateString() || "No date"}
                                </span>
                            </div>
                            <div className="mt-2 text-zinc-400">
                                {setlist.trackCount || setlist.tracks?.length || 0} songs
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
