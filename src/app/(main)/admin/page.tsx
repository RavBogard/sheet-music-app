"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, ShieldAlert, Users, Database, Repeat, AlertTriangle, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { SyncStats } from "@/lib/sync-engine"
import { PruneManager } from "@/components/admin/PruneManager"

export default function AdminDashboardPage() {
    const { user, isAdmin, loading: authLoading } = useAuth()
    const router = useRouter()

    // Sync State
    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)

    // Security Check
    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push("/")
        }
    }, [authLoading, isAdmin, router])

    const handleSync = async () => {
        if (!user) return
        setSyncing(true)
        setLastStats(null)

        try {
            const token = await user.getIdToken()
            const res = await fetch('/api/library/sync', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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
    if (!isAdmin) return null

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/settings")}
                        className="rounded-full hover:bg-white/10"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <ShieldAlert className="w-8 h-8 text-purple-400" />
                            Admin Dashboard
                        </h1>
                        <p className="text-zinc-400">Control center for application management.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Card 1: User Management */}
                    <div
                        onClick={() => router.push('/admin/users')}
                        className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl cursor-pointer hover:border-purple-500/50 hover:bg-zinc-800/80 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
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
                            Manually trigger a sync from Google Drive to the Application Database. Run this if new files are missing.
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
                                    <span>Scanned: {lastStats.totalScanned}</span>
                                    <span>Added: {lastStats.added}</span>
                                    <span>Updated: {lastStats.updated}</span>
                                    <span className={lastStats.errors > 0 ? "text-red-400" : ""}>Errors: {lastStats.errors}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 3: AI Enrichment */}
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-teal-500/10 rounded-xl text-teal-400">
                                <Database className="w-6 h-6" /> {/* Reusing Icon or find Sparkles */}
                            </div>
                            {enriching && <Loader2 className="animate-spin text-teal-500" />}
                        </div>
                        <h3 className="text-xl font-bold mb-2">AI Enrichment</h3>
                        <p className="text-zinc-400 text-sm mb-6">
                            Manually trigger AI analysis for files that are missing metadata (keys, BPM). Scans 10 files per run.
                        </p>

                        <Button
                            onClick={handleEnrich}
                            disabled={enriching}
                            className="w-full bg-teal-600 hover:bg-teal-500 text-white gap-2"
                        >
                            <Repeat className={`w-4 h-4 ${enriching ? 'animate-spin' : ''}`} />
                            {enriching ? "Enriching..." : "Run Enrichment Batch"}
                        </Button>

                        {enrichStats && (
                            <div className="mt-4 p-4 bg-black/40 rounded-xl text-sm space-y-2 border border-teal-500/20">
                                <div className="flex items-center gap-2 text-green-400 font-bold">
                                    <CheckCircle className="w-4 h-4" /> Batch Complete
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-zinc-400">
                                    <span>Scanned: {enrichStats.total}</span>
                                    <span>Success: {enrichStats.success}</span>
                                    <span>Skipped: {enrichStats.skipped}</span>
                                    <span className={enrichStats.failed > 0 ? "text-red-400" : ""}>Failed: {enrichStats.failed}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card 4: Prune Manager */}
                    <PruneManager />
                </div>
            </div>
        </div>
    )
}
