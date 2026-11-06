"use client"

import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, X } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect } from "react"

import { useChartContentDir } from "@/components/i18n/ChartContent"
import { ChartNoteStrip } from "@/components/performance/ChartNoteStrip"
import type { ViewerKind } from "@/components/performance/resolveViewerKind"
import { RecordingPlayer } from "@/components/recordings/RecordingPlayer"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { useT } from "@/i18n/client"
import {
    loadAudioViewer,
    loadImageScoreViewer,
    loadPDFViewer,
    loadSmartScoreViewer,
    loadTextScoreViewer,
} from "@/lib/perform-chart-loaders"
import { useMusicStore } from "@/lib/store"
import { transposeChord } from "@/lib/music-math"
import { cn } from "@/lib/utils"

import type { RehearseSongRow } from "../../rows"

/** Shown in the chart area while a viewer's code loads; each viewer then shows its own spinner while the file loads. */
function ChartLoading() {
    const t = useT()
    return (
        <div
            role="status"
            data-testid="rehearse-chart-loading"
            className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
        >
            <Loader2 aria-hidden className="h-6 w-6 motion-safe:animate-spin" />
            <span>{t("recordings.chartLoading")}</span>
        </div>
    )
}
const loading = () => <ChartLoading />

// Same viewers Perform mounts; SSR off like Perform (pdf.js and OSMD need the browser).
const PDFViewer = dynamic(() => loadPDFViewer().then((m) => m.PDFViewer), { ssr: false, loading })
const SmartScoreViewer = dynamic(() => loadSmartScoreViewer().then((m) => m.SmartScoreViewer), { ssr: false, loading })
const TextScoreViewer = dynamic(() => loadTextScoreViewer().then((m) => m.TextScoreViewer), { ssr: false, loading })
const ImageScoreViewer = dynamic(() => loadImageScoreViewer().then((m) => m.ImageScoreViewer), { ssr: false, loading })
const AudioViewer = dynamic(() => loadAudioViewer().then((m) => m.AudioViewer), { ssr: false, loading })

export interface RehearseTrackClientProps {
    setlistId: string
    song: RehearseSongRow
    kind: ViewerKind | null
    prevId: string | null
    nextId: string | null
    /** 1-based place among the setlist's songs, and how many there are; the position line shows when both are set. */
    position?: number
    total?: number
    /** The next song, for the "Next:" line, as Perform's viewer shows it. */
    next?: { title: string; key: string | null } | null
}

/** The chart for one song. Always read-only: nothing here writes the song's key. */
export function RehearseChart({ song, kind }: { song: RehearseSongRow; kind: ViewerKind | null }) {
    const t = useT()
    const fileId = song.fileId
    if (!fileId || !kind) {
        return (
            <p className="p-6 text-center text-sm text-muted-foreground" data-testid="rehearse-no-chart">
                {t("recordings.noChart")}
            </p>
        )
    }
    const url = `/api/drive/file/${fileId}`
    switch (kind) {
        case "musicxml":
            // readOnly: SmartScoreViewer never heals or overwrites track.key here.
            return <SmartScoreViewer fileId={fileId} trackId={song.id} trackKey={song.key ?? undefined} readOnly />
        case "text":
            return <TextScoreViewer fileId={fileId} />
        case "image":
            return <ImageScoreViewer url={url} alt={song.title} />
        case "audio":
            return <AudioViewer fileId={fileId} title={song.title} />
        case "unknown":
            return (
                <p role="alert" className="p-6 text-center text-sm text-muted-foreground">
                    {t("perform.overlay.unknownTitle")}
                </p>
            )
        default:
            return <PDFViewer url={url} trackName={song.title} hideSuggestions />
    }
}

const stepBtn =
    "touch-hit inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"

/** Local-only transposition for a MusicXML chart. Lives in the viewer's store; never saved. */
function KeyControl({ keyName, canTranspose }: { keyName: string | null; canTranspose: boolean }) {
    const t = useT()
    const transposition = useMusicStore((s) => s.transposition)
    const setTransposition = useMusicStore((s) => s.setTransposition)
    const setMusicXmlKey = useMusicStore((s) => s.setMusicXmlKey)
    const detected = useMusicStore((s) => s.musicXmlKey)
    // Every chart opens in its written key, and leaves that way. The detected
    // key is shared store state, so clear it too: prev/next never shows the
    // previous song's key.
    useEffect(() => {
        setTransposition(0)
        setMusicXmlKey(null)
        return () => {
            setTransposition(0)
            setMusicXmlKey(null)
        }
    }, [setTransposition, setMusicXmlKey])
    const base = keyName ?? (canTranspose ? detected : null)
    const shown = base ? (transposition ? transposeChord(base, transposition) : base) : null
    if (!canTranspose) {
        return shown ? (
            <span data-testid="rehearse-key" className="tnum text-sm font-bold text-foreground">
                {shown}
            </span>
        ) : null
    }
    return (
        <div className="flex items-center gap-1" role="group" aria-label={t("recordings.transposeGroup")}>
            <button
                type="button"
                className={stepBtn}
                aria-label={t("recordings.transposeDown")}
                onClick={() => setTransposition(transposition - 1)}
            >
                <Minus aria-hidden className="h-4 w-4" />
            </button>
            <button
                type="button"
                data-testid="rehearse-key"
                aria-label={t("recordings.transposeReset", { key: shown ?? "" })}
                aria-disabled={transposition === 0}
                onClick={() => {
                    if (transposition !== 0) setTransposition(0)
                }}
                className={cn(
                    "tnum inline-flex h-11 min-w-12 items-center justify-center rounded-md px-1 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    transposition === 0 && "cursor-default",
                )}
            >
                {shown ?? "–"}
            </button>
            <button
                type="button"
                className={stepBtn}
                aria-label={t("recordings.transposeUp")}
                onClick={() => setTransposition(transposition + 1)}
            >
                <Plus aria-hidden className="h-4 w-4" />
            </button>
        </div>
    )
}


