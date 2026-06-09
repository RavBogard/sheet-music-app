"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { label as orgLabel } from "@/lib/org/vocab"
import { Loader2 } from "lucide-react"

interface MatrixColumn {
    id: string
    date: string
    context?: {
        parasha?: string
        holidays?: string[]
        hebrewDate?: string
    }
}

interface MatrixRow {
    id: string
    label: string
    queries: string[]
    type: string
}

interface MatrixData {
    columns: MatrixColumn[]
    rows: MatrixRow[]
    grid: Record<string, Record<string, { track: any | null }>>
}

export function SetlistMatrixView() {
    const { user } = useAuth()
    const org = useOrg()
    const [matrixData, setMatrixData] = useState<MatrixData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [type, setType] = useState<'friday_night' | 'shabbat_morning'>('friday_night')

    useEffect(() => {
        let isMounted = true
        
        async function fetchMatrix() {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(`/api/setlists/matrix?type=${type}`)
                if (!res.ok) throw new Error("Failed to load matrix data")
                const data = await res.json()
                if (isMounted) {
                    setMatrixData(data)
                }
            } catch (err: any) {
                if (isMounted) setError(err.message)
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        fetchMatrix()

        return () => { isMounted = false }
    }, [type])

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{orgLabel(org, 'matrixTitle')}</h2>
                <select 
                    value={type} 
                    onChange={(e) => setType(e.target.value as any)}
                    className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                >
                    <option value="friday_night">Friday Night</option>
                    <option value="shabbat_morning">Shabbat Morning</option>
                </select>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                    {error}
                </div>
            )}

            {loading && !matrixData ? (
                <div className="h-96 flex items-center justify-center bg-black/20 rounded-2xl border border-white/5">
                    <Loader2 className="w-8 h-8 animate-spin text-brand" />
                </div>
            ) : matrixData && (
                <div className="relative border border-white/5 rounded-2xl overflow-hidden bg-black/20">
                    <div className="overflow-x-auto w-full pb-4">
                        <table className="w-full text-left border-collapse min-w-max">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-20 bg-black/80 backdrop-blur-md p-4 border-b border-white/10 min-w-[150px]">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Liturgical Slot</span>
                                    </th>
                                    {matrixData.columns.map(col => {
                                        const d = new Date(col.date)
                                        const isPast = d.getTime() < Date.now() - 24 * 60 * 60 * 1000
                                        return (
                                            <th key={col.id} className="p-4 border-b border-white/10 min-w-[180px] align-top bg-white/[0.01]">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-sm font-bold ${isPast ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    {col.context?.holidays?.length ? (
                                                        <span className="text-xs text-brand truncate" title={col.context.holidays.join(', ')}>
                                                            {col.context.holidays[0]}
                                                        </span>
                                                    ) : col.context?.parasha ? (
                                                        <span className="text-xs text-blue-400/80 truncate" title={col.context.parasha}>
                                                            {col.context.parasha}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Standard</span>
                                                    )}
                                                </div>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixData.rows.map((row, rowIndex) => (
                                    <tr key={row.id} className="group hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                                        <td className="sticky left-0 z-10 bg-black/60 backdrop-blur-md group-hover:bg-black p-4 text-sm font-medium border-r border-white/5">
                                            {row.label}
                                        </td>
                                        {matrixData.columns.map(col => {
                                            const track = matrixData.grid[row.id]?.[col.id]?.track
                                            const d = new Date(col.date)
                                            const isFuture = d.getTime() > Date.now()
                                            
                                            return (
                                                <td key={col.id} className="p-3">
                                                    {track ? (
                                                        <div className="bg-white/[0.05] border border-white/10 rounded-lg p-2 flex flex-col gap-1 hover:border-brand/50 transition-colors cursor-pointer shadow-sm">
                                                            <span className="text-xs font-semibold text-foreground truncate" title={track.title}>{track.title}</span>
                                                            {track.key && <span className="text-[10px] text-brand">{track.key}</span>}
                                                        </div>
                                                    ) : isFuture ? (
                                                        <div className="h-full min-h-[48px] rounded-lg border border-dashed border-white/10 hover:border-brand/40 bg-transparent flex items-center justify-center cursor-pointer transition-colors opacity-0 group-hover:opacity-100 group-hover:bg-brand/5">
                                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">+ Plan</span>
                                                        </div>
                                                    ) : (
                                                        <div className="h-full min-h-[48px] rounded-lg border border-white/5 bg-transparent"></div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
