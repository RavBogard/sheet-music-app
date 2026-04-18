"use client"

import { SetlistMusician } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { Sparkles, X, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface BandSuggestion {
    uid: string
    name: string
    email: string
    phone: string | null
    instrumentKey: string | null
    instrumentLabel: string | null
    schedulingTier: string
    score: number
    reasons: string[]
}

interface BandSuggestionsPanelProps {
    suggestions: BandSuggestion[]
    gap: string[]
    guidance: string | null
    loading: boolean
    musicians: SetlistMusician[]
    onChange: (musicians: SetlistMusician[]) => void
    onClose: () => void
}

export function BandSuggestionsPanel({
    suggestions,
    gap,
    guidance,
    loading,
    musicians,
    onChange,
    onClose,
}: BandSuggestionsPanelProps) {
    return (
        <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                    Smart Suggestions
                </p>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {guidance && (
                <p className="text-[11px] text-muted-foreground italic">{guidance}</p>
            )}

            {gap.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Missing: {gap.map(k => INSTRUMENT_PRESETS[k]?.label || k).join(', ')}
                </p>
            )}

            {loading ? (
                <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-purple-500/60" />
                </div>
            ) : suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No suggestions available</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => {
                        const alreadySelected = musicians.some(m => m.uid === s.uid)
                        return (
                            <button
                                key={s.uid}
                                onClick={() => {
                                    if (alreadySelected) return
                                    onChange([...musicians, {
                                        uid: s.uid,
                                        name: s.name,
                                        email: s.email,
                                        instrument: s.instrumentLabel || undefined,
                                    }])
                                    toast.success(`Added ${s.name}`)
                                }}
                                disabled={alreadySelected}
                                className={`
                                    inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs
                                    border transition-all
                                    ${alreadySelected
                                        ? 'bg-primary/10 border-primary/30 text-muted-foreground opacity-60 cursor-default'
                                        : s.schedulingTier === 'core'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground hover:bg-emerald-500/20'
                                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                                    }
                                `}
                                title={s.reasons.join(' · ')}
                            >
                                {alreadySelected ? (
                                    <Check className="h-2.5 w-2.5 text-primary" />
                                ) : (
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                        s.schedulingTier === 'core' ? 'bg-emerald-500'
                                            : s.schedulingTier === 'regular' ? 'bg-blue-500'
                                            : 'bg-muted-foreground/40'
                                    }`} />
                                )}
                                {s.name}
                                {s.instrumentLabel && (
                                    <span className="text-muted-foreground/60">{s.instrumentLabel}</span>
                                )}
                                <span className="text-[10px] text-muted-foreground/40">{s.score}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
