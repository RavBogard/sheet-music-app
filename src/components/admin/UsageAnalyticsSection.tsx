"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
    BarChart3, Users, FileMusic, ListMusic, Loader2,
    Download, TrendingUp, Music, AlertTriangle, Calendar,
} from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface AnalyticsData {
    users: { total: number; pending: number; active30d: number }
    library: { files: number; setlists: number }
    topSongs: { count: number; name: string }[]
}

interface SongAnalytics {
    dateRange: { from: string; to: string }
    topSongs: Array<{ id: string; name: string; count: number; keys: string[]; setlists: string[] }>
    neglectedSongs: Array<{ fileId: string; name: string; lastUsed: string | null; totalUses: number }>
    timeline: Array<{ month: string; totalSongs: number; uniqueSongs: number; setlistCount: number }>
    diversity: {
        totalUniqueSongs: number
        totalUses: number
        songsUsedOnce: number
        songsUsed5Plus: number
        averageUsesPerSong: number
    }
    keyDistribution: Record<string, number>
    totalSetlists: number
}

type TabId = 'overview' | 'songs' | 'timeline' | 'neglected'

export function UsageAnalyticsSection() {
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [songData, setSongData] = useState<SongAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [songLoading, setSongLoading] = useState(false)
    const [error, setError] = useState(false)
    const [activeTab, setActiveTab] = useState<TabId>('overview')
    const [exporting, setExporting] = useState(false)

    // Load basic analytics
    useEffect(() => {
        apiFetch("/api/admin/analytics")
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(setData)
            .catch(() => setError(true))
            .finally(() => setLoading(false))
    }, [])

    // Load song analytics when switching to any non-overview tab
    useEffect(() => {
        if (activeTab === 'overview' || songData) return
        setSongLoading(true)
        apiFetch("/api/admin/analytics/songs")
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(setSongData)
            .catch(() => toast.error("Failed to load song analytics"))
            .finally(() => setSongLoading(false))
    }, [activeTab, songData])

    const handleExport = useCallback(async () => {
        setExporting(true)
        try {
            const res = await apiFetch("/api/admin/analytics/export")
            if (!res.ok) throw new Error()
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `song-usage-report-${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
            toast.success("Report downloaded")
        } catch {
            toast.error("Export failed")
        } finally {
            setExporting(false)
        }
    }, [])

    const tabs: Array<{ id: TabId; label: string }> = [
        { id: 'overview', label: 'Overview' },
        { id: 'songs', label: 'Top Songs' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'neglected', label: 'Neglected' },
    ]

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Usage Analytics
                    </h2>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    disabled={exporting}
                    className="gap-1.5 text-xs"
                >
                    {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Export CSV
                </Button>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-border bg-muted/30">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'text-foreground border-b-2 border-violet-500 bg-card'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : error || !data ? (
                        <p className="text-sm text-red-500 text-center py-4">Failed to load analytics data.</p>
                    ) : (
                        <>
                            {activeTab === 'overview' && <OverviewTab data={data} />}
                            {activeTab === 'songs' && (
                                songLoading ? <LoadingState /> : songData ? <TopSongsTab data={songData} /> : null
                            )}
                            {activeTab === 'timeline' && (
                                songLoading ? <LoadingState /> : songData ? <TimelineTab data={songData} /> : null
                            )}
                            {activeTab === 'neglected' && (
                                songLoading ? <LoadingState /> : songData ? <NeglectedTab data={songData} /> : null
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    )
}

function LoadingState() {
    return (
        <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )
}

// ── Overview Tab ──

function OverviewTab({ data }: { data: AnalyticsData }) {
    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<Users className="w-5 h-5 text-blue-500" />} label="Total Users" value={data.users.total} sub={`${data.users.active30d} active this month`} />
                <StatCard icon={<Users className="w-5 h-5 text-yellow-500" />} label="Pending Users" value={data.users.pending} sub="Awaiting approval" />
                <StatCard icon={<FileMusic className="w-5 h-5 text-violet-500" />} label="Library Docs" value={data.library.files} sub="Indexed PDFs/MusicXML" />
                <StatCard icon={<ListMusic className="w-5 h-5 text-pink-500" />} label="Setlists" value={data.library.setlists} sub="Created all-time" />
            </div>

            {data.topSongs.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold mb-3 border-b border-border pb-2">Top 10 Most Used Songs</h3>
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
                </div>
            )}
        </div>
    )
}

// ── Top Songs Tab (with horizontal bar chart) ──

function TopSongsTab({ data }: { data: SongAnalytics }) {
    const maxCount = data.topSongs[0]?.count || 1

    return (
        <div className="space-y-6">
            {/* Diversity stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat
                    icon={<Music className="w-4 h-4 text-violet-500" />}
                    label="Unique Songs"
                    value={data.diversity.totalUniqueSongs}
                />
                <MiniStat
                    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                    label="Avg Uses/Song"
                    value={data.diversity.averageUsesPerSong}
                />
                <MiniStat
                    icon={<Music className="w-4 h-4 text-blue-500" />}
                    label="Played Once"
                    value={data.diversity.songsUsedOnce}
                />
                <MiniStat
                    icon={<Music className="w-4 h-4 text-amber-500" />}
                    label="Staples (5+)"
                    value={data.diversity.songsUsed5Plus}
                />
            </div>

            {/* Bar chart */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Top 25 Songs by Usage</h3>
                <div className="space-y-1.5">
                    {data.topSongs.map((song, i) => (
                        <div key={song.id} className="flex items-center gap-2 group">
                            <span className="text-[10px] text-muted-foreground w-5 text-right font-mono shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-6 rounded-md bg-violet-500/20 border border-violet-500/30 flex items-center transition-all"
                                        style={{ width: `${Math.max(4, (song.count / maxCount) * 100)}%` }}
                                    >
                                        <span className="text-[10px] font-medium text-violet-400 px-2 truncate">
                                            {song.name}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                        {song.count}×
                                    </span>
                                </div>
                            </div>
                            {song.keys.length > 0 && (
                                <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0 hidden md:block">
                                    {song.keys.join(', ')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Key Distribution */}
            {Object.keys(data.keyDistribution).length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold mb-3">Key Distribution</h3>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(data.keyDistribution)
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, count]) => (
                                <span
                                    key={key}
                                    className="text-xs font-mono bg-muted border border-border rounded-lg px-2.5 py-1"
                                >
                                    {key} <span className="text-muted-foreground">({count})</span>
                                </span>
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Timeline Tab (with recharts) ──

function TimelineTab({ data }: { data: SongAnalytics }) {
    const [ChartComponents, setChartComponents] = useState<{
        ResponsiveContainer: any
        BarChart: any
        Bar: any
        XAxis: any
        YAxis: any
        Tooltip: any
        CartesianGrid: any
        LineChart: any
        Line: any
    } | null>(null)

    const [chartError, setChartError] = useState(false)

    useEffect(() => {
        import('recharts').then(mod => {
            setChartComponents({
                ResponsiveContainer: mod.ResponsiveContainer,
                BarChart: mod.BarChart,
                Bar: mod.Bar,
                XAxis: mod.XAxis,
                YAxis: mod.YAxis,
                Tooltip: mod.Tooltip,
                CartesianGrid: mod.CartesianGrid,
                LineChart: mod.LineChart,
                Line: mod.Line,
            })
        }).catch(() => {
            setChartError(true)
        })
    }, [])

    if (chartError) {
        return <p className="text-sm text-muted-foreground text-center py-8">Failed to load charts. Try refreshing.</p>
    }

    if (!ChartComponents) {
        return <LoadingState />
    }

    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } = ChartComponents

    const timelineData = data.timeline.map(t => ({
        ...t,
        label: formatMonth(t.month),
    }))

    return (
        <div className="space-y-6">
            {/* Setlist count over time */}
            <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    Services per Month
                </h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={30} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                            />
                            <Bar dataKey="setlistCount" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="Services" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Songs per service trend */}
            <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                    Songs per Month
                </h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={30} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                            />
                            <Line type="monotone" dataKey="totalSongs" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 3 }} name="Total Songs" />
                            <Line type="monotone" dataKey="uniqueSongs" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3 }} name="Unique Songs" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Summary table */}
            <div className="text-xs text-muted-foreground">
                Showing data from {formatDateRange(data.dateRange.from)} to {formatDateRange(data.dateRange.to)}
                {' · '}{data.totalSetlists} total setlists
            </div>
        </div>
    )
}

// ── Neglected Songs Tab ──

function NeglectedTab({ data }: { data: SongAnalytics }) {
    // useState initializer to satisfy React Compiler purity rules (Date.now is impure)
    const [now] = useState(() => Date.now())

    if (data.neglectedSongs.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                <Music className="w-8 h-8 mx-auto mb-3 opacity-40" />
                No neglected songs found. Your repertoire rotation looks healthy!
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="w-4 h-4" />
                Songs not played in 90+ days
            </div>

            <div className="space-y-1">
                {data.neglectedSongs.map((song, i) => {
                    const daysSince = song.lastUsed
                        ? Math.round((now - new Date(song.lastUsed).getTime()) / (86400000))
                        : null

                    return (
                        <div key={song.fileId || i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">{song.name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-xs font-mono text-muted-foreground">
                                    {song.totalUses} use{song.totalUses !== 1 ? 's' : ''}
                                </span>
                                {daysSince !== null && (
                                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                                        daysSince > 180
                                            ? 'bg-red-500/10 text-red-500'
                                            : 'bg-amber-500/10 text-amber-500'
                                    }`}>
                                        {daysSince}d ago
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Shared Components ──

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
    return (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="mb-2 bg-background p-2 rounded-full border border-border shadow-sm">{icon}</div>
            <div className="text-2xl font-bold font-mono">{value}</div>
            <div className="text-xs font-medium mt-1 uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>
        </div>
    )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-3 flex items-center gap-3">
            <div className="bg-background p-1.5 rounded-lg border border-border">{icon}</div>
            <div>
                <div className="text-lg font-bold font-mono leading-none">{value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
            </div>
        </div>
    )
}

function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(month) - 1]} ${year.slice(2)}`
}

function formatDateRange(isoStr: string): string {
    const d = new Date(isoStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
