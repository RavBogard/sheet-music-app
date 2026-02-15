"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { getContextualGreeting } from "@/lib/greeting"
import { toDate, getRelativeDateLabel, formatEventDate } from "@/lib/firestore-helpers"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Loader2,
    FileMusic,
    ListMusic,
    PlayCircle,
    CalendarDays,
    Plus,
    Send,
    Sparkles,
    ArrowRight,
    Music2,
    ChevronRight,
} from "lucide-react"
import { useChatStore } from "@/lib/chat-store"

export default function DashboardPage() {
    const router = useRouter()
    const { user, signIn, isMember, isLeader } = useAuth()
    const { loadLibrary } = useLibraryStore()
    const { fileUrl } = useMusicStore()

    const [upcomingSetlists, setUpcomingSetlists] = useState<Setlist[]>([])
    const [recentPublicSetlists, setRecentPublicSetlists] = useState<Setlist[]>([])

    // Greeting
    const greeting = useMemo(() => {
        const firstName = user?.displayName?.split(' ')[0] || null
        return getContextualGreeting(firstName)
    }, [user?.displayName])

    // Setlist Service
    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user])

    // Fetch upcoming setlists (personal or public)
    useEffect(() => {
        if (!setlistService) return

        let unsubPersonal: (() => void) | null = null
        let unsubPublic: (() => void) | null = null

        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const filterUpcoming = (setlists: Setlist[]) => {
            return setlists.filter(s => {
                if (!s.eventDate) return false
                const d = toDate(s.eventDate)
                if (!d) return false
                d.setHours(0, 0, 0, 0)
                return d >= now
            }).sort((a, b) => {
                const da = toDate(a.eventDate)
                const db = toDate(b.eventDate)
                return (da?.getTime() || 0) - (db?.getTime() || 0)
            })
        }

        if (user) {
            unsubPersonal = setlistService.subscribeToPersonalSetlists((setlists) => {
                setUpcomingSetlists(filterUpcoming(setlists).slice(0, 3))
            })
        }

        // Always subscribe to public setlists (for fallback + guests)
        unsubPublic = setlistService.subscribeToPublicSetlists((setlists) => {
            const upcoming = filterUpcoming(setlists)
            // For the "recent public" section, show all public with dates (upcoming first, then recent)
            const recent = setlists
                .filter(s => s.eventDate)
                .sort((a, b) => {
                    const da = toDate(a.eventDate)
                    const db = toDate(b.eventDate)
                    return (db?.getTime() || 0) - (da?.getTime() || 0)
                })
                .slice(0, 5)
            setRecentPublicSetlists(recent)

            // For guests, use public upcoming setlists
            if (!user) {
                setUpcomingSetlists(upcoming.slice(0, 3))
            }
        })

        return () => {
            unsubPersonal?.()
            unsubPublic?.()
        }
    }, [setlistService, user])

    useEffect(() => {
        loadLibrary()
    }, [loadLibrary])

    const tonightSetlist = upcomingSetlists[0]
    const additionalUpcoming = upcomingSetlists.slice(1)

    return (
        <div className="flex flex-col p-4 md:p-6 gap-8 max-w-lg mx-auto w-full pb-28">

            {/* ── Branding + Greeting ── */}
            <div className="pt-2 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <img
                        src="/logo.jpg"
                        alt="CRC Music"
                        className="w-10 h-10 rounded-full border border-border"
                    />
                    <span className="text-sm font-semibold text-muted-foreground tracking-wide">
                        CentralReform.live
                    </span>
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                        {greeting.text}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {greeting.hebrewDate}
                    </p>
                </div>
            </div>

            {/* ── Hero: Next Setlist ── */}
            {tonightSetlist ? (
                <div className="flex flex-col gap-3">
                    <SetlistHeroCard
                        setlist={tonightSetlist}
                        onClick={() => router.push(`/setlists/${tonightSetlist.id}${tonightSetlist.isPublic && !user ? '?public=true' : ''}`)}
                    />

                    {/* Additional upcoming */}
                    {additionalUpcoming.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {additionalUpcoming.map(s => (
                                <SetlistCompactCard
                                    key={s.id}
                                    setlist={s}
                                    onClick={() => router.push(`/setlists/${s.id}${s.isPublic && !user ? '?public=true' : ''}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* No upcoming → show recent public setlists */
                <div className="flex flex-col gap-3">
                    {recentPublicSetlists.length > 0 ? (
                        <>
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Recent Setlists
                            </h2>
                            {recentPublicSetlists.slice(0, 3).map(s => (
                                <SetlistCompactCard
                                    key={s.id}
                                    setlist={s}
                                    onClick={() => router.push(`/setlists/${s.id}${s.isPublic ? '?public=true' : ''}`)}
                                />
                            ))}
                        </>
                    ) : (
                        <div className="bg-card rounded-2xl p-6 text-center border border-border">
                            <p className="text-muted-foreground">No setlists yet</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Quick Actions ── */}
            {(isMember || user) && (
                <div className={`grid gap-3 ${isLeader ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <QuickAction
                        icon={FileMusic}
                        label="Library"
                        color="blue"
                        onClick={() => router.push('/library')}
                    />
                    <QuickAction
                        icon={ListMusic}
                        label="Setlists"
                        color="emerald"
                        onClick={() => router.push('/setlists')}
                    />
                    {isLeader && (
                        <QuickAction
                            icon={Plus}
                            label="New Setlist"
                            color="violet"
                            onClick={() => router.push('/setlists/new')}
                        />
                    )}
                </div>
            )}

            {/* ── AI Prompt (compact, for members) ── */}
            {isMember && <CompactAIPrompt />}

            {/* ── Guest Sign-In Invitation ── */}
            {!user && (
                <div className="bg-card rounded-2xl p-5 text-center space-y-3 border border-border">
                    <p className="text-muted-foreground text-sm">
                        Sign in to access the full library, create setlists, and use AI tools.
                    </p>
                    <Button
                        onClick={signIn}
                        className="w-full h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90"
                    >
                        Sign In
                    </Button>
                </div>
            )}
        </div>
    )
}


/* ─── Sub-Components ─── */

function SetlistHeroCard({ setlist, onClick }: { setlist: Setlist; onClick: () => void }) {
    const dateLabel = getRelativeDateLabel(setlist.eventDate) || 'Upcoming'

    return (
        <button
            onClick={onClick}
            className="w-full text-left bg-gradient-to-br from-indigo-600/90 to-violet-600/90 rounded-2xl p-5 shadow-lg active:scale-[0.98] transition-all group border border-white/10"
        >
            <div className="flex items-start justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-white">
                    <CalendarDays className="w-3 h-3" />
                    {dateLabel}
                </span>
                <span className="text-white/60 text-xs font-medium">
                    {setlist.tracks?.length || 0} songs
                </span>
            </div>

            <h3 className="text-xl font-bold text-white leading-snug mb-4">
                {setlist.name}
            </h3>

            <div className="flex items-center gap-2 text-white/90 text-sm font-medium group-hover:text-white transition-colors">
                <PlayCircle className="w-4 h-4" />
                Open Setlist
                <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </button>
    )
}


function SetlistCompactCard({ setlist, onClick }: { setlist: Setlist; onClick: () => void }) {
    const eventDate = toDate(setlist.eventDate)

    const dateStr = eventDate
        ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : ''

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 bg-card hover:bg-accent rounded-xl px-4 py-3 transition-colors text-left group border border-border"
        >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">{setlist.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {dateStr && <span>{dateStr}</span>}
                    <span>{setlist.tracks?.length || 0} songs</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
        </button>
    )
}


function QuickAction({ icon: Icon, label, color, onClick }: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: 'blue' | 'emerald' | 'violet'
    onClick: () => void
}) {
    const colorMap = {
        blue: 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/15',
        emerald: 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/15',
        violet: 'bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/15',
    }

    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center gap-2 py-4 px-3 bg-card hover:bg-accent rounded-xl transition-all active:scale-95 group border border-border"
        >
            <div className={`p-2.5 rounded-lg transition-colors ${colorMap[color]}`}>
                <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                {label}
            </span>
        </button>
    )
}


function CompactAIPrompt() {
    const { open, setPendingPrompt } = useChatStore()
    const [input, setInput] = useState("")

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!input.trim()) return
        setPendingPrompt(input)
        open()
        setInput("")
    }

    const quickPrompts = [
        "Create Shabbat Setlist",
        "Find a Song",
        "Schedule Friday",
    ]

    return (
        <div className="flex flex-col gap-2.5">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Cantor AI..."
                        className="bg-muted border-border h-10 rounded-xl pl-9 text-sm focus-visible:ring-violet-500/30 focus-visible:border-violet-500/40 placeholder:text-muted-foreground/60"
                    />
                </div>
                <Button
                    type="submit"
                    size="icon"
                    className="h-10 w-10 rounded-xl bg-violet-600 hover:bg-violet-500 shrink-0"
                    disabled={!input.trim()}
                >
                    <Send className="w-4 h-4" />
                </Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                            setPendingPrompt(prompt)
                            open()
                        }}
                        className="text-[11px] bg-muted hover:bg-accent text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full border border-border transition-colors"
                    >
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    )
}
