"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, ShieldAlert, Users, Database, Repeat, CheckCircle, User, Moon, Sun, Monitor, LogOut, Settings as SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { SyncStats } from "@/lib/sync-engine"
import { PruneManager } from "@/components/admin/PruneManager"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { useTheme } from "next-themes"
import buildInfo from "@/build-info.json"

export default function UnifiedSettingsPage() {
    const { user, isAdmin, loading: authLoading, signOut } = useAuth()
    const { theme, setTheme } = useTheme()
    const router = useRouter()

    // Sync State
    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)

    const handleSync = async () => {
        if (!user) return
        setSyncing(true)
        setLastStats(null)

        try {
            const token = await user.getIdToken()
            const res = await fetch('/api/library/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setLastStats(data.stats)
            toast.success("Library Sync Complete!")

        } catch (e: unknown) {
            console.error("Sync Failed:", e)
            toast.error("Sync Failed: " + (e instanceof Error ? e.message : "Unknown error"))
        } finally {
            setSyncing(false)
        }
    }

    // Enrichment State
    const [enriching, setEnriching] = useState(false)
    const [enrichStats, setEnrichStats] = useState<any | null>(null)

    const handleEnrich = async () => {
        if (!user) return
        setEnriching(true)
        setEnrichStats(null)
        try {
            const token = await user.getIdToken()
            const res = await fetch('/api/admin/enrich', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Request failed")

            setEnrichStats(data.stats)
            if (data.message) toast.success(data.message)

        } catch (e: unknown) {
            console.error("Enrichment Failed:", e)
            toast.error("Enrichment Failed: " + e instanceof Error ? e.message : "Unknown error")
        } finally {
            setEnriching(false)
        }
    }

    if (authLoading) return (
        <div className="h-screen bg-background flex items-center justify-center">
            <Loader2 className="animate-spin text-violet-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="rounded-full hover:bg-accent md:hidden"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-3">
                            Settings
                        </h1>
                        <p className="text-muted-foreground text-sm">Profile, preferences, and workspace</p>
                    </div>
                </div>

                {/* Section: My Account */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</h2>

                    {/* Profile Card */}
                    <div className="bg-card border border-border p-5 rounded-2xl flex items-center gap-4">
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-14 h-14 rounded-full border border-border" />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center border border-border">
                                <User className="w-7 h-7 text-muted-foreground" />
                            </div>
                        )}
                        <div className="flex-1">
                            <h3 className="font-semibold text-foreground">{user?.displayName || "Musician"}</h3>
                            <p className="text-muted-foreground text-sm">{user?.email}</p>
                        </div>
                        <div className="text-xs font-mono bg-muted px-2.5 py-1 rounded-lg text-muted-foreground border border-border">
                            {isAdmin ? "ADMIN" : "MEMBER"}
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <h3 className="font-semibold text-foreground mb-3">Appearance</h3>
                        <div className="flex gap-2">
                            {[
                                { value: 'light', icon: Sun, label: 'Light' },
                                { value: 'dark', icon: Moon, label: 'Dark' },
                                { value: 'system', icon: Monitor, label: 'System' },
                            ].map(({ value, icon: Icon, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setTheme(value)}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                                        ${theme === value
                                            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/30'
                                            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border'
                                        }
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                            Performance mode always uses dark theme for stage visibility.
                        </p>
                    </div>
                </section>

                {/* Section: Musician Profile */}
                <section className="space-y-4">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Instrument</h2>
                    <div className="bg-card border border-border p-5 rounded-2xl">
                        <MusicianProfileSettings />
                    </div>
                </section>

                {/* Section: Admin Tools */}
                {isAdmin && (
                    <section className="space-y-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-violet-500" />
                            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Controls</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* User Management */}
                            <button
                                onClick={() => router.push('/settings/users')}
                                className="bg-card border border-border p-5 rounded-2xl text-left hover:border-violet-500/50 hover:bg-accent transition-all group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-500">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <ArrowLeft className="w-4 h-4 text-muted-foreground/30 rotate-180 group-hover:text-violet-500 transition-colors" />
                                </div>
                                <h3 className="font-semibold text-foreground mb-1">User Management</h3>
                                <p className="text-muted-foreground text-sm">Manage roles and approve new sign-ups</p>
                            </button>

                            {/* Library Sync */}
                            <div className="bg-card border border-border p-5 rounded-2xl">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500">
                                        <Database className="w-5 h-5" />
                                    </div>
                                    {syncing && <Loader2 className="animate-spin text-blue-500 w-4 h-4" />}
                                </div>
                                <h3 className="font-semibold text-foreground mb-1">Library Sync</h3>
                                <p className="text-muted-foreground text-sm mb-4">
                                    Sync from Google Drive to the library
                                </p>

                                <Button
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white gap-2 rounded-xl"
                                >
                                    <Repeat className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                    {syncing ? "Syncing..." : "Sync Now"}
                                </Button>

                                {lastStats && (
                                    <div className="mt-3 p-3 bg-muted/50 rounded-xl text-sm space-y-1.5 border border-border">
                                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-xs">
                                            <CheckCircle className="w-3.5 h-3.5" /> Sync Complete
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 text-muted-foreground text-xs">
                                            <span>Scanned: {lastStats.totalScanned}</span>
                                            <span>New: {lastStats.added}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* AI Enrichment */}
                            <div className="bg-card border border-border p-5 rounded-2xl">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="p-2.5 bg-teal-500/10 rounded-xl text-teal-500">
                                        <Database className="w-5 h-5" />
                                    </div>
                                    {enriching && <Loader2 className="animate-spin text-teal-500 w-4 h-4" />}
                                </div>
                                <h3 className="font-semibold text-foreground mb-1">AI Enrichment</h3>
                                <p className="text-muted-foreground text-sm mb-4">
                                    Extract keys, BPM, and metadata from PDFs
                                </p>

                                <Button
                                    onClick={handleEnrich}
                                    disabled={enriching}
                                    className="w-full bg-teal-600 hover:bg-teal-500 text-white gap-2 rounded-xl"
                                >
                                    <Repeat className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
                                    {enriching ? "Enriching..." : "Run Enrichment"}
                                </Button>
                            </div>

                            {/* Prune Manager */}
                            <PruneManager />
                        </div>
                    </section>
                )}

                {/* Log Out */}
                <div className="pt-6 pb-8 flex flex-col items-center gap-3">
                    <Button
                        onClick={() => signOut()}
                        variant="ghost"
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-2 px-8 rounded-xl"
                    >
                        <LogOut className="w-4 h-4" />
                        Log Out
                    </Button>
                    <div className="text-muted-foreground/40 text-xs">
                        v{buildInfo.version} • {buildInfo.commit?.slice(0, 7)}
                    </div>
                </div>

            </div>
        </div>
    )
}
