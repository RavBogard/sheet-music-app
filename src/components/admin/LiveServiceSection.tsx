"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { Activity, Radio, Users, Settings2, Loader2, Music2 } from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, query, where, doc, getDocs } from "firebase/firestore"
import { MonitorConfig, BridgeStatus } from "@/types/monitor"
import { Badge } from "@/components/ui/badge"
import { FeaturedSetlistCard } from "@/components/admin/live/FeaturedSetlistCard"
import { formatEventDate } from "@/lib/firestore-helpers"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"

export function LiveServiceSection() {
    const { isAdmin, isBandLeader } = useAuth()
    const [loading, setLoading] = useState(true)

    // State for live metrics
    const [activeSetlists, setActiveSetlists] = useState<any[]>([])
    const [bridgeConfig, setBridgeConfig] = useState<MonitorConfig | null>(null)
    const [presenceCounts, setPresenceCounts] = useState<Record<string, number>>({})

    const canSeeLive = isAdmin || isBandLeader

    // 1. Watch Monitor Config (Bridge Status)
    const monitorConfigRef = useMemo(() => doc(db, "config", "monitor"), [])
    const { data: configData, error: configError } = useSafeFirestoreSync<MonitorConfig>(monitorConfigRef as any)

    useEffect(() => {
        if (configData) {
            setBridgeConfig(configData)
        }
    }, [configData])

    // 2. Watch Active Setlists (anything modified recently, or just grab all public ones for now, checking presence)
    const setlistsQuery = useMemo(() => query(collection(db, "setlists"), where("isPublic", "==", true)), [])
    const { data: setlistsData, loading: setlistsLoading } = useSafeFirestoreSync<any[]>(setlistsQuery as any)

    // Resolve loading once Firestore queries have returned (even if empty)
    useEffect(() => {
        if (!setlistsLoading && !setlistsData) {
            setLoading(false)
        }
    }, [setlistsLoading, setlistsData])

    useEffect(() => {
        if (!canSeeLive || !setlistsData) return

        const fetchPresence = async () => {
            try {
                const lists = setlistsData as any[]
                setActiveSetlists(lists)

                // For each setlist, fetch presence to see if it's "active"
                const counts: Record<string, number> = {}
                for (const list of lists) {
                    try {
                        const pSnap = await getDocs(collection(db, `setlists/${list.id}/presence`))
                        const count = pSnap.size
                        counts[list.id] = count
                    } catch (e) {
                        console.error("Failed to fetch presence for setlist", list.id)
                    }
                }
                setPresenceCounts(counts)
            } catch (e) {
                console.error("Failed to fetch presence data", e)
            } finally {
                setLoading(false)
            }
        }

        fetchPresence()
    }, [setlistsData, canSeeLive])

    const bridgeStatus = bridgeConfig?.bridge as BridgeStatus | undefined

    const [isBridgeOnline, setIsBridgeOnline] = useState(false)

    useEffect(() => {
        const checkStatus = () => {
            if (!bridgeStatus?.lastSeen) {
                setIsBridgeOnline(false)
                return
            }
            // Handle both raw timestamps and Firestore Timestamp objects
            const lastSeenMs = typeof bridgeStatus.lastSeen === 'number'
                ? bridgeStatus.lastSeen
                : typeof (bridgeStatus.lastSeen as any)?.toMillis === 'function'
                    ? (bridgeStatus.lastSeen as any).toMillis()
                    : 0
            setIsBridgeOnline((Date.now() - lastSeenMs) < 90000)
        }

        checkStatus()
        const interval = setInterval(checkStatus, 10000)
        return () => clearInterval(interval)
    }, [bridgeStatus])

    const isX32Connected = isBridgeOnline && bridgeStatus?.x32Connected

    // Filter to only setlists that actually have people looking at them
    const liveSetlists = activeSetlists.filter(sl => (presenceCounts[sl.id] || 0) > 0)

    if (!canSeeLive) return null

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    }

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Live Service Monitor
                </h2>
                <div className="flex items-center gap-1.5 ml-auto">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
                </div>
            </div>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Network / Bridge Status */}
                <div className="bg-card border border-border p-4 rounded-xl shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                            <Radio className="w-5 h-5" />
                        </div>
                        {isBridgeOnline ? (
                            <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Online</span>
                        ) : (
                            <span className="text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">Offline</span>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Monitor Bridge</p>
                        <h3 className="text-xl font-semibold tracking-tight">
                            {isX32Connected ? "X32 Connected" : isBridgeOnline ? "X32 Offline" : "Disconnected"}
                        </h3>
                    </div>
                    {bridgeStatus && isBridgeOnline && (
                        <div className="mt-3 text-xs text-muted-foreground font-mono flex items-center justify-between">
                            <span>{bridgeStatus.localIp || "No IP"}</span>
                            <span>Client: v{bridgeStatus.version || "2.x"}</span>
                        </div>
                    )}
                </div>

                {/* Total Active Users (in Setlists) */}
                <div className="bg-card border border-border p-4 rounded-xl shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Active Musicians</p>
                        <h3 className="text-2xl font-semibold tracking-tight">
                            {Object.values(presenceCounts).reduce((a, b) => a + b, 0)}
                        </h3>
                    </div>
                </div>

                {/* Active Services (Setlists) */}
                <div className="bg-card border border-border p-4 rounded-xl shadow-sm relative overflow-hidden group sm:col-span-2 md:col-span-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                            <Music2 className="w-5 h-5" />
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Active Sessions</p>
                        <h3 className="text-2xl font-semibold tracking-tight">
                            {liveSetlists.length}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Featured Setlist Control (Admins Only) */}
            {isAdmin && (
                <div className="mt-6">
                    <FeaturedSetlistCard activeSetlists={activeSetlists} />
                </div>
            )}

            {/* Active Sessions Detail */}
            <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">Live Sessions Detail</h3>
                {liveSetlists.length === 0 ? (
                    <div className="bg-muted/50 border border-border/50 rounded-xl p-8 text-center text-muted-foreground text-sm">
                        No active service happening right now.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {liveSetlists.map(sl => (
                            <div key={sl.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                                        <Music2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">{sl.title}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-muted-foreground">{formatEventDate(sl.date) || 'No Date'}</span>
                                            {sl.liveState?.enabled && (
                                                <Badge variant="default" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] h-4 px-1.5 border-none">
                                                    BROADCASTING
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <Users className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-semibold text-sm">{presenceCounts[sl.id]}</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Connected</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* System Log / Diagnostics placeholder */}
            <div className="mt-6 pt-6 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-muted-foreground">Diagnostics</h3>
                </div>
                <div className="bg-muted/30 border border-border/50 rounded-xl p-4">
                    <div className="text-xs font-mono text-muted-foreground space-y-2">
                        <div className="flex justify-between">
                            <span>Bridge Heartbeat Check:</span>
                            <span className={isBridgeOnline ? "text-emerald-500" : "text-muted-foreground/60"}>
                                {bridgeStatus?.lastSeen
                                    ? new Date(typeof bridgeStatus.lastSeen === 'number' ? bridgeStatus.lastSeen : typeof (bridgeStatus.lastSeen as any)?.toMillis === 'function' ? (bridgeStatus.lastSeen as any).toMillis() : 0).toLocaleTimeString()
                                    : 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>X32 Target Address:</span>
                            <span>{bridgeConfig?.x32Address || '192.168.1.X'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Buses Monitored:</span>
                            <span>{bridgeConfig?.monitorBuses?.length || 0} active</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
