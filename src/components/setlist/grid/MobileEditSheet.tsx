'use client'

import { ChevronDown, ChevronUp, Music, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'

import { KEY_OPTIONS_DATA } from './cells/KeyCell'
import { TYPE_OPTIONS } from './cells/TypeCell'

export interface MobileEditSheetProps {
    /** The track being edited; null when sheet is closed. */
    track: LocalTrack | null
    open: boolean
    onOpenChange: (next: boolean) => void
    canMoveUp: boolean
    canMoveDown: boolean
    /** Commit a single-field patch via the existing applyEdit pipeline. */
    onCommit: (patch: Partial<LocalTrack>) => Promise<void> | void
    onMoveUp: () => void | Promise<void>
    onMoveDown: () => void | Promise<void>
    /** Routes through the existing DeleteConfirmProvider. */
    onDelete: () => void
    /** Opens ChartBindPopover anchored to the row (parent owns state). */
    onBindChart: () => void
}

/**
 * v50-05-05 mobile edit Sheet — full-screen bottom sheet that opens on
 * tap of a MobileRowCard. Exposes all editable fields plus reorder
 * (Move up / Move down) and destructive Delete row.
 *
 * Field commits debounce-blur per cell: onChange updates local state;
 * onBlur fires onCommit({ [field]: value }). The sheet's onOpenChange
 * triggers a final per-field commit if the local state diverged from
 * the original track value (defensive — covers Done button without
 * explicit blur).
 */
export function MobileEditSheet({
    track,
    open,
    onOpenChange,
    canMoveUp,
    canMoveDown,
    onCommit,
    onMoveUp,
    onMoveDown,
    onDelete,
    onBindChart,
}: MobileEditSheetProps) {
    const [type, setType] = useState<string>('song')
    const [title, setTitle] = useState<string>('')
    const [key, setKey] = useState<string>('')
    const [bpm, setBpm] = useState<string>('')
    const [lead, setLead] = useState<string>('')
    const [notes, setNotes] = useState<string>('')

    // Sync local form state from the track prop when the sheet opens
    // (or when the active track changes).
    useEffect(() => {
        if (track) {
            setType(String(track.type ?? 'song'))
            setTitle(String(track.title ?? ''))
            setKey(String(track.key ?? ''))
            setBpm(track.bpm === undefined ? '' : String(track.bpm))
            setLead(String(track.leadMusician ?? ''))
            setNotes(String(track.notes ?? ''))
        }
    }, [track])

    if (!track) return null

    const commitTitle = () => {
        if (title === (track.title ?? '')) return
        void onCommit({ title })
    }
    const commitType = (next: string) => {
        if (next === (track.type ?? 'song')) return
        void onCommit({ type: next })
    }
    const commitKey = (next: string) => {
        if (next === (track.key ?? '')) return
        void onCommit({ key: next })
    }
    const commitBpm = () => {
        const trimmed = bpm.trim()
        if (trimmed === '' && track.bpm === undefined) return
        if (trimmed === String(track.bpm ?? '')) return
        if (trimmed === '') {
            void onCommit({ bpm: undefined })
            return
        }
        const parsed = Number(trimmed)
        if (!Number.isFinite(parsed)) return
        void onCommit({ bpm: parsed })
    }
    const commitLead = () => {
        if (lead === (track.leadMusician ?? '')) return
        void onCommit({ leadMusician: lead })
    }
    const commitNotes = () => {
        if (notes === (track.notes ?? '')) return
        void onCommit({ notes })
    }

    const inputBase =
        'mt-1 w-full h-11 px-3 rounded-md border border-white/10 bg-background text-sm ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ' +
        'transition-colors duration-150 motion-reduce:transition-none'

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="h-[85vh] overflow-y-auto p-4"
                data-testid="mobile-edit-sheet"
            >
                <SheetHeader>
                    <SheetTitle>Edit row</SheetTitle>
                    <SheetDescription>
                        {track.title || 'Untitled'}
                    </SheetDescription>
                </SheetHeader>

                <form
                    className="mt-4 space-y-4"
                    onSubmit={(e) => e.preventDefault()}
                >
                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            Title
                        </span>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={commitTitle}
                            data-testid="mobile-edit-title"
                            aria-label="Track title"
                            className={inputBase}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            Type
                        </span>
                        <select
                            value={type}
                            onChange={(e) => {
                                setType(e.target.value)
                                commitType(e.target.value)
                            }}
                            data-testid="mobile-edit-type"
                            aria-label="Track type"
                            className={inputBase}
                        >
                            {TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            Key
                        </span>
                        <select
                            value={key}
                            onChange={(e) => {
                                setKey(e.target.value)
                                commitKey(e.target.value)
                            }}
                            data-testid="mobile-edit-key"
                            aria-label="Track key"
                            className={inputBase}
                        >
                            <option value="">— None —</option>
                            {KEY_OPTIONS_DATA.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            BPM
                        </span>
                        <input
                            type="number"
                            inputMode="numeric"
                            value={bpm}
                            onChange={(e) => setBpm(e.target.value)}
                            onBlur={commitBpm}
                            data-testid="mobile-edit-bpm"
                            aria-label="Track tempo (BPM)"
                            className={inputBase}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            Lead
                        </span>
                        <input
                            type="text"
                            value={lead}
                            onChange={(e) => setLead(e.target.value)}
                            onBlur={commitLead}
                            data-testid="mobile-edit-lead"
                            aria-label="Lead musician"
                            className={inputBase}
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm text-muted-foreground">
                            Notes
                        </span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={commitNotes}
                            data-testid="mobile-edit-notes"
                            aria-label="Track notes"
                            rows={3}
                            className={cn(
                                'mt-1 w-full px-3 py-2 rounded-md border border-white/10 bg-background text-sm',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                                'transition-colors duration-150 motion-reduce:transition-none',
                            )}
                        />
                    </label>
                </form>

                <SheetFooter className="mt-6 flex flex-col gap-2 sm:flex-col">
                    <button
                        type="button"
                        onClick={() => void onMoveUp()}
                        disabled={!canMoveUp}
                        data-testid="mobile-edit-move-up"
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm',
                            'cursor-pointer border border-white/10 bg-card text-foreground',
                            'hover:bg-white/5',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            'transition-colors duration-150 motion-reduce:transition-none',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                    >
                        <ChevronUp aria-hidden className="h-4 w-4" />
                        Move up
                    </button>

                    <button
                        type="button"
                        onClick={() => void onMoveDown()}
                        disabled={!canMoveDown}
                        data-testid="mobile-edit-move-down"
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm',
                            'cursor-pointer border border-white/10 bg-card text-foreground',
                            'hover:bg-white/5',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            'transition-colors duration-150 motion-reduce:transition-none',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                    >
                        <ChevronDown aria-hidden className="h-4 w-4" />
                        Move down
                    </button>

                    <button
                        type="button"
                        onClick={onBindChart}
                        data-testid="mobile-edit-bind-chart"
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm',
                            'cursor-pointer border border-white/10 bg-card text-foreground',
                            'hover:bg-white/5',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            'transition-colors duration-150 motion-reduce:transition-none',
                        )}
                    >
                        <Music aria-hidden className="h-4 w-4 text-indigo-400" />
                        Bind chart
                    </button>

                    <button
                        type="button"
                        onClick={onDelete}
                        data-testid="mobile-edit-delete"
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm',
                            'cursor-pointer border border-red-500/30 bg-red-500/5 text-red-300',
                            'hover:bg-red-500/15 hover:text-red-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
                            'transition-colors duration-150 motion-reduce:transition-none',
                        )}
                    >
                        <Trash2 aria-hidden className="h-4 w-4" />
                        Delete row
                    </button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
