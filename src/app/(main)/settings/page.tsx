"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, ShieldAlert, Users, Database, Repeat, AlertTriangle, CheckCircle, User, Moon, Sun, LogOut, Settings as SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { SyncStats } from "@/lib/sync-engine"
import { PruneManager } from "@/components/admin/PruneManager"
import { useTheme } from "next-themes"

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

        } catch (e: any) {
            console.error("Sync Failed:", e)
            toast.error("Sync Failed: " + e.message)
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

        } catch (e: any) {
            console.error("Enrichment Failed:", e)
            toast.error("Enrichment Failed: " + e.message)
        } finally {
            setEnriching(false)
        }
    }

    if (authLoading) return <div className="h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="animate-spin text-purple-500" /></div>

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6 pb-24">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    {/* Back button logic: handled by Sidebar usually, but explicit back provided */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="rounded-full hover:bg-white/10 md:hidden"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <SettingsIcon className="w-8 h-8 text-zinc-400" />
                            Settings
                        </h1>
                        <p className="text-zinc-400">Manage your profile, preferences, and workspace.</p>
                    </div>
                </div>

                {/* Section: My Account (Visible to Everyone) */}
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-zinc-500 uppercase text-sm tracking-wider">My Account</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Profile Card */}
                        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="Profile" className="w-16 h-16 rounded-full border-2 border-zinc-700" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700">
                                    <User className="w-8 h-8 text-zinc-500" />
                                </div>
                            )}
                            <div>
                                <h3 className="text-lg font-bold">{user?.displayName || "Musician"}</h3>
                                <p className="text-zinc-500 text-sm">{user?.email}</p>
                                <div className="mt-2 text-xs font-mono bg-zinc-800 px-2 py-1 rounded inline-block text-zinc-400">
                                    {isAdmin ? "ADMINISTRATOR" : "MEMBER"}
                                </div>
                            </div>
                        </div>

                        {/* Appearance Card */}
                        <div
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl cursor-pointer hover:bg-zinc-800/80 transition-all flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-purple-500/10 text-purple-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                    {theme === 'dark' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Appearance</h3>
                                    <p className="text-zinc-500 text-sm">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section: Admin Tools (Protected) */}
                {isAdmin && (
                    <div className="space-y-4 pt-8 border-t border-zinc-800">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-purple-500" />
                            <h2 className="text-xl font-bold text-zinc-500 uppercase text-sm tracking-wider">Admin Controls</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Card 1: User Management */}
                            <div
                                onClick={() => router.push('/settings/users')}
                                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl cursor-pointer hover:border-purple-500/50 hover:bg-zinc-800/80 transition-all group"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <ArrowLeft className="w-5 h-5 text-zinc-600 rotate-180 group-hover:text-purple-400 transition-colors" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">User Management</h3>
                                <p className="text-zinc-400 text-sm">Manage user roles (Admin, Leader, Member) and approve new sign-ups.</p>
                            </div>

                            {/* Card 2: Library Sync */}
                            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                                        <Database className="w-6 h-6" />
                                    </div>
                                    {syncing && <Loader2 className="animate-spin text-blue-500" />}
                                </div>
                                <h3 className="text-xl font-bold mb-2">Native Library Sync</h3>
                                <p className="text-zinc-400 text-sm mb-6">
                                    Manually trigger a sync from Google Drive to the Application Database.
                                </p>

                                <Button
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white gap-2"
                                >
                                    <Repeat className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                    {syncing ? "Syncing..." : "Sync Now"}
                                </Button>

                                {lastStats && (
                                    <div className="mt-4 p-4 bg-black/40 rounded-xl text-sm space-y-2 border border-blue-500/20">
                                        <div className="flex items-center gap-2 text-green-400 font-bold">
                                            <CheckCircle className="w-4 h-4" /> Sync Complete
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-zinc-400">
                                            <span>Scan: {lastStats.totalScanned}</span>
                                            <span>New: {lastStats.added}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card 3: AI Enrichment */}
                            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-teal-500/10 rounded-xl text-teal-400">
                                        <Database className="w-6 h-6" />
                                    </div>
                                    {enriching && <Loader2 className="animate-spin text-teal-500" />}
                                </div>
                                <h3 className="text-xl font-bold mb-2">AI Enrichment</h3>
                                <p className="text-zinc-400 text-sm mb-6">
                                    Trigger AI analysis for files missing metadata (keys, BPM).
                                </p>

                                <Button
                                    onClick={handleEnrich}
                                    disabled={enriching}
                                    className="w-full bg-teal-600 hover:bg-teal-500 text-white gap-2"
                                >
                                    <Repeat className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
                                    {enriching ? "Enriching..." : "Run Enrichment"}
                                </Button>
                            </div>

                            {/* Card 4: Prune Manager (Auto-Tool) */}
                            <PruneManager />
                        </div>
                    </div>
                )}

                {/* Log Out */}
                <div className="pt-8 pb-8 flex flex-col items-center">
                    <Button
                        onClick={() => signOut()}
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2 px-8"
                    >
                        <LogOut className="w-4 h-4" />
                        Log Out
                    </Button>
                    <div className="text-zinc-700 text-xs mt-4">
                        Version 2026.01.28
                    </div>
                </div>

            </div>
        </div>
    )
}
