'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    Copy,
    Edit3,
    FileText,
    GripVertical,
    Music,
    Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'
import { KEY_OPTIONS_DATA } from './cells/KeyCell'

export interface MobileRowCardProps {
    track: LocalTrack
    isEditing?: boolean
    /** Plain card tap (no modifier) — toggles inline editing. */
    onTap: () => void
    onContextEditRow: () => void
    onContextBindChart: () => void
    onContextDuplicate: () => void
    onContextDelete: () => void
    onCommit?: (patch: Partial<LocalTrack>) => Promise<void> | void
    onDeleteRow?: () => void
}

/**
 * v50-05-05 mobile card row — REPURPOSED as the single render path
 * post-0ec6773c (no desktop table).
 *
 * T1.1 fix (2026-05-12, Bug 4):
 *  - Grip is now a real drag handle via @dnd-kit's useSortable, not a
 *    multi-select toggle. Spreads {...attributes} + {...listeners} on
 *    the button so dnd-kit can drag-activate without dragging the whole
 *    card on tap.
 *  - Removed Move Up / Move Down buttons from the inline edit pane
 *    (drag is the only reorder UI).
 *  - Removed multi-select wiring (`isSelected`, `onSelectionClick`,
 *    `isInBulkSelection`, `bulkSelectionCount`). The grip click no
 *    longer toggles selection; multi-select isn't a feature anymore.
 */
