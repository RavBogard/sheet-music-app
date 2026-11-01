"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { Loader2 } from "lucide-react"
import { useOrg } from "@/lib/org/org-context"
import { hidesLiturgicalFields } from "@/lib/org/vocab"

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
    const t = useT()
    const fmt = useFormat()
    // TF-07: a band tenant has no parasha, holidays or Friday/Saturday services.
    const hideLiturgical = hidesLiturgicalFields(useOrg())
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
                if (!res.ok) throw new Error(t("setlist.matrixLoadFailed"))
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
    }, [type, t])

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{t("org.matrixTitle")}</h2>
                {!hideLiturgical && <select 
                    value={type} 
                    onChange={(e) => setType(e.target.value as any)}
                    className="bg-card border border-rule rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                >
                    <option value="friday_night">{t("setlist.serviceTypeFridayNight")}</option>
                    <option value="shabbat_morning">{t("setlist.serviceTypeShabbatMorning")}</option>
                </select>}
            </div>

            {error && (
                <div role="alert" className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                    {error}
                </div>
            )}

            {loading && !matrixData ? (
                <div className="h-96 flex items-center justify-center bg-card rounded-lg border border-rule">
                    <Loader2 className="w-8 h-8 animate-spin text-brand" />
                </div>
            ) : matrixData && (
                <div className="relative border border-rule rounded-lg overflow-hidden bg-card">
                    <div className="overflow-x-auto w-full pb-4">
                        <table className="w-full text-start border-collapse min-w-max">
                            <thead>
                                <tr>
                                    <th className="sticky start-0 z-20 bg-card p-4 border-b border-rule min-w-[150px]">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("setlist.matrixSlotHeader")}</span>
                                    </th>
                                    {matrixData.columns.map(col => {
                                        const d = new Date(col.date)
                                        const isPast = d.getTime() < Date.now() - 24 * 60 * 60 * 1000
                                        return (
                                            <th key={col.id} className="p-4 border-b border-rule min-w-[180px] align-top bg-muted/50">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-sm font-bold ${isPast ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                        {fmt.date(d, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    {!hideLiturgical && col.context?.holidays?.length ? (
                                                        <span className="text-xs text-brand truncate" title={col.context.holidays.join(', ')}>
                                                            {col.context.holidays[0]}
                                                        </span>
                                                    ) : !hideLiturgical && col.context?.parasha ? (
                                                        <span className="text-xs text-muted-foreground truncate" title={col.context.parasha}>
                                                            {col.context.parasha}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">{t("setlist.matrixStandard")}</span>
                                                    )}
                                                </div>
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixData.rows.map((row, rowIndex) => (
                                    <tr key={row.id} className="group hover:bg-accent/50 transition-colors border-b border-rule last:border-0">
                                        <td className="sticky start-0 z-10 bg-card text-card-foreground group-hover:bg-accent group-hover:text-accent-foreground p-4 text-sm font-medium border-e border-rule">
                                            {row.label}
                                        </td>
                                        {matrixData.columns.map(col => {
                                            const track = matrixData.grid[row.id]?.[col.id]?.track
                                            const d = new Date(col.date)
                                            const isFuture = d.getTime() > Date.now()
                                            
                                            return (
                                                <td key={col.id} className="p-3">
                                                    {track ? (
                                                        <div className="bg-muted/50 border border-rule rounded-lg p-2 flex flex-col gap-1 hover:border-brand/50 transition-colors cursor-pointer shadow-sm">
                                                            <span className="text-xs font-semibold text-foreground truncate" title={track.title}>{track.title}</span>
                                                            {track.key && <span className="text-[10px] text-brand">{track.key}</span>}
                                                        </div>
                                                    ) : isFuture ? (
                                                        <div className="h-full min-h-[48px] rounded-lg border border-dashed border-rule hover:border-brand/40 bg-transparent flex items-center justify-center cursor-pointer transition-colors opacity-0 group-hover:opacity-100 group-hover:bg-brand/5">
                                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t("setlist.matrixPlan")}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="h-full min-h-[48px] rounded-lg border border-rule bg-transparent"></div>
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
