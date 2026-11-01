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
import { useT } from '@/i18n/client'
import type { LocalTrack } from '@/lib/local/types'
import { cn, parseFileId } from '@/lib/utils'
import { KEY_OPTIONS_DATA } from './cells/KeyCell'
import { RecordingCell } from './cells/RecordingCell'
import { displayChartTitle } from '@/lib/format/chart-title'
import { RecordingBindPopover } from './RecordingBindPopover'
import { SECTION_BAND_CLASS as BAND_CLASS, type SectionBand } from './section-bands'

/** Chart format from the cached file name / mime type; null when unknown. */
function chartFormatKey(track: LocalTrack): string | null {
    const name = typeof track.fileName === 'string' ? track.fileName.toLowerCase() : ''
    const mime = typeof track.mimeType === 'string' ? track.mimeType.toLowerCase() : ''
    if (/\.(musicxml|mxl|xml)$/.test(name) || mime.includes('musicxml')) return 'setlistGrid.chipFormatMusicXml'
    if (name.endsWith('.pdf') || mime === 'application/pdf') return 'setlistGrid.chipFormatPdf'
    if (mime.startsWith('image/')) return 'setlistGrid.chipFormatImage'
    if (mime.startsWith('text/') || name.endsWith('.txt')) return 'setlistGrid.chipFormatText'
    return null
}

