"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, FileMusic, Folder, Loader2, Wand2, Play, Pause, Headphones, CloudOff, CheckCircle2, Pencil, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DriveFile } from "@/types/models"
import { isFileCached } from "@/lib/cache-utils"
import { splitChartComposer } from "@/lib/library/chart-composer"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import type { T } from "@/i18n/core"
import type { Formatter } from "@/i18n/format"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { cn } from "@/lib/utils"

interface LibraryFileRowProps {
    item: DriveFile
    onClick: () => void
    isDigitizing: boolean
    isAdmin: boolean
    onDigitize?: () => void
    onArchive?: () => void
    onRename?: (item: DriveFile) => void
    getCleanName: (name: string) => string
    isPlaying?: boolean
    selectMode?: boolean
    isSelected?: boolean
    onToggleSelect?: (id: string) => void
    onLongPress?: (id: string) => void
    usageInfo?: { lastUsedDate: string; totalUses: number } | null
    canAddToSetlist?: boolean
    onAddToSetlist?: (item: DriveFile) => void
    /**
     * Multi-tenant phase 5: the chart is shared from another tenant. It can be
     * viewed and added to setlists, never changed: Digitize, Rename and
     * Archive are replaced by a disabled note. `badge` adds "From {owner}"
     * (chip rows; a tenant's own section keeps its look).
     */
    sharedFrom?: { owner: string; badge: boolean }
}

function isAudioMime(item: DriveFile) {
    return item.mimeType?.startsWith('audio/') ||
        /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(item.name)
}

/** Chart format from the file name / mime type; null when unknown. */
function libraryFormatKey(item: DriveFile): string | null {
    const name = item.name?.toLowerCase() ?? ""
    const mime = item.mimeType?.toLowerCase() ?? ""
    if (/\.(musicxml|mxl|xml)$/.test(name) || mime.includes("musicxml")) return "setlistGrid.chipFormatMusicXml"
    if (name.endsWith(".pdf") || mime === "application/pdf") return "setlistGrid.chipFormatPdf"
    if (mime.startsWith("image/")) return "setlistGrid.chipFormatImage"
    if (mime.startsWith("text/") || name.endsWith(".txt")) return "setlistGrid.chipFormatText"
    return null
}

function getAudioCleanName(name: string) {
    return name
        .replace(/\.(mp3|m4a|wav|aac|ogg|flac|pdf|musicxml|xml|mxl)$/i, '')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
}

