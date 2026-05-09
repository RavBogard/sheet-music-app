'use client'

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
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'
import { KEY_OPTIONS_DATA } from './cells/KeyCell'

export interface MobileRowCardProps {
    track: LocalTrack
    isSelected: boolean
    /** True when row is part of a multi-selection ≥ 2 — enables ContextMenu
     *  bulk-routing semantics (Edit/Bind/Duplicate disable; Delete → bulk). */
    isInBulkSelection: boolean
    /** Total selection size — drives the "N rows selected" label. */
    bulkSelectionCount: number
    isEditing?: boolean
    canMoveUp?: boolean
    canMoveDown?: boolean
    onSelectionClick: (modifiers: { shift: boolean; meta: boolean }) => void
    /** Plain card tap (no modifier) — toggles inline editing. */
    onTap: () => void
    onContextEditRow: () => void
    onContextBindChart: () => void
    onContextDuplicate: () => void
    onContextDelete: () => void
    onCommit?: (patch: Partial<LocalTrack>) => Promise<void> | void
    onMoveUp?: () => void | Promise<void>
    onMoveDown?: () => void | Promise<void>
    onDeleteRow?: () => void
}

/**
 * v50-05-05 mobile card row — parallel to desktop SortableRow but for the
 * stacked-card render path (below 768px). Title / key / lead visible at
 * rest, chart-bound icon on the right, drag/select handle on the left.
 */
export function MobileRowCard({
    track,
    isSelected,
    isInBulkSelection,
    bulkSelectionCount,
    isEditing,
    canMoveUp,
    canMoveDown,
    onSelectionClick,
    onTap,
    onContextEditRow,
    onContextBindChart,
    onContextDuplicate,
    onContextDelete,
    onCommit,
    onMoveUp,
    onMoveDown,
    onDeleteRow,
}: MobileRowCardProps) {
    const [title, setTitle] = useState(String(track.title ?? ''))
    const [key, setKey] = useState(String(track.key ?? ''))
    const [bpm, setBpm] = useState(track.bpm === undefined ? '' : String(track.bpm))
    const [lead, setLead] = useState(String(track.leadMusician ?? ''))
    const [notes, setNotes] = useState(String(track.notes ?? ''))

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

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.pointerType !== 'touch') return
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
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault()
            onSelectionClick({
                shift: e.shiftKey,
                meta: e.metaKey || e.ctrlKey,
            })
            return
        }
        onTap()
    }

    const handleHandleClick: React.MouseEventHandler<HTMLButtonElement> = (
        e,
    ) => {
        e.stopPropagation()
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault()
            onSelectionClick({
                shift: e.shiftKey,
                meta: e.metaKey || e.ctrlKey,
            })
            return
        }
        onSelectionClick({ shift: false, meta: true })
    }

    const inputBase =
        'w-full h-10 px-3 rounded-md border border-white/10 bg-black/20 text-sm ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
        'transition-colors duration-150 motion-reduce:transition-none text-foreground'

    return (
        <li className="flex flex-col gap-2 relative">
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={cardElRef}
                        data-testid={`mobile-card-${track.id}`}
                        data-row-id={track.id}
                        data-selected={isSelected || undefined}
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
                            isSelected &&
                                'border-brand/40 bg-brand/5 shadow-[0_0_15px_rgba(67,56,202,0.15)]',
                        )}
                    >
                        <button
                            type="button"
                            aria-label={`${isSelected ? 'Selected — ' : ''}Toggle selection for ${track.title || 'untitled track'}`}
                            aria-pressed={isSelected ? true : undefined}
                            data-testid={`mobile-card-handle-${track.id}`}
                            onClick={handleHandleClick}
                            className={cn(
                                'flex flex-col items-center gap-1 justify-center rounded-md',
                                'cursor-pointer p-2 -ml-2',
                                isSelected
                                    ? 'text-brand bg-brand/10 ring-1 ring-brand/40'
                                    : 'text-muted-foreground/50 hover:text-muted-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                'transition-colors duration-150 motion-reduce:transition-none',
                            )}
                        >
                            <GripVertical aria-hidden className="h-5 w-5" />
                            <span className="text-[10px] font-bold opacity-40 font-mono tracking-widest">{(track.order + 1).toString().padStart(2, '0')}</span>
                        </button>

                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <span className="truncate text-lg font-semibold text-foreground group-hover:text-brand transition-colors">
                                {track.title || (
                                    <span className="text-muted-foreground/60 font-medium">
                                        Untitled Track
                                    </span>
                                )}
                            </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            {track.key ? (
                                <div className="bg-brand/10 border border-brand/20 rounded-lg px-2.5 py-1 text-center min-w-[3rem]">
                                    <p className="text-[9px] text-brand/70 uppercase font-bold tracking-tighter leading-none mb-0.5">Key</p>
                                    <p className="text-brand font-bold text-xs leading-none">{track.key}</p>
                                </div>
                            ) : null}
                            
                            {track.leadMusician ? (
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
                    {isInBulkSelection ? (
                        <>
                            <ContextMenuLabel
                                data-testid="mobile-card-context-menu-bulk-label"
                                className="text-indigo-300"
                            >
                                {bulkSelectionCount} rows selected
                            </ContextMenuLabel>
                            <ContextMenuSeparator />
                        </>
                    ) : null}
                    <ContextMenuItem
                        onSelect={onContextEditRow}
                        disabled={isInBulkSelection}
                        data-testid="mobile-card-context-menu-edit"
                        className="cursor-pointer"
                    >
                        <Edit3 aria-hidden className="mr-2 h-4 w-4" />
                        Edit row
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextBindChart}
                        disabled={isInBulkSelection}
                        data-testid="mobile-card-context-menu-bind-chart"
                        className="cursor-pointer"
                    >
                        <Music aria-hidden className="mr-2 h-4 w-4" />
                        Bind chart
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextDuplicate}
                        disabled={isInBulkSelection}
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
                        <label className="block">
                            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1 block">Title</span>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={commitTitle} className={inputBase} />
                        </label>
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

                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/5 justify-between">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => onMoveUp?.()}
                                disabled={!canMoveUp}
                                className={cn("h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed")}
                            >
                                Move Up
                            </button>
                            <button
                                type="button"
                                onClick={() => onMoveDown?.()}
                                disabled={!canMoveDown}
                                className={cn("h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed")}
                            >
                                Move Down
                            </button>
                        </div>
                        <div className="flex gap-2">
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
                    </div>
                </aside>
            )}
        </li>
    )
}
