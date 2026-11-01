"use client"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { AudioLines, Download, Plus, Loader2, MoreVertical, Copy, PlusSquare, BookmarkPlus, Star, Trash2, Pencil } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Setlist } from "@/lib/setlist-firebase"
import { getServiceContext, type ServiceType } from "@/lib/liturgical-calendar"
import { useOrg } from "@/lib/org/org-context"
import { hidesLiturgicalFields } from "@/lib/org/vocab"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { cn } from "@/lib/utils"
import { RowDate } from "./RowDate"
import { formatUpdatedWhen } from "@/lib/format/updated-when"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// v52-05: Phase 1 scope for the "Save as Default for {type}" affordance.
// Daniel's 90% workflow is Shabbat morning + Erev Shabbat clones; future
// expansion to other ServiceType values is additive (just add to the set
// + label map, no schema migration).
const PHASE_1_DEFAULT_TYPES: ReadonlyArray<ServiceType> = ['shabbat_morning', 'friday_night']

/** Catalogue keys of the service-type labels (English: "Shabbat Morning", "Friday Night"). */
export const SERVICE_TYPE_LABEL_KEYS: Partial<Record<ServiceType, string>> = {
    shabbat_morning: "setlist.serviceTypeShabbatMorning",
    friday_night: "setlist.serviceTypeFridayNight",
}

function inferServiceType(setlist: Setlist): ServiceType | null {
    // Prefer explicit templateType when set to a real service type. 'other'
    // and 'festival' are non-specific buckets — fall through to date-based
    // inference for those.
    const tt = setlist.templateType
    if (tt && tt !== 'other' && tt !== 'festival') {
        return tt as ServiceType
    }
    const date = toDateHelper(setlist.eventDate ?? setlist.date)
    if (!date) return null
    return getServiceContext(date).type
}

/* ─── One list row (Option B): every setlist on /setlists is drawn by this ─── */

/**
 * The one /setlists row class: the date column, the title and ONE meta line,
 * then the row actions. Upcoming, past, family-group heads and the Plan
 * Service row all use it, so the list reads as one Logic-style track list.
 */
export const SETLIST_ROW_CLASS =
    "group relative flex items-center gap-3 ps-3 pe-1.5 sm:ps-4 sm:pe-2 py-1.5 min-h-12 bg-card hover:bg-accent/50 transition-colors"

/** The one setlist-row title style: 0.95rem/600, two lines at most. */
export const SETLIST_ROW_TITLE_CLASS = "text-[0.95rem] font-semibold leading-snug text-foreground line-clamp-2"

/** The one meta line under a row title. */
const META_CLASS = "tnum flex flex-wrap items-center gap-x-1.5 min-w-0 text-xs text-muted-foreground [&>*]:whitespace-nowrap"

function Dot() {
    return <span aria-hidden="true" className="text-muted-foreground/60">·</span>
}

/**
 * The row status: how many of the songs have a chart bound (as the editor
 * says it), then how fresh the setlist is. Neutral when every song has a
 * chart; the caution ink (not bold) when some don't. "Updated…" drops below
 * sm so the meta stays on one line on a phone.
 */
function RowStatus({ setlist }: { setlist: Setlist }) {
    const t = useT()
    const fmt = useFormat()
    const total = (setlist.songCount ?? setlist.trackCount) || 0
    const fileIds = Array.isArray(setlist.fileIds) ? setlist.fileIds : null
    const bound = fileIds ? Math.min(fileIds.length, total) : null
    const updatedAt = toDateHelper(setlist.updatedAt)
    return (
        <>
            {bound !== null && total > 0 ? (
                <>
                    <Dot />
                    <span
                        data-testid="setlist-charts-bound"
                        data-complete={bound >= total ? "true" : "false"}
                        className={cn(bound < total && "text-caution")}
                    >
                        {t("setlist.chartsBound", { bound, total })}
                    </span>
                </>
            ) : null}
            {updatedAt ? (
                <span className="hidden sm:contents">
                    <Dot />
                    <span>{t("setlist.updatedAgo", { when: formatUpdatedWhen(fmt, updatedAt) })}</span>
                </span>
            ) : null}
        </>
    )
}

/**
 * The row's meta line: song count, charts and freshness. The date is NOT
 * repeated here (the date column already shows it); only a row without a
 * date says so.
 */
export function SetlistInfoLine({ setlist, extra }: { setlist: Setlist; extra?: ReactNode }) {
    const t = useT()
    const eventDate = toDateHelper(setlist.eventDate)
    return (
        <div className={META_CLASS}>
            {!eventDate ? (
                <>
                    <span>{t("setlist.noDate")}</span>
                    <Dot />
                </>
            ) : null}
            <span>{t("setlist.songCount", { count: (setlist.songCount ?? setlist.trackCount) || 0 })}</span>
            {extra ? (
                <>
                    <Dot />
                    {extra}
                </>
            ) : null}
            <RowStatus setlist={setlist} />
        </div>
    )
}

