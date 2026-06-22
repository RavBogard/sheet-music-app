import { FileText } from 'lucide-react'
import type { LocalSong } from '@/lib/local/types'
import { splitChartComposer } from '@/lib/library/chart-composer'

/**
 * v11.7-05-02 — shared inner content for the chart-bind picker rows
 * (ChartBindPopover + ChartBindDialog render verbatim-duplicate CommandItems).
 * Renders the title as primary, the composer (from the title's trailing
 * parenthetical) as a dimmed sub-label, and a compact key badge when the local
 * mirror has `defaults.key`. Text-only, single dense line — no thumbnails.
 *
 * The CommandItem wiring (value/onSelect/data-current/aria-selected) stays in
 * each picker; this is purely the inner layout so the two stay in lockstep.
 */
export function ChartPickerItemContent({ song }: { song: LocalSong }) {
    const { title, composer } = splitChartComposer(song.title)
    const key =
        typeof song.defaults?.key === 'string' && song.defaults.key.trim()
            ? song.defaults.key.trim()
            : undefined

    return (
        <>
            <FileText
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
            />
            <span className="truncate">{title}</span>
            {composer && (
                <span className="truncate shrink min-w-0 text-xs text-muted-foreground">
                    {composer}
                </span>
            )}
            {key && (
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {key}
                </span>
            )}
        </>
    )
}
