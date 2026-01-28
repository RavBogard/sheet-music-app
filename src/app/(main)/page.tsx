"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"

import { Button } from "@/components/ui/button"
import { Music2, Loader2, FileMusic, ListMusic, Headphones, PlayCircle, Calendar as CalendarIcon } from "lucide-react"

export default function DashboardPage() {
    const router = useRouter()
    const { user, signIn } = useAuth()
    const { driveFiles, loading, fetchFiles } = useLibraryStore()
    const { fileUrl } = useMusicStore()


    const [upcomingSetlists, setUpcomingSetlists] = useState<Setlist[]>([])

    // Setlist Service
    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user])

    // Fetch Setlists & Filter
    useEffect(() => {
        if (!setlistService) return

        let unsubscribe: () => void

        const handleSetlists = (setlists: Setlist[]) => {
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            const upcoming = setlists.filter(s => {
                if (!s.eventDate) return false
                const d = typeof s.eventDate === 'string' ? new Date(s.eventDate) : (s.eventDate as any).toDate()
                // Reset time for comparison
                d.setHours(0, 0, 0, 0)
                return d >= now
            }).sort((a, b) => {
                const da = typeof a.eventDate === 'string' ? new Date(a.eventDate) : (a.eventDate as any).toDate()
                const db = typeof b.eventDate === 'string' ? new Date(b.eventDate) : (b.eventDate as any).toDate()
                return da.getTime() - db.getTime()
            }).slice(0, 3) // Take next 3 events

            setUpcomingSetlists(upcoming)
        }

        if (user) {
            unsubscribe = setlistService.subscribeToPersonalSetlists(handleSetlists)
        } else {
            // Guest: Subscribe to PUBLIC setlists
            unsubscribe = setlistService.subscribeToPublicSetlists(handleSetlists)
        }

        return () => unsubscribe()
    }, [setlistService, user])

    useEffect(() => {
        fetchFiles()

    }, [fetchFiles])

    return (
        <div id="tour-welcome" className="flex flex-col p-4 md:p-6 gap-6 max-w-7xl mx-auto w-full">

            {/* Sync Drive Button */}
            {/* Sync Drive Button (Restricted) */}
            {user && (
                <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => fetchFiles({ force: true })} className="text-zinc-400 border-zinc-800 hover:text-white">
                        {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null} Sync Drive
                    </Button>
                </div>
            )}
            {!user && (
                <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={signIn} className="text-blue-400 border-zinc-800 hover:text-white hover:bg-blue-600">
                        Sign In for Full Access
                    </Button>
                </div>
            )}

            {/* Upcoming Events Section (Personal or Public) */}
            {upcomingSetlists.length > 0 && (
                <div id="tour-calendar-view" className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-blue-400" />
                        Upcoming Events
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {upcomingSetlists.map(setlist => {
                            const dateObj = typeof setlist.eventDate === 'string' ? new Date(setlist.eventDate) : (setlist.eventDate as any).toDate()

                            return (
                                <button
                                    key={setlist.id}
                                    onClick={() => router.push(`/setlists/${setlist.id}`)}
                                    className="bg-zinc-800 hover:bg-zinc-700 p-4 rounded-xl text-left transition-colors border border-zinc-700/50 group h-full flex flex-col"
                                >
                                    <div className="text-sm text-blue-400 font-medium mb-1">
                                        {dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className="font-semibold text-lg group-hover:text-white/90 truncate w-full mb-auto">
                                        {setlist.name}
                                    </div>
                                    <div className="text-zinc-500 text-sm mt-3 flex items-center gap-2">
                                        <ListMusic className="h-3 w-3" />
                                        {setlist.tracks?.length || 0} songs
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Song Charts (Restricted) */}
                {user && (
                    <button
                        id="tour-library-tab"
                        onClick={() => router.push('/library')}
                        className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                    >
                        <div className="bg-blue-500/20 p-6 rounded-full group-hover:bg-blue-500/30 transition-colors">
                            <FileMusic className="h-16 w-16 text-blue-400" />
                        </div>
                        <h2 className="text-3xl font-bold">Song Charts</h2>
                        <p className="text-zinc-400 text-lg">Browse {driveFiles.filter(f => !f.mimeType.startsWith('audio/')).length} charts</p>
                    </button>
                )}

                {/* Setlists (Public or Private) */}
                <button
                    id="tour-setlists-tab"
                    onClick={() => router.push('/setlists')}
                    className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                >
                    <div className="bg-green-500/20 p-6 rounded-full group-hover:bg-green-500/30 transition-colors">
                        <ListMusic className="h-16 w-16 text-green-400" />
                    </div>
                    <h2 className="text-3xl font-bold">{user ? "Setlists" : "Public Setlists"}</h2>
                    <p className="text-zinc-400 text-lg">{user ? "Manage or Import" : "View Community & Services"}</p>
                </button>

                {/* Audio Files (Restricted) */}
                {user && (
                    <button
                        onClick={() => router.push('/audio')}
                        className="bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 transition-all active:scale-95 text-center group"
                    >
                        <div className="bg-purple-500/20 p-6 rounded-full group-hover:bg-purple-500/30 transition-colors">
                            <Headphones className="h-16 w-16 text-purple-400" />
                        </div>
                        <h2 className="text-3xl font-bold">Audio Files</h2>
                        <p className="text-zinc-400 text-lg">Practice recordings</p>
                    </button>
                )}
            </div>


        </div>
    )
}