interface RowActionsProps {
    setlist: Setlist
    /** Upcoming rows also show a small Listen link beside the pencil. */
    upcoming?: boolean
    onEdit: (e: React.MouseEvent) => void
    onDownload?: (setlist: Setlist) => void
    isDownloading?: boolean
    onDuplicate?: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    canEdit: boolean
    isAdmin: boolean
}

/**
 * The one row-actions cluster: a ghost pencil and a kebab, on every row at
 * every width, always visible. Everything else (download, clone, template,
 * default, delete) lives in the kebab. Both are 36px drawn, 44px to the touch.
 */
function RowActions({ upcoming, setlist, onEdit, onDownload, isDownloading, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onSaveAsDefault, onDelete, canDelete, canDuplicate, canEdit, isAdmin }: RowActionsProps) {
    const t = useT()
    const org = useOrg() // v11-05-05: gate the liturgical "Save as Default" affordance for band tenants
    const hasMenu = canEdit || canDuplicate || canDelete
    const listenHref = `/listen/${setlist.id}`
    if (!canEdit && !hasMenu) {
        // Listening is public: a signed-out visitor still gets the link on upcoming rows.
        return upcoming ? (
            <div className="relative z-10 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                <Link href={listenHref} aria-label={t("recordings.listenAria", { name: setlist.name })} title={t("recordings.listen")} className={ICON_BUTTON_CLASS}>
                    <AudioLines className="h-4 w-4" />
                </Link>
            </div>
        ) : null
    }
    const inferred = inferServiceType(setlist)
    const canSaveAsDefault =
        isAdmin &&
        !!onSaveAsDefault &&
        !!inferred &&
        PHASE_1_DEFAULT_TYPES.includes(inferred) &&
        // v11-05-05: liturgical service-type affordance is CRC-only.
        !hidesLiturgicalFields(org)
    const defaultLabelKey = inferred ? SERVICE_TYPE_LABEL_KEYS[inferred] : null
    return (
        <div className="relative z-10 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
            {upcoming ? (
                <Link href={listenHref} aria-label={t("recordings.listenAria", { name: setlist.name })} title={t("recordings.listen")} className={ICON_BUTTON_CLASS}>
                    <AudioLines className="h-4 w-4" />
                </Link>
            ) : null}
            {canEdit ? (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(e) }}
                    aria-label={t("setlist.editSetlistAria", { name: setlist.name })}
                    title={t("setlist.edit")}
                    className={ICON_BUTTON_CLASS}
                >
                    <Pencil className="h-4 w-4" />
                </button>
            ) : (
                <span aria-hidden className="w-9" />
            )}
            {hasMenu ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t("setlist.menuAria", { name: setlist.name })}
                            className={ICON_BUTTON_CLASS}
                        >
                            <MoreVertical className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem asChild>
                            <Link href={listenHref} data-testid="setlist-card-listen">
                                <AudioLines className="h-4 w-4 me-2" />
                                {t("recordings.listen")}
                            </Link>
                        </DropdownMenuItem>
                        {canDuplicate && onCloneNextWeek && (
                            <DropdownMenuItem onClick={(e) => onCloneNextWeek(setlist, e)}>
                                <PlusSquare className="h-4 w-4 me-2" />
                                {t("setlist.cloneNextWeek")}
                            </DropdownMenuItem>
                        )}
                        {canEdit && onDownload && (
                            <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); onDownload(setlist) }}
                                aria-label={t("setlist.downloadOfflineAria", { name: setlist.name })}
                            >
                                <Download className={cn("h-4 w-4 me-2", isDownloading && "animate-pulse text-brand")} />
                                {t("setlist.downloadOffline")}
                            </DropdownMenuItem>
                        )}
                        {canDuplicate && onDuplicate && (
                            <DropdownMenuItem onClick={(e) => onDuplicate(setlist, e)}>
                                <Copy className="h-4 w-4 me-2" />
                                {t("setlist.duplicateSetlist")}
                            </DropdownMenuItem>
                        )}
                        {canDuplicate && onSaveAsTemplate && (
                            <DropdownMenuItem onClick={(e) => onSaveAsTemplate(setlist, e)}>
                                <BookmarkPlus className="h-4 w-4 me-2" />
                                {t("setlist.saveAsTemplate")}
                            </DropdownMenuItem>
                        )}
                        {canSaveAsDefault && defaultLabelKey && inferred && onSaveAsDefault ? (
                            <DropdownMenuItem
                                onClick={(e) => onSaveAsDefault(setlist, inferred, e)}
                                data-testid="setlist-card-save-as-default"
                            >
                                <Star className="h-4 w-4 me-2" />
                                {t("setlist.saveAsDefaultFor", { type: t(defaultLabelKey) })}
                            </DropdownMenuItem>
                        ) : null}
                        {canDelete && onDelete && (
                            <DropdownMenuItem onClick={(e) => onDelete(setlist, e)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 me-2" />
                                {t("setlist.deleteSetlist")}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <span aria-hidden className="w-9" />
            )}
        </div>
    )
}

