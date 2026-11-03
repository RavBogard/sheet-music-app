"use client"

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect } from "react"

import { useChartContentDir } from "@/components/i18n/ChartContent"
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

// Same viewers Perform mounts; SSR off like Perform (pdf.js and OSMD need the browser).
const PDFViewer = dynamic(() => loadPDFViewer().then((m) => m.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => loadSmartScoreViewer().then((m) => m.SmartScoreViewer), { ssr: false })
const TextScoreViewer = dynamic(() => loadTextScoreViewer().then((m) => m.TextScoreViewer), { ssr: false })
const ImageScoreViewer = dynamic(() => loadImageScoreViewer().then((m) => m.ImageScoreViewer), { ssr: false })
const AudioViewer = dynamic(() => loadAudioViewer().then((m) => m.AudioViewer), { ssr: false })

export interface RehearseTrackClientProps {
    setlistId: string
    song: RehearseSongRow
    kind: ViewerKind | null
    prevId: string | null
    nextId: string | null
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

function StepLink({ href, label, dir }: { href: string | null; label: string; dir: "prev" | "next" }) {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight
    const cls = cn(
        "touch-hit inline-flex h-11 shrink-0 items-center gap-1 rounded-md border border-input px-3 text-sm font-semibold text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
        dir === "next" && "flex-row-reverse",
    )
    const icon = <Icon aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
    if (!href) {
        return (
            <span aria-disabled="true" data-testid={`rehearse-${dir}`} className={cn(cls, "pointer-events-none opacity-40")}>
                {icon}
                <span className="sr-only sm:not-sr-only">{label}</span>
            </span>
        )
    }
    return (
        <Link href={href} replace data-testid={`rehearse-${dir}`} className={cn(cls, "hover:bg-accent")}>
            {icon}
            <span className="sr-only sm:not-sr-only">{label}</span>
        </Link>
    )
}

/** /rehearse/[id]/track/[trackId]: the chart full screen, a docked bar with the song's player and prev/next. */
export function RehearseTrackClient({ setlistId, song, kind, prevId, nextId }: RehearseTrackClientProps) {
    const t = useT()
    const chartDir = useChartContentDir()
    const base = `/rehearse/${setlistId}`
    const step = (id: string | null) => (id ? `${base}/track/${id}` : null)
    return (
        <div
            data-testid="rehearse-track"
            className="fixed inset-0 z-50 flex h-dvh flex-col bg-background pe-[env(safe-area-inset-right)] ps-[env(safe-area-inset-left)]"
        >
            <header className="flex flex-wrap items-center gap-x-2 border-b border-rule px-2 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-4">
                <Link
                    href={base}
                    data-testid="rehearse-back"
                    className="touch-hit inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"
                >
                    <ChevronLeft aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                    <span className="sr-only sm:not-sr-only">{t("recordings.backToRehearse")}</span>
                </Link>
                <h1 className="min-w-0 flex-1 truncate text-center text-base font-extrabold leading-tight text-foreground">
                    {song.title}
                </h1>
                <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">
                    <KeyControl key={song.id} keyName={song.key} canTranspose={kind === "musicxml"} />
                </div>
            </header>

            {/* The dock is a sibling, not an overlay, so it can never cover the last system. */}
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

            <footer
                data-testid="rehearse-dock"
                className="flex items-center gap-2 border-t border-rule bg-background px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
            >
                <StepLink href={step(prevId)} label={t("recordings.previousSong")} dir="prev" />
                <div className="min-w-0 flex-1">
                    {song.take ? (
                        <RecordingPlayer key={song.take.id} recordingId={song.take.id} title={song.take.title} compact />
                    ) : (
                        <p className="truncate text-center text-xs text-muted-foreground">
                            {t("recordings.noRecordingYet")}
                        </p>
                    )}
                </div>
                <StepLink href={step(nextId)} label={t("recordings.nextSong")} dir="next" />
            </footer>
        </div>
    )
}