/** Previous / next song, shaped like Perform's viewer chevrons. A missing end is a disabled stand-in. */
function StepLink({ href, label, dir }: { href: string | null; label: string; dir: "prev" | "next" }) {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight
    const cls = cn(
        "touch-hit inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
        // Perform marks the forward step: the way through a setlist.
        dir === "next" ? "border border-brand/20 bg-brand/10 text-foreground" : "text-muted-foreground",
    )
    const icon = <Icon aria-hidden className="h-8 w-8 rtl:-scale-x-100" />
    if (!href) {
        return (
            <span aria-disabled="true" aria-label={label} role="link" data-testid={`rehearse-${dir}`} className={cn(cls, "pointer-events-none opacity-40")}>
                {icon}
            </span>
        )
    }
    return (
        <Link href={href} replace aria-label={label} data-testid={`rehearse-${dir}`} className={cn(cls, "hover:bg-brand/10 hover:text-foreground")}>
            {icon}
        </Link>
    )
}

/**
 * /rehearse/[id]/track/[trackId]: the chart full screen in Perform's viewer
 * chrome (the note strip above the chart, the toolbar below it), with the
 * song's recording and the local key control in the toolbar's first row.
 */
export function RehearseTrackClient({ setlistId, song, kind, prevId, nextId, position, total, next }: RehearseTrackClientProps) {
    const t = useT()
    const chartDir = useChartContentDir()
    const base = `/rehearse/${setlistId}`
    const step = (id: string | null) => (id ? `${base}/track/${id}` : null)
    return (
        <div
            data-testid="rehearse-track"
            className="fixed inset-0 z-50 flex h-dvh flex-col bg-background pe-[env(safe-area-inset-right)] ps-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]"
        >
            {/* Perform's strip: the row's note, one line, a tap for all of it. */}
            <ChartNoteStrip key={song.id} notes={song.notes ?? undefined} />

            {/* The toolbar is a sibling, not an overlay, so it never covers the last system. */}
            <div
                data-testid="rehearse-chart"
                {...chartDir}
                className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                tabIndex={0}
                aria-label={t("perform.overlay.scrollRegion")}
            >
                <SectionErrorBoundary key={song.id} label={t("perform.overlay.chart")}>
                    <div className="h-full w-full pb-6">
                        <RehearseChart song={song} kind={kind} />
                    </div>
                </SectionErrorBoundary>
            </div>

            <footer data-testid="rehearse-dock" className="shrink-0 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)]">
                {/* Row 1: the recording, and the key (local transposition for MusicXML). */}
                <div className="flex min-h-14 items-center gap-3 border-b border-rule px-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                        {song.take ? (
                            <RecordingPlayer key={song.take.id} recordingId={song.take.id} title={song.take.title} />
                        ) : (
                            <p className="text-xs text-muted-foreground">{t("recordings.noRecordingYet")}</p>
                        )}
                    </div>
                    <KeyControl key={song.id} keyName={song.key} canTranspose={kind === "musicxml"} />
                </div>
                {/* Row 2: exit, then song navigation, as in Perform. */}
                <div className="flex min-h-16 items-center gap-2 px-2 sm:px-3">
                    <Link
                        href={base}
                        data-testid="rehearse-back"
                        aria-label={t("recordings.backToRehearse")}
                        className="touch-hit inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-card px-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"
                    >
                        <X aria-hidden className="h-5 w-5" />
                        <span className="hidden text-xs font-bold uppercase tracking-wider sm:inline">{t("perform.toolbar.exit")}</span>
                    </Link>
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-4">
                        <StepLink href={step(prevId)} label={t("recordings.previousSong")} dir="prev" />
                        <div className="flex min-w-0 flex-1 flex-col items-center px-1 sm:max-w-md">
                            <h1 className="w-full truncate text-center text-lg font-bold leading-tight text-foreground sm:text-2xl">
                                {song.title}
                            </h1>
                            {position && total ? (
                                <p data-testid="rehearse-position" className="tnum flex w-full min-w-0 items-baseline justify-center gap-1 text-xs font-medium text-muted-foreground sm:text-sm">
                                    <span className="shrink-0 uppercase tracking-wide">
                                        {t("perform.songPosition", { position, total })}
                                    </span>
                                    {next ? (
                                        <span className="min-w-0 truncate">
                                            <span aria-hidden="true">· </span>
                                            {next.key
                                                ? t("perform.nav.nextUp", { title: next.title, key: next.key })
                                                : t("perform.nav.nextUpNoKey", { title: next.title })}
                                        </span>
                                    ) : null}
                                </p>
                            ) : null}
                        </div>
                        <StepLink href={step(nextId)} label={t("recordings.nextSong")} dir="next" />
                    </div>
                    {/* Balances the exit button so the title sits centred. */}
                    <span aria-hidden="true" className="hidden h-12 min-w-12 shrink-0 sm:block sm:w-[5.5rem]" />
                </div>
            </footer>
        </div>
    )
}