const ICON_BUTTON_CLASS =
    "touch-hit h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer bg-transparent border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface SetlistListRowProps extends RowActionsProps {
    onPerform: (e: React.MouseEvent) => void
    navigatingTo: string | null
    /** Upcoming rows draw the month in brand blue; past rows mute it. */
    upcoming?: boolean
    /** A family group's "N other versions" toggle, in the meta line. */
    extra?: ReactNode
}

function SetlistListRow({ setlist, onPerform, navigatingTo, upcoming = false, extra, ...actions }: SetlistListRowProps) {
    const t = useT()
    const isLoading = navigatingTo === setlist.id
    const eventDate = toDateHelper(setlist.eventDate)
    return (
        // C4-003: outer is non-interactive <article>; a cover <button> sibling
        // captures whole-row taps; the actions are SIBLINGS (not descendants)
        // of the cover button, so axe sees no nested-interactive violation.
        // Content cells are pointer-events-none so taps reach the cover.
        <article
            className={cn(SETLIST_ROW_CLASS, isLoading && 'ring-2 ring-inset ring-ring', navigatingTo && !isLoading && 'opacity-50 pointer-events-none')}
        >
            <button
                type="button"
                onClick={onPerform}
                aria-label={t("setlist.openSetlistAria", { name: setlist.name })}
                className="absolute inset-0 z-0 bg-transparent border-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <span className="sr-only">{t("setlist.openSetlistSr", { name: setlist.name })}</span>
            </button>

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20 pointer-events-none">
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                </div>
            )}

            <RowDate date={eventDate} muted={!upcoming} />

            <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                <h3 title={setlist.name} className={SETLIST_ROW_TITLE_CLASS}>{setlist.name}</h3>
                <SetlistInfoLine setlist={setlist} extra={extra} />
            </div>

            <RowActions setlist={setlist} upcoming={upcoming} {...actions} />
        </article>
    )
}

/* ─── Upcoming Service row ─── */

export interface UpcomingCardProps {
    setlist: Setlist
    onPerform: (e: React.MouseEvent) => void
    onEdit: (e: React.MouseEvent) => void
    navigatingTo: string | null
    onDownload: (setlist: Setlist) => void
    isDownloading: boolean
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    /** v11.5-05-03 (Q4): show the Edit + Download (offline) controls only to
     *  signed-in users. Anon visitors view via the row tap / Perform. */
    canEdit: boolean
    isAdmin: boolean
}

export function UpcomingSetlistCard(props: UpcomingCardProps) {
    return <SetlistListRow {...props} upcoming />
}

/* ─── Past / Library row ─── */

export interface PastCardProps {
    setlist: Setlist
    onPerform: (e: React.MouseEvent) => void
    onEdit: (e: React.MouseEvent) => void
    navigatingTo: string | null
    onDownload?: (setlist: Setlist) => void
    isDownloading?: boolean
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    /** v11.5-05-03 (Q4): show the Edit control only to signed-in users. */
    canEdit: boolean
    isAdmin: boolean
    /** A family group's versions toggle (VariantGroupList). */
    extra?: ReactNode
}

export function SetlistCard(props: PastCardProps) {
    return <SetlistListRow {...props} />
}

/* ─── Plan Service row ─── */

interface PlaceholderCardProps {
    date: Date
    onCreate: (date: Date) => void
}

/**
 * An empty service slot. The same row as every setlist: the date column (in
 * the muted ink), a brand-coloured "+ Plan Service" title and the day as its
 * meta line. Not a ghost: it is an action.
 */
export function PlaceholderCard({ date, onCreate }: PlaceholderCardProps) {
    const t = useT()
    const fmt = useFormat()
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onCreate(date)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCreate(date) } }}
            className={cn(SETLIST_ROW_CLASS, "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
        >
            <RowDate date={date} muted />

            <div className="flex-1 min-w-0">
                <h3 className="flex items-center gap-1 text-[0.95rem] font-semibold leading-snug text-brand truncate">
                    <Plus aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("org.planPlaceholder")}</span>
                </h3>
                <div className={META_CLASS}>
                    {fmt.date(date, { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
            </div>
        </div>
    )
}
