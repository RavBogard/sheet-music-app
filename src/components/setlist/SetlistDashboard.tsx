"use client"

import { useState, useEffect, useMemo } from "react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, Plus, FileText, Trash2, Calendar, LogIn, LogOut, User, Globe, Lock, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

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

    const handleCopyToPersonal = async (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService) return

        try {
            await setlistService.copyToPersonal(setlist.id, setlist)
            alert(`"${setlist.name}" copied to your personal setlists!`)
            setActiveTab('personal')
        } catch (err) {
            console.error("Copy failed:", err)
            alert("Failed to copy setlist")
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
                        <User className="h-16 w-16 mx-auto mb-4 text-zinc-600" />
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
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <h1 className="text-2xl font-bold flex-1">Setlists</h1>

                {/* User Info & Sign Out */}
                {user && (
                    <div className="flex items-center gap-3">
                        <img
                            src={user.photoURL || undefined}
                            alt=""
                            className="w-8 h-8 rounded-full"
                        />
                        <span className="text-sm text-zinc-400 hidden md:block">
                            {user.displayName}
                        </span>
                        <Button onClick={signOut} variant="ghost" size="sm" className="gap-1">
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                <Button onClick={onImport} className="h-12 px-6 gap-2">
                    <FileText className="h-5 w-5" />
                    Import
                </Button>
                <Button onClick={onCreateNew} variant="outline" className="h-12 px-6 gap-2">
                    <Plus className="h-5 w-5" />
                    New
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('personal')}
                    className={`flex-1 py-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'personal'
                        ? 'text-white border-b-2 border-blue-500'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <Lock className="h-4 w-4" />
                    My Setlists ({personalSetlists.length})
                </button>
                <button
                    onClick={() => setActiveTab('public')}
                    className={`flex-1 py-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'public'
                        ? 'text-white border-b-2 border-green-500'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    <Globe className="h-4 w-4" />
                    Public Setlists ({publicSetlists.length})
                </button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 p-6">
                {(loading || authLoading) && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-xl text-zinc-500">Loading setlists...</div>
                    </div>
                )}

                {!loading && !authLoading && displayedSetlists.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="text-xl text-zinc-500">
                            {activeTab === 'personal' ? 'No personal setlists yet' : 'No public setlists yet'}
                        </div>
                        {activeTab === 'personal' && (
                            <Button onClick={onImport} size="lg" className="gap-2">
                                <FileText className="h-5 w-5" />
                                Import your first setlist
                            </Button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedSetlists.map(setlist => (
                        <button
                            key={setlist.id}
                            onClick={() => onSelect(setlist)}
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-6 text-left transition-all group"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    {setlist.isPublic ? (
                                        <Globe className="h-4 w-4 text-green-400" />
                                    ) : (
                                        <Lock className="h-4 w-4 text-blue-400" />
                                    )}
                                    <h3 className="text-xl font-semibold truncate">{setlist.name}</h3>
                                </div>
                                <div className="flex gap-1">
                                    {/* Copy button for public setlists not owned by user */}
                                    {setlist.isPublic && setlist.ownerId !== user?.uid && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-300"
                                            onClick={(e) => handleCopyToPersonal(setlist, e)}
                                            title="Copy to my setlists"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {/* Delete button (only for owner) */}
                                    {(!setlist.isPublic || setlist.ownerId === user?.uid) && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                                            onClick={(e) => handleDelete(setlist, e)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {setlist.isPublic && setlist.ownerName && (
                                <div className="text-sm text-zinc-500 mt-1">
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
