'use client'

import {
    ArrowRight,
    BookOpen,
    ChevronUp,
    Heading,
    Heart,
    StickyNote,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { useVirtualKeyboardOpen } from '@/hooks/use-virtual-keyboard-open'
import { cn } from '@/lib/utils'

import { AddRowPlaceholder } from './AddRowPlaceholder'
import { TouchOrPopover } from './TouchOrPopover'

/**
 * v53-03-01: TrackTypes available from the chevron tile popover. Song is
 * NOT in this list — Song lives in the primary "+ Song" CTA which opens
 * the AddRowPlaceholder picker (Recent / Library / Custom). Header maps to
 * TrackType `'section'` per existing TYPE_OPTIONS vocabulary in TypeCell.tsx.
 */
export type NonSongTrackType =
    | 'section'
    | 'reading'
    | 'prayer'
    | 'transition'
    | 'note'

interface TrackTypeTileSpec {
    type: NonSongTrackType
    label: string
    icon: ReactNode
}

/**
 * v53-03-01: ported icon colors from old AddBar (commit `d8c0442`, deleted
 * in v50-02 amputation). Daniel-locked at /paul:discuss-phase: amber Reading
 * / blue Prayer / emerald Transition / muted Header+Note. Indigo Song lives
 * in the primary CTA (rendered by AddRowPlaceholder), NOT in this tile grid.
 *
 * Color tokens reuse the dark-first OKLCH stock palette (no new theme
 * entries). All ≥4.5:1 contrast against `bg-card` per ux-pro-max
 * accessibility rule. Color is an enhancement on top of icon shape + text
 * label — never the sole signal (Color-Only HIGH rule).
 */
const TILE_SPECS: TrackTypeTileSpec[] = [
    {
        type: 'section',
        label: 'Section header',
        icon: <Heading className="h-5 w-5 text-muted-foreground" aria-hidden />,
    },
    {
        type: 'reading',
        label: 'Reading',
        icon: <BookOpen className="h-5 w-5 text-amber-300" aria-hidden />,
    },
    {
        type: 'prayer',
        label: 'Prayer',
        icon: <Heart className="h-5 w-5 text-blue-300" aria-hidden />,
    },
    {
        type: 'transition',
        label: 'Transition',
        icon: <ArrowRight className="h-5 w-5 text-emerald-300" aria-hidden />,
    },
    {
        type: 'note',
        label: 'Stage note',
        icon: <StickyNote className="h-5 w-5 text-muted-foreground" aria-hidden />,
    },
]

export interface AddBarProps {
    /** Insert a new row populated from a known library song. */
    onPickSong: (song: { id: string; title: string }) => void
    /** Insert a new row with a free-text title only (Song type). */
    onCreateFreeText: (title: string) => void
    /** Insert a new row of a non-Song TrackType (Header / Reading / Prayer / Transition / Stage note). */
    onAddTrackOfType: (type: NonSongTrackType) => void
    /** Imperative open trigger from the EmptyState "Add a song" CTA — flows through to the primary picker. */
    autoOpen?: boolean
}

/**
 * v53-03-01: Polymorphic Add menu (split-button) — port of the old AddBar
 * from commit `d8c0442` (deleted in v50-02 amputation) into the v50-05
 * spreadsheet substrate.
 *
 * Shape:
 *   [+ Song  (primary, indigo)] [^  (chevron)]
 *                                 │
 *                                 └─> 5-tile grid (Section / Reading / Prayer / Transition / Stage note)
 *
 * Primary CTA: AddRowPlaceholder rendered as the picker (Recent / Library / Custom — same
 * substrate as v53-02 ChartBindPopover; Recent ranking via existing v50-04
 * SongRecentEntry.performedAt; cmdk value-format `${title}` only per v53-02-01 fix).
 *
 * Chevron popover: 5 colored tiles, ≥48×48 fine / ≥56×56 coarse, 8px gap (≥44px touch
 * floor + 8px touch-spacing per v50-05-04). Tile click → applyEdit('set', 'tracks', { type })
 * via SetlistGrid's handleAddTrackOfType handler — single write path preserved.
 *
 * Long-press disambiguation: explicit `onContextMenu={(e) => e.preventDefault()}` on the
 * chevron trigger, every tile, and the primary AddRowPlaceholder trigger so v50-05-04's
 * 500ms long-press → synthetic contextmenu MouseEvent dispatch on coarse pointer doesn't
 * accidentally open the row ContextMenu through these affordances. AddBar lives outside
 * any row scope, but defense-in-depth costs nothing.
 *
 * Boundary lock: NO touches to sync engine, Dexie schema, snapshot-listener,
 * lazy-hydration, perf-view, cells/, firestore.rules. v53-02 ChartBindPopover preserved.
 */
export function AddBar({
    onPickSong,
    onCreateFreeText,
    onAddTrackOfType,
    autoOpen = false,
}: AddBarProps) {
    const [tilesOpen, setTilesOpen] = useState(false)

    // v60-10-01: coarse-pointer-only hide-on-keyboard gate. visualViewport
    // delta detection runs on every viewport; we restrict the hide effect
    // to coarse pointers so a desktop user resizing devtools or triggering
    // any unrelated viewport quirk can't accidentally hide the bar.
    const isCoarse = useMediaQuery('(pointer: coarse)')
    const keyboardOpen = useVirtualKeyboardOpen()
    const hideForKeyboard = isCoarse && keyboardOpen

    const closeTiles = () => setTilesOpen(false)

    return (
        <div
            data-testid="add-bar"
            className={cn(
                'flex w-full items-stretch border-t border-white/10',
                'hover:bg-white/[0.03]',
                // v60-10-01: coarse-pointer sticky-bottom variant. Pinned
                // to the viewport bottom on iPad + phone so the AddBar
                // stays in reach regardless of scroll position (resolves
                // v53-03 CONTEXT Q1 fold-forward from v5.4). z-40 sits
                // below Radix Dialog (z-50) so ChartBindDialog still
                // overlays cleanly. pb-[env(safe-area-inset-bottom)]
                // pushes the bar above the iOS home indicator on phones.
                // Desktop fine-pointer surfaces keep the in-flow v53-03
                // layout byte-for-byte — Tailwind only emits the rule
                // inside @media (pointer: coarse) so fine pointers see
                // none of these properties.
                '[@media(pointer:coarse)]:fixed [@media(pointer:coarse)]:bottom-0 [@media(pointer:coarse)]:left-0 [@media(pointer:coarse)]:right-0 [@media(pointer:coarse)]:z-40 [@media(pointer:coarse)]:bg-background [@media(pointer:coarse)]:pb-[env(safe-area-inset-bottom)] [@media(pointer:coarse)]:shadow-[0_-4px_12px_rgba(0,0,0,0.18)]',
                // v60-10-01: hide when the on-screen keyboard is open on
                // a coarse pointer. `hidden` (display:none) removes the
                // bar from the a11y tree so it cannot steal focus behind
                // the keyboard. No motion — the keyboard's own animation
                // is the visual transition; this also auto-satisfies
                // prefers-reduced-motion.
                hideForKeyboard && 'hidden',
            )}
        >
            <div className="flex-1">
                <AddRowPlaceholder
                    autoOpen={autoOpen}
                    onPickSong={onPickSong}
                    onCreateFreeText={onCreateFreeText}
                />
            </div>

            <TouchOrPopover
                open={tilesOpen}
                onOpenChange={setTilesOpen}
                align="end"
                sideOffset={8}
                // Tile grid has no input — suppress auto-focus on coarse
                // pointer so the iPad keyboard doesn't pop and so first-tile
                // focus doesn't visually shout when opened by a thumb. Tab
                // works normally for keyboard users (matches v51-01 discrete-
                // mode pattern).
                suppressAutoFocus
                contentClassName="w-[16rem] p-0"
                contentTestId="add-bar-tiles-popover"
                trigger={
                    <button
                        type="button"
                        data-testid="add-bar-chevron-trigger"
                        aria-label="Add track of another type"
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                            'flex h-11 items-center justify-center px-3 border-l border-white/10',
                            '[@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:px-4',
                            'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
                            'cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        )}
                    >
                        <ChevronUp aria-hidden className="h-4 w-4" />
                    </button>
                }
            >
                <div
                    role="grid"
                    aria-label="Track type"
                    className="grid grid-cols-2 gap-2 p-2"
                >
                    {TILE_SPECS.map((tile) => (
                        <button
                            key={tile.type}
                            type="button"
                            role="gridcell"
                            data-testid={`add-bar-tile-${tile.type}`}
                            aria-label={tile.label}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={() => {
                                onAddTrackOfType(tile.type)
                                closeTiles()
                            }}
                            className={cn(
                                'flex flex-col items-center justify-center gap-1 rounded-md border border-white/10 bg-card p-3 text-xs',
                                'min-h-[48px] [@media(pointer:coarse)]:min-h-[56px]',
                                'hover:bg-white/[0.03] hover:border-white/20',
                                'cursor-pointer',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            )}
                        >
                            {tile.icon}
                            <span className="font-medium text-foreground">
                                {tile.label}
                            </span>
                        </button>
                    ))}
                </div>
            </TouchOrPopover>
        </div>
    )
}