export function MobileRowCard({
    track,
    isEditing,
    onTap,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
    onCommit,
    onDeleteRow,
}: MobileRowCardProps) {
    const [title, setTitle] = useState(String(track.title ?? ''))
    const [key, setKey] = useState(String(track.key ?? ''))
    const [bpm, setBpm] = useState(track.bpm === undefined ? '' : String(track.bpm))
    const [lead, setLead] = useState(String(track.leadMusician ?? ''))
    const [notes, setNotes] = useState(String(track.notes ?? ''))

    const isSong = !track.type || track.type === 'song'
    const isSection = track.type === 'header' || track.type === 'section'

    useEffect(() => {
        setTitle(String(track.title ?? ''))
        setKey(String(track.key ?? ''))
        setBpm(track.bpm === undefined ? '' : String(track.bpm))
        setLead(String(track.leadMusician ?? ''))
        setNotes(String(track.notes ?? ''))
    }, [track])

    const commitTitle = () => { if (title !== (track.title ?? '')) onCommit?.({ title }) }
    const commitKey = (next: string) => { if (next !== (track.key ?? '')) onCommit?.({ key: next }) }
    const commitBpm = () => {
        const trimmed = bpm.trim()
        if (trimmed === '' && track.bpm === undefined) return
        if (trimmed === String(track.bpm ?? '')) return
        if (trimmed === '') { onCommit?.({ bpm: undefined }); return }
        const parsed = Number(trimmed)
        if (Number.isFinite(parsed)) onCommit?.({ bpm: parsed })
    }
    const commitLead = () => { if (lead !== (track.leadMusician ?? '')) onCommit?.({ leadMusician: lead }) }
    const commitNotes = () => { if (notes !== (track.notes ?? '')) onCommit?.({ notes }) }

    const longPressTimerRef = useRef<number | null>(null)
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
    const cardElRef = useRef<HTMLDivElement | null>(null)

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    // T1.1: dnd-kit Sortable. `attributes` + `listeners` are spread on the
    // GRIP button only — the card body remains tap-to-edit. `setNodeRef`
    // attaches the draggable element (card) so dnd-kit can transform it
    // during drag. `transform` + `transition` drive the visual move.
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: track.id })

    const dragStyle: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    }

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.pointerType !== 'touch') return
        // T1.1: don't start the long-press context-menu timer if the touch
        // originated inside the drag handle — TouchSensor (200ms hold)
        // owns that gesture. Mirrors the desktop guard added in the
        // original Bug 1 fix.
        const target = e.target as HTMLElement | null
        if (target?.closest('[data-drag-handle]')) return
        cancelLongPress()
        const x = e.clientX
        const y = e.clientY
        longPressStartRef.current = { x, y }
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null
            cardElRef.current?.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                }),
            )
        }, 500)
    }

    const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.pointerType !== 'touch') return
        if (
            !longPressStartRef.current ||
            longPressTimerRef.current === null
        ) {
            return
        }
        const dx = e.clientX - longPressStartRef.current.x
        const dy = e.clientY - longPressStartRef.current.y
        if (dx * dx + dy * dy > 100) {
            cancelLongPress()
        }
    }

    const handlePointerEnd: React.PointerEventHandler<HTMLDivElement> = () => {
        cancelLongPress()
    }

    useEffect(() => () => cancelLongPress(), [cancelLongPress])

    const handleCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
        // T1.1: ignore clicks originating from the drag handle button so a
        // plain mousedown-up on the grip doesn't toggle the edit pane.
        const target = e.target as HTMLElement | null
        if (target?.closest('[data-drag-handle]')) return
        onTap()
    }

    const inputBase =
        'w-full h-10 px-3 rounded-md border border-white/10 bg-black/20 text-sm ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
        'transition-colors duration-150 motion-reduce:transition-none text-foreground'

    return (
        <li
            ref={(el) => {
                // Attach the dnd-kit ref to the <li> so it transforms during drag.
                setNodeRef(el)
            }}
            style={dragStyle}
            className="flex flex-col gap-2 relative"
            data-dragging={isDragging || undefined}
        >
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={cardElRef}
                        data-testid={`mobile-card-${track.id}`}
                        data-row-id={track.id}
                        onClick={handleCardClick}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerEnd}
                        onPointerLeave={handlePointerEnd}
                        onPointerCancel={handlePointerEnd}
                        style={{ touchAction: 'pan-y' }}
                        tabIndex={0}
                        aria-label={`${track.title || 'Untitled track'}. Tap to edit.`}
                        className={cn(
                            'group flex items-center gap-4 rounded-2xl border px-4 py-4',
                            'min-h-[72px] cursor-pointer relative overflow-hidden',
                            'bg-white/[0.02] backdrop-blur-md border-white/10 hover:bg-white/[0.04]',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            'transition-all duration-200 motion-reduce:transition-none',
                            isDragging &&
                                'shadow-lg ring-2 ring-indigo-400/40',
                        )}
                    >
                        <button
                            type="button"
                            aria-label={`Drag to reorder ${track.title || 'untitled track'}`}
                            data-testid={`mobile-card-handle-${track.id}`}
                            data-drag-handle=""
                            {...attributes}
                            {...listeners}
                            className={cn(
                                'flex flex-col items-center gap-1 justify-center rounded-md',
                                'cursor-grab active:cursor-grabbing p-2 -ml-2 touch-none',
                                'text-muted-foreground/50 hover:text-muted-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                'transition-colors duration-150 motion-reduce:transition-none',
                            )}
                        >
                            <GripVertical aria-hidden className="h-5 w-5" />
                            <span className="text-[10px] font-bold opacity-40 font-mono tracking-widest">{(track.order + 1).toString().padStart(2, '0')}</span>
                        </button>

                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <span className={cn(
                                "truncate transition-colors group-hover:text-brand",
                                isSection ? "text-xs font-bold uppercase tracking-[0.1em] text-brand/80"
                                : !isSong ? "text-sm italic text-muted-foreground/80"
                                : "text-lg font-semibold text-foreground"
                            )}>
                                {track.title || (
                                    <span className="text-muted-foreground/60 font-medium">
                                        Untitled {isSection ? 'Section' : isSong ? 'Track' : String(track.type)}
                                    </span>
                                )}
                            </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            {isSong && track.key ? (
                                <div className="bg-brand/10 border border-brand/20 rounded-lg px-2.5 py-1 text-center min-w-[3rem]">
                                    <p className="text-[9px] text-brand/70 uppercase font-bold tracking-tighter leading-none mb-0.5">Key</p>
                                    <p className="text-brand font-bold text-xs leading-none">{track.key}</p>
                                </div>
                            ) : null}

                            {isSong && track.leadMusician ? (
                                <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-center max-w-[5rem]">
                                    <p className="text-[9px] text-muted-foreground/70 uppercase font-bold tracking-tighter leading-none mb-0.5">Lead</p>
                                    <p className="text-foreground font-bold text-xs leading-none truncate">{track.leadMusician}</p>
                                </div>
                            ) : null}
                        </div>

                        <span
                            aria-label={
                                track.songId ? 'Chart bound' : 'No chart bound'
                            }
                            className="flex-none ml-2"
                        >
                            {track.songId ? (
                                <Music
                                    aria-hidden
                                    className="h-5 w-5 text-brand opacity-80"
                                />
                            ) : (
                                <FileText
                                    aria-hidden
                                    className="h-5 w-5 text-muted-foreground/30"
                                />
                            )}
                        </span>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent
                    data-testid={`mobile-card-context-menu-${track.id}`}
                >
                    <ContextMenuItem
                        onSelect={onContextEditRow}
                        data-testid="mobile-card-context-menu-edit"
                        className="cursor-pointer"
                    >
                        <Edit3 aria-hidden className="mr-2 h-4 w-4" />
                        Edit row
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextBindChart}
                        data-testid="mobile-card-context-menu-bind-chart"
                        className="cursor-pointer"
                    >
                        <Music aria-hidden className="mr-2 h-4 w-4" />
                        Bind chart
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextDuplicate}
                        data-testid="mobile-card-context-menu-duplicate"
                        className="cursor-pointer"
                    >
                        <Copy aria-hidden className="mr-2 h-4 w-4" />
                        Duplicate row
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={onContextDelete}
                        data-testid="mobile-card-context-menu-delete"
                        className="cursor-pointer text-red-300 focus:text-red-200 focus:bg-red-500/15"
                    >
                        <Trash2 aria-hidden className="mr-2 h-4 w-4" />
                        Delete row
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Inline Editor Panel */}
            {isEditing && (
                <aside className="bg-white/[0.03] backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-[0_0_20px_rgba(67,56,202,0.15)] border border-brand/30 animate-in fade-in slide-in-from-top-2 duration-200 ml-8">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-brand mb-1">Edit: {track.title || 'Untitled'}</h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <label className="block sm:col-span-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">Title</span>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={commitTitle} className={inputBase} />
                        </label>
                        {isSong && (
                            <>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">Lead</span>
                                    <input type="text" value={lead} onChange={e => setLead(e.target.value)} onBlur={commitLead} className={inputBase} />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">Key</span>
                                    <select value={key} onChange={e => { setKey(e.target.value); commitKey(e.target.value); }} className={inputBase}>
                                        <option value="">— None —</option>
                                        {KEY_OPTIONS_DATA.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">BPM</span>
                                    <input type="number" inputMode="numeric" value={bpm} onChange={e => setBpm(e.target.value)} onBlur={commitBpm} className={inputBase} />
                                </label>
                            </>
                        )}
                    </div>

                    <label className="block mb-6">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">Notes</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={commitNotes}
                            rows={2}
                            className={cn(inputBase, 'h-auto py-2 font-mono text-xs text-muted-foreground leading-relaxed')}
                            placeholder="Add lyrics, chords, or performance notes..."
                        />
                    </label>

                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/5 justify-end">
                        <button
                            type="button"
                            onClick={onContextBindChart}
                            className="h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm border border-brand/30 bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                        >
                            <Music className="h-4 w-4" />
                            Bind Chart
                        </button>
                        <button
                            type="button"
                            onClick={onDeleteRow}
                            className="h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </aside>
            )}
        </li>
    )
}
