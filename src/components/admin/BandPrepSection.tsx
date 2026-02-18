"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { Music, CheckCircle2, Clock, Loader2 } from "lucide-react"

interface MemberPrep {
    uid: string
    name: string
    viewed: number
    total: number
    practiceSeconds: number
}

interface SetlistPrep {
    id: string
    name: string
    eventDate: string | null
    trackCount: number
    members: MemberPrep[]
}

import { formatDuration } from "@/lib/format-utils"

export function BandPrepSection() {
    const { user, isLeader } = useAuth()
    const [data, setData] = useState<SetlistPrep[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user || !isLeader) return

        const load = async () => {
            try {
                const res = await apiFetch('/api/admin/band-prep')
                if (res.ok) {
                    const json = await res.json()
                    setData(json.setlists || [])
                }
            } catch {
                // silent
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [user, isLeader])

    if (!isLeader) return null

    return (
        <CollapsibleSection
            icon={<Music className="w-4 h-4 text-blue-500" />}
            title="Band Preparation"
            badge={data.length > 0 ? (
                <span className="text-[10px] font-bold bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded-full">
                    {data.length} upcoming
                </span>
            ) : null}
        >
            {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading...
                </div>
            ) : data.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4">
                    No upcoming public setlists in the next 2 weeks.
                </p>
            ) : (
                <div className="space-y-6">
                    {data.map(setlist => (
                        <div key={setlist.id} className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm">{setlist.name}</h4>
                                {setlist.eventDate && (
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(setlist.eventDate).toLocaleDateString('en-US', {
                                            weekday: 'short', month: 'short', day: 'numeric'
                                        })}
                                    </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                    · {setlist.trackCount} charts
                                </span>
                            </div>

                            <div className="space-y-1">
                                {setlist.members.map(m => {
                                    const pct = setlist.trackCount > 0
                                        ? Math.round((m.viewed / setlist.trackCount) * 100)
                                        : 0
                                    const isComplete = m.viewed === m.total && m.total > 0

                                    return (
                                        <div key={m.uid} className="flex items-center gap-2 text-xs">
                                            <span className="w-28 truncate text-muted-foreground" title={m.name}>
                                                {m.name.split('@')[0].split(' ')[0]}
                                            </span>

                                            {/* Progress bar */}
                                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-32">
                                                <div
                                                    className={`h-full rounded-full transition-all ${
                                                        isComplete ? 'bg-green-500' :
                                                        pct > 50 ? 'bg-blue-500' :
                                                        pct > 0 ? 'bg-amber-500' : 'bg-muted-foreground/20'
                                                    }`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>

                                            <span className="w-12 text-right tabular-nums">
                                                {m.viewed}/{m.total}
                                            </span>

                                            {isComplete ? (
                                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                                            ) : (
                                                <span className="w-3" />
                                            )}

                                            {m.practiceSeconds > 0 && (
                                                <span className="flex items-center gap-0.5 text-muted-foreground ml-1">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {formatDuration(m.practiceSeconds)}
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </CollapsibleSection>
    )
}
