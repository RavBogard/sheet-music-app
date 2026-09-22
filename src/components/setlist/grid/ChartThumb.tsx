'use client'

import { FileText, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    chartPage1Loader,
    isPreviewableMime,
    type ChartPage1Result,
} from '@/lib/charts/chart-page1'

/**
 * Page-1 thumbnail for one picker candidate (David's ask 1, 2026-09-22).
 *
 * It loads only while the row is actually on screen inside the picker's
 * scroll list (IntersectionObserver, after a short settle so a fast scroll
 * doesn't queue every row it passes), and aborts when the row leaves or the
 * picker closes. Tapping or clicking it opens page 1 full size; closing that
 * view returns to the picker with the typed filter and highlight intact.
 *
 * The thumbnail is a button, but it stops the click from reaching the
 * cmdk item, so previewing never binds a chart.
 */

const THUMB_WIDTH = 28
const SETTLE_MS = 150

type LoadState = { status: 'idle' | 'loading' } | { status: 'done'; result: ChartPage1Result }

function usePage1(
    fileId: string,
    width: number,
    mimeType: string | undefined,
    active: boolean,
    priority = false,
): LoadState {
    const [state, setState] = useState<LoadState>({ status: 'idle' })
    useEffect(() => {
        if (!active) return
        if (!isPreviewableMime(mimeType)) {
            setState({ status: 'done', result: { kind: 'none', reason: 'not-previewable' } })
            return
        }
        const controller = new AbortController()
        setState((s) => (s.status === 'done' ? s : { status: 'loading' }))
        chartPage1Loader()
            .load({ fileId, width, mimeType, signal: controller.signal, priority })
            .then((result) => {
                if (!controller.signal.aborted) setState({ status: 'done', result })
            })
        return () => controller.abort()
    }, [fileId, width, mimeType, active, priority])
    return state
}

function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const el = ref.current
        if (!el || typeof IntersectionObserver === 'undefined') return
        let timer: ReturnType<typeof setTimeout> | null = null
        const root = el.closest('[cmdk-list]') as Element | null
        const io = new IntersectionObserver(
            (entries) => {
                const on = entries.some((e) => e.isIntersecting)
                if (timer) clearTimeout(timer)
                timer = null
                if (on) timer = setTimeout(() => setVisible(true), SETTLE_MS)
                else setVisible(false)
            },
            { root },
        )
        io.observe(el)
        return () => {
            if (timer) clearTimeout(timer)
            io.disconnect()
        }
    }, [ref])
    return visible
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

export interface ChartThumbProps {
    fileId: string
    title: string
    mimeType?: string
}

export function ChartThumb({ fileId, title, mimeType }: ChartThumbProps) {
    const ref = useRef<HTMLButtonElement>(null)
    const onScreen = useOnScreen(ref)
    const state = usePage1(fileId, THUMB_WIDTH, mimeType, onScreen)
    const [enlarged, setEnlarged] = useState(false)

    const result = state.status === 'done' ? state.result : null

    return (
        <>
            <button
                ref={ref}
                type="button"
                tabIndex={-1}
                data-chart-thumb={fileId}
                data-state={result ? result.kind : state.status}
                aria-label={`Preview page 1 of ${title}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEnlarged(true)
                }}
                className="relative flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-white/10 bg-white/5 hover:ring-1 hover:ring-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-8"
            >
                {result?.kind === 'image' ? (
                    <img src={result.url} alt="" className="h-full w-full object-cover object-top bg-white" />
                ) : state.status === 'loading' ? (
                    <Loader2 aria-hidden className="h-3 w-3 animate-spin text-muted-foreground/60" />
                ) : (
                    <FileText aria-hidden className="h-3.5 w-3.5 text-muted-foreground/70" />
                )}
            </button>
            {enlarged && (
                // The dialog is portalled, but React still bubbles its events
                // through this row. Stop them here so nothing inside the
                // preview (a click, Enter, a click on the backdrop) reaches the
                // cmdk item and binds the chart.
                <span
                    className="contents"
                    onClick={stop}
                    onPointerDown={stop}
                    onPointerMove={stop}
                    onMouseDown={stop}
                    onKeyDown={stop}
                >
                    <ChartPage1Dialog
                        fileId={fileId}
                        title={title}
                        mimeType={mimeType}
                        onClose={() => setEnlarged(false)}
                        returnFocusTo={ref}
                    />
                </span>
            )}
        </>
    )
}

function ChartPage1Dialog({
    fileId,
    title,
    mimeType,
    onClose,
    returnFocusTo,
}: {
    fileId: string
    title: string
    mimeType?: string
    onClose: () => void
    returnFocusTo: React.RefObject<HTMLElement | null>
}) {
    const width =
        typeof window !== 'undefined'
            ? Math.min(900, Math.max(280, Math.min(window.innerWidth - 48, (window.innerHeight - 120) / 1.3)))
            : 600
    const state = usePage1(fileId, width, mimeType, true, true)
    const result = state.status === 'done' ? state.result : null

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogContent
                className="max-w-fit p-3 gap-2"
                data-testid="chart-page1-dialog"
                onCloseAutoFocus={(e) => {
                    // Back to the picker's search box so the arrow keys work again.
                    e.preventDefault()
                    const input = returnFocusTo.current
                        ?.closest('[cmdk-root]')
                        ?.querySelector<HTMLInputElement>('[cmdk-input]')
                    ;(input ?? returnFocusTo.current)?.focus()
                }}
            >
                <div className="flex items-center gap-2 pr-8">
                    <DialogTitle className="truncate text-sm font-medium">{title}</DialogTitle>
                    <DialogDescription className="sr-only">Page 1 of this chart. Close to go back to the list.</DialogDescription>
                </div>
                <div
                    className="flex items-center justify-center overflow-auto rounded bg-white/5"
                    style={{ width, minHeight: Math.round(width * 1.29) }}
                >
                    {result?.kind === 'image' ? (
                        <img src={result.url} alt={`Page 1 of ${title}`} style={{ width }} className="bg-white" />
                    ) : result ? (
                        <p className="p-6 text-sm text-muted-foreground" data-testid="chart-page1-none">
                            {result.reason === 'error'
                                ? 'Couldn’t load a preview of this chart.'
                                : 'No preview for this kind of chart.'}
                        </p>
                    ) : (
                        <Loader2 aria-label="Loading preview" className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Keyboard route to the preview: with a candidate highlighted in a cmdk list,
 * Ctrl/⌘+Enter opens its page 1. Wire into the CommandInput's onKeyDown.
 */
export function openHighlightedChartPreview(e: React.KeyboardEvent<HTMLElement>): boolean {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return false
    const root = (e.currentTarget as HTMLElement).closest('[cmdk-root]')
    const thumb = root?.querySelector<HTMLButtonElement>('[cmdk-item][aria-selected="true"] [data-chart-thumb]')
    if (!thumb) return false
    e.preventDefault()
    e.stopPropagation()
    thumb.click()
    return true
}
