"use client"

import { useState, useEffect } from "react"

import { BarChart3, Users, FileMusic, ListMusic, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api-client"

interface AnalyticsData {
    users: { total: number; pending: number; active30d: number }
    library: { files: number; setlists: number }
    topSongs: { count: number; name: string }[]
}

export function UsageAnalyticsSection() {
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        apiFetch("/api/admin/analytics")
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(setData)
            .catch(() => setError(true))
            .finally(() => setLoading(false))
    }, [])

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Usage Analytics
                </h2>
            </div>
            <div className="bg-card border border-border p-5 rounded-xl">
                {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : error || !data ? (
                    <p className="text-sm text-red-500 text-center py-4">Failed to load analytics data.</p>
                ) : (
                    <div className="space-y-8">
                        {/* Top Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={<Users className="w-5 h-5 text-blue-500" />} label="Total Users" value={data.users.total} sub={`${data.users.active30d} active this month`} />
                            <StatCard icon={<Users className="w-5 h-5 text-yellow-500" />} label="Pending Users" value={data.users.pending} sub="Awaiting approval" />
                            <StatCard icon={<FileMusic className="w-5 h-5 text-violet-500" />} label="Library Docs" value={data.library.files} sub="Indexed PDFs/MusicXML" />
                            <StatCard icon={<ListMusic className="w-5 h-5 text-pink-500" />} label="Setlists" value={data.library.setlists} sub="Created all-time" />
                        </div>

                        {/* Top Songs List */}
                        <div>
                            <h3 className="text-sm font-semibold mb-3 border-b border-border pb-2">Top 10 Most Used Songs (Setlist Attachments)</h3>
                            {data.topSongs.length > 0 ? (
                                <ul className="space-y-2">
                                    {data.topSongs.map((song, i) => (
                                        <li key={i} className="flex items-center justify-between text-sm py-1 hover:bg-muted/30 px-2 rounded-md transition-colors">
                                            <span className="flex items-center gap-3">
                                                <span className="text-muted-foreground w-4 font-mono text-xs text-right">{i + 1}.</span>
                                                <span className="font-medium">{song.name}</span>
                                            </span>
                                            <span className="text-xs font-mono bg-muted text-foreground px-2 py-0.5 rounded-full border border-border">{song.count} uses</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-muted-foreground">Not enough data to calculate top songs.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode, label: string, value: number, sub: string }) {
    return (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="mb-2 bg-background p-2 rounded-full border border-border shadow-sm">{icon}</div>
            <div className="text-2xl font-bold font-mono">{value}</div>
            <div className="text-xs font-medium mt-1 uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>
        </div>
    )
}