/** "Untitled …" placeholder per non-song row type (the type is a stored value). */
const UNTITLED_BY_TYPE: Record<string, string> = {
    reading: 'setlistGrid.untitledReading',
    prayer: 'setlistGrid.untitledPrayer',
    transition: 'setlistGrid.untitledTransition',
    note: 'setlistGrid.untitledNote',
}

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
    /** David's ask 4: the chart swapped in for tonight, when one applies. */
    tonightTitle?: string
    /** 1-based position in the list as shown. Display only; the stored order is never rewritten. */
    position?: number
    /** Section header rows: the band's hue and the page range under it. */
    band?: SectionBand
    /** Library the bonded chart lives in (data: the collection key, e.g. 'nava'). */
    collection?: string
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
    tonightTitle,
    position,
    band,
    collection,
}: MobileRowCardProps) {
    const t = useT()
    const [title, setTitle] = useState(String(track.title ?? ''))
    const [key, setKey] = useState(String(track.key ?? ''))
    const [bpm, setBpm] = useState(track.bpm === undefined ? '' : String(track.bpm))
    const [lead, setLead] = useState(String(track.leadMusician ?? ''))
    const [notes, setNotes] = useState(String(track.notes ?? ''))

    const isSong = !track.type || track.type === 'song'
    const isSection = track.type === 'header' || track.type === 'section'
    // A bonded chart is keyed on songId (handleBindChart writes songId+fileId
    // for ANY row type, incl. prayer/reading). A bonded NON-song row must read
    // as a real chart-bearing row — full-prominence title, not the passive
    // dimmed-italic label an unbonded prayer/reading still gets. (cowork #6 opt b)
    const hasChart = Boolean(track.songId)

    // Printed page in the service's book (stored at authoring time).
    const rawFolio = (track.liturgyRef as { folio?: unknown } | undefined)?.folio
    const folio = typeof rawFolio === 'number' && Number.isFinite(rawFolio) ? rawFolio : undefined
    const sectionPages =
        band?.folioFrom === undefined || band.folioTo === undefined
            ? null
            : band.folioFrom === band.folioTo
              ? t('setlistGrid.sectionPage', { page: band.folioFrom })
              : t('setlistGrid.sectionPages', { from: band.folioFrom, to: band.folioTo })

    // The small chart chip under the title: library · setting · format · Vocal Lead.
    // There is no library-number field, so the chip names the library, as /library does.
    const chipParts: string[] = []
    if (!isSection) {
        if (hasChart) {
            chipParts.push(
                collection === 'supplemental'
                    // i18n-ignore: collection (book) name, data, not translated
                    ? 'Shireinu'
                    : collection === 'nava'
                      // i18n-ignore: collection (book) name, data, not translated
                      ? 'Nava Tehilah'
                      : t('org.library.ownBadge'),
            )
        }
        if (typeof track.tune === 'string' && track.tune.trim()) chipParts.push(track.tune.trim())
        const formatKey = hasChart ? chartFormatKey(track) : null
        if (formatKey) chipParts.push(t(formatKey))
        if (isSong && track.leadMusician) chipParts.push(t('setlistGrid.chipVocalLead', { name: String(track.leadMusician) }))
    }

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

    // v60-02: pagehide / visibilitychange:hidden flushes every onBlur-
    // committed draft (title/lead/bpm/notes). `key` commits synchronously
    // onChange so it has no pending draft. Per-commit guards de-dupe with
    // any onBlur that may also fire. Listener only mounts while the
    // inline editor is open (`isEditing`) so we don't register 30+
    // listeners across a large setlist.
    const flushRef = useRef<() => void>(() => {})
    useEffect(() => {
        flushRef.current = () => {
            commitTitle()
            commitLead()
            commitBpm()
            commitNotes()
        }
    })
    useEffect(() => {
        if (!isEditing) return
        const onHide = () => flushRef.current()
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flushRef.current()
        }
        window.addEventListener('pagehide', onHide)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.removeEventListener('pagehide', onHide)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [isEditing])

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
        'w-full h-11 px-3 rounded-md border border-input bg-background text-sm ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        'transition-colors duration-150 motion-reduce:transition-none text-foreground'

    return (
        <li
            ref={(el) => {
                // Attach the dnd-kit ref to the <li> so it transforms during drag.
                setNodeRef(el)
            }}
            style={dragStyle}
            className={cn('flex flex-col relative', isSection && 'pt-3 first:pt-0')}
            data-dragging={isDragging || undefined}
            data-section-hue={isSection ? band?.hue : undefined}
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
                        aria-label={
                            track.title
                                ? t('setlistGrid.cardAria', { title: track.title })
                                : t('setlistGrid.cardUntitledAria')
                        }
                        className={cn(
                            'group relative flex items-center gap-1.5 sm:gap-2 cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            'transition-colors duration-150 motion-reduce:transition-none',
                            // Dense, track-list rows (~48px): the 44px hit areas
                            // come from the controls themselves, not row height.
                            isSection
                                ? cn('min-h-11 ps-0.5 pe-3 sm:pe-4 rounded-sm', BAND_CLASS[band?.hue ?? 'blue'])
                                : 'min-h-12 ps-0.5 pe-2 sm:pe-3 bg-card hover:bg-accent/50 border-b border-rule',
                            isDragging && 'shadow-[0_8px_24px_rgb(24_32_46/0.18)] ring-2 ring-ring/60 z-10',
                        )}
                    >
                        <button
                            type="button"
                            aria-label={
                                track.title
                                    ? t('setlistGrid.cardDragAria', { title: track.title })
                                    : t('setlistGrid.cardDragUntitledAria')
                            }
                            data-testid={`mobile-card-handle-${track.id}`}
                            data-drag-handle=""
                            {...attributes}
                            {...listeners}
                            className={cn(
                                'flex shrink-0 items-center justify-center rounded-md',
                                'cursor-grab active:cursor-grabbing touch-none min-h-11 min-w-11',
                                isSection ? 'text-current opacity-70 hover:opacity-100' : 'text-muted-foreground/60 hover:text-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                'transition-colors duration-150 motion-reduce:transition-none',
                            )}
                        >
                            <GripVertical aria-hidden className="h-5 w-5" />
                        </button>

                        {!isSection && (
                            <span aria-hidden className="tnum w-6 shrink-0 text-end text-sm font-semibold text-muted-foreground">
                                {position ?? track.order + 1}
                            </span>
                        )}

                        <div className="min-w-0 flex-1 py-1">
                            {/* One line where the width allows: the title, then the
                                chip inline and muted; wraps to 2 lines before
                                truncating. */}
                            <div className={cn(!isSection && 'min-[821px]:flex min-[821px]:items-baseline min-[821px]:gap-2')}>
                            <p className={cn(isSection ? 'truncate' : 'line-clamp-2 min-w-0 [overflow-wrap:break-word] [word-break:normal] hyphens-none', 'leading-snug')}>
                                <span
                                    data-testid={isSection ? `section-running-head-${track.id}` : undefined}
                                    className={cn(
                                        isSection ? 'text-[13px] font-extrabold uppercase tracking-[0.08em]'
                                        // Bonded prayer/reading reads as a full chart-bearing row
                                        // (foreground, non-italic); only an UNBONDED non-song row
                                        // keeps the passive dimmed-italic label.
                                        : !isSong ? (hasChart ? 'text-base font-medium text-foreground' : 'text-sm italic text-muted-foreground/80')
                                        : 'text-base sm:text-lg font-semibold text-foreground',
                                    )}
                                >
                                    {displayChartTitle(track.title) || (
                                        <span className={isSection ? 'opacity-80' : 'text-muted-foreground font-medium'}>
                                            {isSection
                                                ? t('setlistGrid.untitledSection')
                                                : isSong
                                                  ? t('setlistGrid.untitledTrack')
                                                  : UNTITLED_BY_TYPE[String(track.type)]
                                                    ? t(UNTITLED_BY_TYPE[String(track.type)])
                                                    : t('setlistGrid.untitledOther', { type: String(track.type) })}
                                        </span>
                                    )}
                                </span>
                            </p>
                            {!isSection && chipParts.length > 0 && (
                                // Own line under the title on 820px and narrower;
                                // inline beside it on desktop.
                                <p data-testid={`chart-chip-${track.id}`} className="text-xs font-medium text-muted-foreground min-[821px]:whitespace-nowrap min-[821px]:shrink-0">
                                    {chipParts.join(' · ')}
                                </p>
                            )}
                            </div>
                            {isSong && !hasChart && (
                                <p data-testid={`row-no-chart-${track.id}`} className="text-xs font-semibold text-warning-line">
                                    {t('setlistGrid.rowNoChart')}
                                </p>
                            )}
                            {tonightTitle && (
                                <p data-testid="tonight-edit-note" className="truncate text-xs font-semibold text-warning-line">
                                    {t('setlistGrid.tonightNote', { tonight: tonightTitle, planned: track.title })}
                                </p>
                            )}
                        </div>

                        {!isSection && isSong && track.key ? (
                            <span className="tnum shrink-0 inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-md border border-border bg-secondary text-sm font-bold text-secondary-foreground">
                                <span className="sr-only">{t('setlistGrid.columnKey')} </span>
                                {track.key}
                            </span>
                        ) : null}

                        {!isSection && (track.songId ? (
                            // Bound chart → click-through link that opens the
                            // chart file in a new tab via the existing
                            // Storage-backed serving route. stopPropagation
                            // keeps the click from bubbling to the card's
                            // tap-to-edit handler.
                            <a
                                href={
                                    parseFileId(
                                        (typeof track.fileId === 'string' &&
                                            track.fileId) ||
                                            track.songId,
                                    ).apiUrl
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t('setlistGrid.openChartNewTab')}
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                    'flex-none inline-flex items-center justify-center rounded-md',
                                    // 44px hit area (WEB-13).
                                    'h-11 w-11',
                                    'cursor-pointer text-brand hover:bg-accent',
                                    'transition-colors motion-reduce:transition-none',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            >
                                <Music aria-hidden className="h-5 w-5" />
                            </a>
                        ) : (
                            <span
                                role="img"
                                aria-label={t('setlistGrid.noChartBound')}
                                className="flex-none inline-flex h-11 w-11 items-center justify-center"
                            >
                                <FileText
                                    aria-hidden
                                    className="h-5 w-5 text-muted-foreground/40"
                                />
                            </span>
                        ))}

                        {/* Below sm the recordings control moves into the row's
                            edit panel so the title keeps its width. */}
                        <span className="hidden sm:contents">
                        {track.songId ? (
                            // Recording affordance — opens RecordingBindPopover.
                            // stopPropagation keeps the trigger click from
                            // bubbling to the card's tap-to-edit handler
                            // (same gesture-isolation pattern as the chart link).
                            <RecordingBindPopover
                                songId={track.songId}
                                songTitle={track.title}
                            >
                                <RecordingCell
                                    disabled={false}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </RecordingBindPopover>
                        ) : isSection ? null : (
                            // No song bound → recordings attach to a song, so
                            // the affordance renders disabled (no popover).
                            <RecordingCell disabled />
                        )}
                        </span>

                        {/* The page call sits in the margin: the far right edge,
                            after every control, so the numbers line up down
                            the list. */}
                        {isSection ? (
                            sectionPages ? (
                                <span data-testid={`section-pages-${track.id}`} className="tnum shrink-0 text-[13px] font-bold tracking-[0.04em]">
                                    {sectionPages}
                                </span>
                            ) : null
                        ) : (
                            <span
                                data-testid={folio !== undefined ? `page-call-${track.id}` : undefined}
                                className="tnum shrink-0 w-14 sm:w-16 text-end leading-none whitespace-nowrap"
                            >
                                {folio !== undefined ? (
                                    <>
                                        <span className="text-[11px] font-semibold text-muted-foreground me-0.5">{t('setlistGrid.pageCallPrefix')}</span>
                                        <span className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-foreground">{folio}</span>
                                    </>
                                ) : null}
                            </span>
                        )}
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
                        <Edit3 aria-hidden className="me-2 h-4 w-4" />
                        {t('setlistGrid.menuEditRow')}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextBindChart}
                        data-testid="mobile-card-context-menu-bind-chart"
                        className="cursor-pointer"
                    >
                        <Music aria-hidden className="me-2 h-4 w-4" />
                        {t('setlistGrid.menuBindChart')}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={onContextDuplicate}
                        data-testid="mobile-card-context-menu-duplicate"
                        className="cursor-pointer"
                    >
                        <Copy aria-hidden className="me-2 h-4 w-4" />
                        {t('setlistGrid.menuDuplicateRow')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={onContextDelete}
                        data-testid="mobile-card-context-menu-delete"
                        className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 aria-hidden className="me-2 h-4 w-4" />
                        {t('setlistGrid.menuDeleteRow')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Inline Editor Panel */}
            {isEditing && (
                <aside className="bg-card rounded-lg p-4 sm:p-6 my-2 ms-8 sm:ms-14 border border-border shadow-[0_8px_24px_rgb(24_32_46/0.10)] animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-foreground mb-1">
                                {track.title
                                    ? t('setlistGrid.editHeading', { title: track.title })
                                    : t('setlistGrid.editHeadingUntitled')}
                            </h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <label className="block sm:col-span-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-[0.06em] font-bold mb-1 block">{t('setlistGrid.columnTitle')}</span>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={commitTitle} className={inputBase} />
                        </label>
                        {isSong && (
                            <>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-[0.06em] font-bold mb-1 block">{t('setlistGrid.columnVocalLead')}</span>
                                    <input type="text" value={lead} onChange={e => setLead(e.target.value)} onBlur={commitLead} className={inputBase} />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-[0.06em] font-bold mb-1 block">{t('setlistGrid.columnKey')}</span>
                                    <select value={key} onChange={e => { setKey(e.target.value); commitKey(e.target.value); }} className={inputBase}>
                                        <option value="">{t('setlistGrid.keyNone')}</option>
                                        {KEY_OPTIONS_DATA.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground uppercase tracking-[0.06em] font-bold mb-1 block">{t('setlistGrid.columnBpm')}</span>
                                    <input type="number" inputMode="numeric" value={bpm} onChange={e => setBpm(e.target.value)} onBlur={commitBpm} className={inputBase} />
                                </label>
                            </>
                        )}
                    </div>

                    <label className="block mb-6">
                        <span className="text-xs text-muted-foreground uppercase tracking-[0.06em] font-bold mb-1 block">{t('setlistGrid.columnNotes')}</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={commitNotes}
                            rows={2}
                            className={cn(inputBase, 'h-auto py-2 font-mono text-xs text-muted-foreground leading-relaxed')}
                            placeholder={t('setlistGrid.notesPlaceholder')}
                        />
                    </label>

                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-rule justify-end">
                        <button
                            type="button"
                            onClick={onContextBindChart}
                            className="h-11 px-4 rounded-md flex items-center justify-center gap-2 text-sm font-semibold border border-border bg-background text-foreground hover:bg-accent transition-colors"
                        >
                            <Music className="h-4 w-4" />
                            {t('setlistGrid.bindChartButton')}
                        </button>
                        {track.songId ? (
                            <span className="sm:hidden">
                                <RecordingBindPopover songId={track.songId} songTitle={track.title}>
                                    <RecordingCell disabled={false} className="h-11 w-11 rounded-md border border-border bg-background" />
                                </RecordingBindPopover>
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={onDeleteRow}
                            aria-label={t('setlistGrid.menuDeleteRow')}
                            className="h-11 w-11 rounded-md flex items-center justify-center text-sm border border-border bg-background text-destructive hover:bg-destructive/10 transition-colors"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </aside>
            )}
        </li>
    )
}
