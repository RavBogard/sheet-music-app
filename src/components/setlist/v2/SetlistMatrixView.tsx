"use client"

import { useEffect, useState } from "react"
import { Loader2, Sparkles, AlertTriangle } from "lucide-react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/lib/chat-store"
import { cn } from "@/lib/utils"

interface MatrixData {
    columns: Array<{
        id: string
        date: string
        context: { holiday: string | null; parasha: string | null }
    }>
    rows: Array<{
        id: string
        label: string
        queries: string[]
        type: string
    }>
    grid: Record<string, Record<string, { track: any | null }>>
}

export function SetlistMatrixView() {
    const [data, setData] = useState<MatrixData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const chatStore = useChatStore()

    useEffect(() => {
        async function fetchMatrix() {
            try {
                const res = await fetch('/api/setlists/matrix?type=friday_night')
                if (!res.ok) throw new Error("Failed to fetch matrix")
                const json = await res.json()
                setData(json)
            } catch (e: any) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        }
        fetchMatrix()
    }, [])

    const handleCellClick = (rowLabel: string, colContext: any) => {
        // Open the AI drawer to suggest a song tailored to this parasha/holiday
        let contextDesc = "an upcoming regular service"
        if (colContext.holiday) contextDesc = `the holiday of ${colContext.holiday}`
        else if (colContext.parasha) contextDesc = `Parashat ${colContext.parasha}`

        const prompt = `Suggest historically appropriate or fresh repertoire choices for the "${rowLabel}" slot for ${contextDesc}. Give me 3 distinct options to choose from, avoiding ones we've overplayed recently in the matrix.`

        chatStore.setContextData({
            ...chatStore.contextData,
            matrixContext: data || undefined
        })

        chatStore.setPendingPrompt(prompt)
        chatStore.open()
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>Analyzing 8-week rotational data...</p>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-400">
                <AlertTriangle className="w-8 h-8 mb-4 opacity-50" />
                <p>Could not build the matrix: {error}</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full h-full bg-background overflow-hidden p-3 md:p-6 rounded-xl border border-border">
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-500" /> Liturgical Matrix
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Past 3 weeks and upcoming 4 weeks of Friday Night rotation.
                    </p>
                </div>
            </div>

            <ScrollArea className="flex-1 border rounded-lg overflow-hidden bg-card/30" type="always">
                <div className="flex flex-col min-w-max">
                    {/* Header Row */}
                    <div className="flex sticky top-0 z-20 bg-background/95 backdrop-blur border-b shadow-sm">
                        <div className="w-40 md:w-64 shrink-0 flex items-center px-3 md:px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground sticky left-0 z-30 bg-background/95 backdrop-blur border-r">
                            Service Elements
                        </div>
                        {data.columns.map(col => {
                            const date = new Date(col.date)
                            const isPast = date < new Date()
                            return (
                                <div key={col.id} className={cn(
                                    "w-48 shrink-0 flex flex-col justify-center px-4 py-3 border-r text-center",
                                    isPast ? "bg-muted/30" : "bg-blue-500/5"
                                )}>
                                    <span className="text-sm font-bold truncate">
                                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest truncate mt-0.5">
                                        {col.context.holiday || col.context.parasha || "Shabbat"}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Body Rows */}
                    {data.rows.map((row) => {
                        // Let's calculate repetition threshold (e.g., if >3 times in last 4 weeks)
                        return (
                            <div key={row.id} className="flex border-b last:border-b-0 group">
                                <div className="w-40 md:w-64 shrink-0 flex items-center px-3 md:px-4 py-4 font-medium sticky left-0 z-10 bg-background/95 backdrop-blur border-r group-hover:bg-muted/20 transition-colors">
                                    <span className="truncate">{row.label}</span>
                                </div>
                                {data.columns.map(col => {
                                    const cell = data.grid[row.id]?.[col.id]
                                    const track = cell?.track
                                    const isPast = new Date(col.date) < new Date()

                                    return (
                                        <div
                                            key={`${row.id}-${col.id}`}
                                            className={cn(
                                                "w-48 shrink-0 flex items-center px-3 py-3 border-r relative group/cell hover:bg-muted/40 transition-colors",
                                                isPast ? "" : "cursor-pointer"
                                            )}
                                            onClick={() => !isPast && !track ? handleCellClick(row.label, col.context) : null}
                                        >
                                            {track ? (
                                                <div className="w-full flex flex-col">
                                                    <span className={cn(
                                                        "text-sm font-medium leading-tight truncate",
                                                        isPast ? "text-foreground" : "text-blue-500 font-bold"
                                                    )}>
                                                        {track.title}
                                                    </span>
                                                    {(track.leadMusician || track.performer) && (
                                                        <span className="text-[10px] text-muted-foreground truncate mt-0.5 uppercase tracking-wide">
                                                            P: {track.leadMusician || track.performer}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                    {!isPast && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-[10px] text-blue-500 hover:text-blue-600 font-bold"
                                                        >
                                                            <Sparkles className="w-3 h-3 mr-1" /> Suggest
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    )
}
