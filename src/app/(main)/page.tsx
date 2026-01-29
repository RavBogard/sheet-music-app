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

    const tonightSetlist = upcomingSetlists[0]

    return (
        <div id="tour-welcome" className="flex flex-col p-4 md:p-6 gap-6 max-w-lg mx-auto w-full pb-24">

            {/* 1. Hero Card: Tonight's Setlist */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Sheet Music Manager
                    </h2>
                    {/* Sync Status / Offline Indicator could go here */}
                </div>

                {tonightSetlist ? (
                    <div
                        onClick={() => router.push(`/setlists/${tonightSetlist.id}`)}
                        className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-purple-700 rounded-3xl p-6 shadow-2xl active:scale-[0.98] transition-all cursor-pointer group border border-white/10"
                    >
                        {/* Background Deco */}
                        <div className="absolute -right-10 -bottom-10 opacity-20">
                            <Music2 className="w-48 h-48 rotate-12" />
                        </div>

                        <div className="relative z-10 flex flex-col items-start gap-4">
                            <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white mb-2">
                                UPCOMING
                            </div>

                            <h3 className="text-3xl font-black text-white leading-tight max-w-[80%]">
                                {tonightSetlist.name}
                            </h3>

                            <div className="flex items-center gap-4 text-blue-100 font-medium">
                                <span className="flex items-center gap-1.5">
                                    <CalendarIcon className="w-4 h-4" />
                                    {new Date(tonightSetlist.eventDate as string).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <ListMusic className="w-4 h-4" />
                                    {tonightSetlist.tracks?.length || 0} Songs
                                </span>
                            </div>

                            <Button className="mt-4 w-full bg-white text-blue-600 hover:bg-blue-50 font-bold text-lg h-12 rounded-xl shadow-lg">
                                <PlayCircle className="w-5 h-5 mr-2 fill-current" />
                                Open Setlist
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 text-center flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center">
                            <CalendarIcon className="w-8 h-8 text-zinc-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">No Upcoming Gigs</h3>
                            <p className="text-zinc-400">Time to practice or create a new setlist!</p>
                        </div>
                        <Button variant="outline" onClick={() => router.push('/setlists')} className="rounded-full">
                            Browse All Setlists
                        </Button>
                    </div>
                )}
            </div>

            {/* 2. Quick Links: Big & Chunky */}
            <div className="grid grid-cols-2 gap-4">
                <button
                    id="tour-library-tab"
                    onClick={() => router.push('/library')}
                    className="bg-zinc-800/50 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all active:scale-95 text-center group aspect-square"
                >
                    <div className="bg-blue-500/20 p-4 rounded-2xl group-hover:bg-blue-500/30 transition-colors">
                        <FileMusic className="h-10 w-10 text-blue-400" />
                    </div>
                    <span className="text-lg font-bold">Library</span>
                </button>

                <button
                    id="tour-setlists-tab"
                    onClick={() => router.push('/setlists')}
                    className="bg-zinc-800/50 hover:bg-zinc-800 border-2 border-zinc-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all active:scale-95 text-center group aspect-square"
                >
                    <div className="bg-green-500/20 p-4 rounded-2xl group-hover:bg-green-500/30 transition-colors">
                        <ListMusic className="h-10 w-10 text-green-400" />
                    </div>
                    <span className="text-lg font-bold">Setlists</span>
                </button>
            </div>

            {/* 3. Recent / Secondary Actions */}
            {user && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider px-2">Recently Added</h3>
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/50">
                        {driveFiles.slice(0, 3).map(file => (
                            <div
                                key={file.id}
                                onClick={() => router.push(`/perform/${file.id}`)}
                                className="p-4 flex items-center gap-4 hover:bg-white/5 cursor-pointer transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                            >
                                <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
                                    <Music2 className="w-5 h-5 text-zinc-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium truncate">{file.name.replace(/\.[^/.]+$/, "")}</h4>
                                    <p className="text-xs text-zinc-500">Added recently</p>
                                </div>
                                <PlayCircle className="w-5 h-5 text-zinc-600" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sign In Prompt for Guests */}
            {!user && (
                <div className="mt-8 text-center space-y-4">
                    <p className="text-zinc-400">Sign in to access your full library and create personal setlists.</p>
                    <Button onClick={signIn} className="w-full h-12 rounded-xl text-lg font-bold">
                        Sign In
                    </Button>
                </div>
            )}

        </div>
    )
}