export function LibraryFileRow({ item, onClick, isDigitizing, isAdmin, onDigitize, onArchive, onRename, getCleanName, isPlaying, selectMode, isSelected, onToggleSelect, onLongPress, usageInfo, canAddToSetlist, onAddToSetlist, sharedFrom }: LibraryFileRowProps) {
    const t = useT()
    const fmt = useFormat()
    const isFolder = item.mimeType?.includes('folder')
    const isAudio = isAudioMime(item)
    const [isCached, setIsCached] = useState(false)

    useEffect(() => {
        if (isFolder || !item.id) return
        isFileCached(item.id).then(setIsCached).catch(() => {})
    }, [item.id, isFolder])

    const displayName = isFolder
        ? item.name
        : item.displayName
            ? item.displayName
            : isAudio
                ? getAudioCleanName(item.name)
                : getCleanName(item.name)

    // v11.7-05: for chart rows, split the trailing composer/arrangement
    // parenthetical out of the title so it can render as a dimmed sub-label
    // (text-only; never a thumbnail). Folders/audio keep their full name.
    const isChart = !isFolder && !isAudio
    const { title: chartTitle, composer } = isChart
        ? splitChartComposer(displayName)
        : { title: displayName, composer: undefined as string | undefined }

    // Chart format (PDF / MusicXML / image / text), the same words the editor's chip uses.
    const formatKey = isChart ? libraryFormatKey(item) : null

    const handleClick = () => {
        if (selectMode && !isFolder && onToggleSelect) {
            onToggleSelect(item.id)
        } else {
            onClick()
        }
    }

    const touchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleTouchStart = () => {
        if (!isFolder && onLongPress && !selectMode) {
            touchTimeout.current = setTimeout(() => {
                onLongPress(item.id)
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50)
            }, 500)
        }
    }

    const handleTouchEndOrMove = () => {
        if (touchTimeout.current) {
            clearTimeout(touchTimeout.current)
            touchTimeout.current = null
        }
    }

    useEffect(() => {
        return () => {
            if (touchTimeout.current) clearTimeout(touchTimeout.current)
        }
    }, [])

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Button
                    variant="ghost"
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEndOrMove}
                    onTouchMove={handleTouchEndOrMove}
                    onTouchCancel={handleTouchEndOrMove}
                    type="button"
                    aria-label={isFolder
                        ? t("library.row.openFolderLabel", { name: displayName })
                        : isAudio
                            ? (isPlaying ? t("library.row.pauseLabel", { name: displayName }) : t("library.row.playLabel", { name: displayName }))
                            : t("library.row.viewLabel", { name: displayName })}
                    aria-pressed={selectMode ? isSelected : undefined}
                    // C7I2-003: `justify-start` overrides the Button base
                    // `justify-center`. Without it, when a long row name
                    // exceeds the row width the flex content overflows
                    // EQUALLY on both sides, clipping the leading character
                    // ("Adonai Oz …" → "donai Oz …") at iPad-Mini viewport.
                    className={cn(
                        "w-full h-auto text-start justify-start rounded-none whitespace-normal group relative active:scale-100",
                        "bg-card hover:bg-accent/60 border-b border-rule focus-visible:ring-inset",
                        (isSelected || (isAudio && isPlaying)) && "bg-accent",
                        isChart && isDigitizing && "bg-accent cursor-wait",
                    )}
                >
                    {/* Web refresh (blend E): one dense hairline row — the title
                        with its setting, then a quiet meta line (format ·
                        library · tempo · topics · recency), and the key tag in
                        its own column on the right. */}
                    <div data-slot="library-row-cell" className="flex items-center gap-3 py-1.5 px-3 sm:px-4 min-h-12 w-full">
                        {/* Select mode checkbox */}
                        {selectMode && !isFolder && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-brand border-brand' : 'border-muted-foreground/40'
                                }`}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand-foreground" />}
                            </div>
                        )}

                        {isFolder ? (
                            <Folder className="h-5 w-5 text-section-ochre shrink-0" />
                        ) : isAudio ? (
                            <div className="h-8 w-8 shrink-0 rounded-full bg-accent flex items-center justify-center">
                                {isPlaying ? (
                                    <Pause className="h-4 w-4 text-brand" />
                                ) : (
                                    // Optical centring of the play triangle, a physical icon that
                                    // never mirrors, so the nudge stays physical too.
                                    <Play className="h-4 w-4 text-brand ml-0.5" />
                                )}
                            </div>
                        ) : isDigitizing ? (
                            <Loader2 className="h-5 w-5 text-brand shrink-0 animate-spin" />
                        ) : (
                            <FileMusic className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-brand transition-colors" />
                        )}

                        <div className="flex-1 min-w-0">
                            <p className="line-clamp-2 break-words leading-snug">
                                <span className="font-medium text-[16px] text-foreground">
                                    {isChart ? chartTitle : displayName}
                                </span>
                                {/* v11.7-05: composer/arrangement (the setting) as a
                                    dimmed sub-label — subordinate to the title,
                                    never competing; omitted when absent (text-only). */}
                                {composer && (
                                    <span className="ms-2 text-sm font-medium text-muted-foreground">
                                        {composer}
                                    </span>
                                )}
                            </p>

                            <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-muted-foreground">
                                {isAudio && (
                                    <span className="inline-flex items-center gap-1">
                                        <Headphones className="w-3 h-3" aria-hidden="true" />
                                        {t("library.row.audio")}
                                    </span>
                                )}

                                {isChart && formatKey && (
                                    <span data-testid="library-row-format">{t(formatKey)}</span>
                                )}

                                {isChart && item.collection === 'supplemental' && (
                                    <span>
                                        {/* i18n-ignore: collection (book) name, data — not translated */}
                                        Shireinu
                                    </span>
                                )}

                                {isChart && item.collection === 'nava' && (
                                    <span>
                                        {/* i18n-ignore: collection (book) name, data — not translated */}
                                        Nava Tehilah
                                    </span>
                                )}

                                {isChart && item.collection !== 'supplemental' && item.collection !== 'nava' && (
                                    <span>{t("org.library.ownBadge")}</span>
                                )}

                                {isChart && item.metadata?.bpm && (
                                    <span>{t("library.row.bpm", { bpm: item.metadata.bpm })}</span>
                                )}

                                {sharedFrom?.badge && (
                                    <span
                                        data-testid="shared-owner-badge"
                                        title={t("library.shared.readOnly", { owner: sharedFrom.owner })}
                                        className="px-1.5 rounded-sm border border-border"
                                    >
                                        {t("library.shared.fromOwner", { owner: sharedFrom.owner })}
                                    </span>
                                )}

                                {isCached && !isFolder && (
                                    <span className="inline-flex items-center gap-1 text-success" title={t("library.row.cachedTitle")}>
                                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                        {t("library.row.cached")}
                                    </span>
                                )}

                                {isChart && item.metadata?.topics && item.metadata.topics.length > 0 && (
                                    <span className="hidden sm:inline">
                                        {item.metadata.topics.slice(0, 2).join(", ")}
                                    </span>
                                )}

                                {/* Song Usage Badge — v11.7-05: visible at all
                                    widths (was hidden sm:inline) so recency
                                    reads on iPad portrait too. */}
                                {isChart && usageInfo && (
                                    <span title={t("library.row.lastUsedTitle", { date: usageInfo.lastUsedDate })}>
                                        {formatUsageBadge(usageInfo.lastUsedDate, usageInfo.totalUses, t, fmt)}
                                    </span>
                                )}

                                {isDigitizing && (
                                    <span className="font-semibold text-brand">
                                        {t("library.row.digitizing")}
                                    </span>
                                )}
                            </div>
                        </div>

                        {isChart && item.metadata?.key && (
                            <span className="tnum shrink-0 inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-md border border-border bg-secondary text-sm font-bold text-secondary-foreground">
                                <span className="sr-only">{t("setlistGrid.columnKey")} </span>
                                {item.metadata.key}
                            </span>
                        )}
                        {!isAudio && <DirectionalIcon icon={ChevronRight} className="h-5 w-5 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />}
                    </div>
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {canAddToSetlist && !isFolder && !isAudio && onAddToSetlist && (
                    <ContextMenuItem onClick={() => onAddToSetlist(item)}>
                        <span className="flex items-center gap-2">
                            <ListPlus className="h-4 w-4" /> {t("library.row.addToSetlist")}
                        </span>
                    </ContextMenuItem>
                )}
                <ContextMenuItem onClick={onClick}>
                    {isFolder ? t("library.row.openFolder") : isAudio ? t("library.row.play") : t("library.row.selectView")}
                </ContextMenuItem>

                {!isFolder && !isAudio && sharedFrom && (
                    <ContextMenuItem disabled title={t("library.shared.readOnly", { owner: sharedFrom.owner })}>
                        <span className="text-xs text-muted-foreground">{t("library.shared.readOnly", { owner: sharedFrom.owner })}</span>
                    </ContextMenuItem>
                )}

                {!isFolder && !isAudio && !sharedFrom && (
                    <>
                        {isAdmin && item.mimeType.includes("pdf") && onDigitize && (
                            <ContextMenuItem
                                onClick={onDigitize}
                                disabled={isDigitizing}
                                className="text-brand focus:text-brand/80 focus:bg-brand/10"
                            >
                                {isDigitizing ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> {t("library.row.digitizing")}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Wand2 className="h-4 w-4" /> {t("library.row.digitize")}
                                    </span>
                                )}
                            </ContextMenuItem>
                        )}

                        {isAdmin && onRename && (
                            <ContextMenuItem
                                onClick={() => onRename(item)}
                            >
                                <span className="flex items-center gap-2">
                                    <Pencil className="h-4 w-4" /> {t("library.row.rename")}
                                </span>
                            </ContextMenuItem>
                        )}

                        {isAdmin && onArchive && (
                            <ContextMenuItem
                                onClick={onArchive}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                                <span className="flex items-center gap-2">
                                    <CloudOff className="h-4 w-4" /> {t("library.row.archive")}
                                </span>
                            </ContextMenuItem>
                        )}
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}

/** Format a compact usage badge like "Last: Jan 31 · 4×" */
function formatUsageBadge(lastUsedDate: string, totalUses: number, t: T, fmt: Formatter): string {
    const date = fmt.date(lastUsedDate, { month: 'short', day: 'numeric' })
    return date
        ? t("library.row.usageBadge", { date, uses: totalUses })
        : t("library.row.usageBadgeNoDate", { uses: totalUses })
}
