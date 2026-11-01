"use client"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { Download, Plus, Loader2, MoreVertical, Copy, PlusSquare, BookmarkPlus, Star, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
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

/* ─── Shared row pieces (web refresh, blend E: a clean list, not a card per row) ─── */

const ROW_CLASS =
    "group relative flex items-center gap-3 px-3 sm:px-4 py-1 min-h-11 bg-card hover:bg-accent/50 transition-colors"

function Dot() {
    return <span aria-hidden="true" className="text-muted-foreground/60">·</span>
}

/**
 * The row status: how many of the songs have a chart bound (as the editor
 * says it), then how fresh the setlist is. Neutral when every song has a
 * chart; amber when some don't. Readiness on this device belongs to Perform.
 * `fileIds` holds the setlist's distinct bound charts.
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
                        className={cn(bound < total && "text-caution font-semibold")}
                    >
                        {t("setlist.chartsBound", { bound, total })}
                    </span>
                </>
            ) : null}
            {updatedAt ? (
                <>
                    <Dot />
                    <span>{t("setlist.updatedAgo", { when: formatUpdatedWhen(fmt, updatedAt) })}</span>
                </>
            ) : null}
        </>
    )
}

/** The past-row info line: date, song count, charts and freshness. */
export function SetlistInfoLine({ setlist }: { setlist: Setlist }) {
    const t = useT()
    const fmt = useFormat()
    const eventDate = toDateHelper(setlist.eventDate)
    return (
        <div className="tnum flex items-center gap-x-1.5 flex-wrap text-xs text-muted-foreground">
            <span>{fmt.date(eventDate, { month: 'short', day: 'numeric', year: 'numeric' }) || t("setlist.noDate")}</span>
            <Dot />
            <span>{t("setlist.songCount", { count: (setlist.songCount ?? setlist.trackCount) || 0 })}</span>
            <RowStatus setlist={setlist} />
        </div>
    )
}

/* ─── Upcoming Service Card ─── */

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
     *  signed-in users. Anon visitors view via the card tap / Perform. */
    canEdit: boolean
    isAdmin: boolean
}

export function UpcomingSetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDownload, isDownloading, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onSaveAsDefault, onDelete, canDelete, canDuplicate, canEdit, isAdmin }: UpcomingCardProps) {
    const isLoading = navigatingTo === setlist.id
    const org = useOrg() // v11-05-05: gate the liturgical "Save as Default" affordance for band tenants
    const t = useT()
    const fmt = useFormat()
    const eventDate = toDateHelper(setlist.eventDate)

    return (
        // C4-003: outer is non-interactive <article>; cover-<button> sibling
        // captures whole-card taps; action buttons are SIBLINGS (not
        // descendants) of the cover button, so axe sees no nested-interactive
        // violation. Content cells set pointer-events-none so taps pass
        // through to the cover button beneath them; action region keeps the
        // default pointer-events-auto so its buttons handle their own taps.
        <article
            className={cn(ROW_CLASS, isLoading && 'ring-2 ring-inset ring-ring', navigatingTo && !isLoading && 'opacity-50 pointer-events-none')}
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
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
            )}

            <RowDate date={eventDate} />

            <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                <h3 title={setlist.name} className="text-[0.95rem] font-bold leading-snug text-foreground line-clamp-2">{setlist.name}</h3>
                <div className="tnum flex items-center gap-x-1.5 flex-wrap text-xs text-muted-foreground font-medium">
                    <span>{fmt.date(eventDate, { month: 'short', day: 'numeric', year: 'numeric' }) || t("setlist.noDate")}</span>
                    <Dot />
                    <span>{t("setlist.songCount", { count: (setlist.songCount ?? setlist.trackCount) || 0 })}</span>
                    <RowStatus setlist={setlist} />
                </div>
            </div>

            {/* C7I2-001: at <lg (iPad-Mini portrait is 768px = md, below lg 1024)
                collapse Edit + Download into the overflow menu so the title
                column gets allocated space first. Inline Edit/Download remain
                on ≥lg viewports where there's room. */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
                {canEdit && (
                    <Button
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                        className="touch-hit hidden lg:flex border-border bg-card text-foreground hover:bg-accent rounded-md px-3 h-8 text-[13px] font-semibold"
                        aria-label={t("setlist.editSetlistAria", { name: setlist.name })}
                    >
                        <Pencil className="h-3.5 w-3.5 me-1.5" />
                        {t("setlist.edit")}
                    </Button>
                )}

                {canEdit && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDownload(setlist)
                        }}
                        className="touch-hit hidden lg:flex w-9 h-9 hover:bg-accent rounded-md items-center justify-center transition-colors cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={t("setlist.downloadOfflineAria", { name: setlist.name })}
                        title={t("setlist.downloadOffline")}
                    >
                        <Download className={cn("h-4 w-4 text-muted-foreground hover:text-foreground", isDownloading && "animate-pulse text-brand")} />
                    </button>
                )}

                {(canEdit || canDuplicate || canDelete) && (
                <div className="md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={t("setlist.menuAria", { name: setlist.name })}
                                className="touch-hit w-9 h-9 hover:bg-accent rounded-md flex items-center justify-center transition-colors cursor-pointer text-muted-foreground hover:text-foreground bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onCloneNextWeek(setlist, e)}>
                                    <PlusSquare className="h-4 w-4 me-2" />
                                    {t("setlist.cloneNextWeek")}
                                </DropdownMenuItem>
                            )}
                            {canEdit && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(e); }} className="lg:hidden">
                                    <Pencil className="h-4 w-4 me-2" />
                                    {t("setlist.editSetlist")}
                                </DropdownMenuItem>
                            )}
                            {canEdit && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(setlist); }} className="lg:hidden">
                                    <Download className={`h-4 w-4 me-2 ${isDownloading ? 'animate-pulse text-brand' : ''}`} />
                                    {t("setlist.downloadOffline")}
                                </DropdownMenuItem>
                            )}
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onDuplicate(setlist, e)}>
                                    <Copy className="h-4 w-4 me-2" />
                                    {t("setlist.duplicateSetlist")}
                                </DropdownMenuItem>
                            )}
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onSaveAsTemplate(setlist, e)}>
                                    <BookmarkPlus className="h-4 w-4 me-2" />
                                    {t("setlist.saveAsTemplate")}
                                </DropdownMenuItem>
                            )}
                            {(() => {
                                const inferred = inferServiceType(setlist)
                                const canSaveAsDefault =
                                    isAdmin &&
                                    !!onSaveAsDefault &&
                                    !!inferred &&
                                    PHASE_1_DEFAULT_TYPES.includes(inferred) &&
                                    // v11-05-05: liturgical service-type affordance is CRC-only.
                                    !hidesLiturgicalFields(org)
                                const labelKey = inferred ? SERVICE_TYPE_LABEL_KEYS[inferred] : null
                                if (!canSaveAsDefault || !labelKey || !inferred) return null
                                return (
                                    <DropdownMenuItem
                                        onClick={(e) => onSaveAsDefault(setlist, inferred, e)}
                                        data-testid="setlist-card-save-as-default"
                                    >
                                        <Star className="h-4 w-4 me-2" />
                                        {t("setlist.saveAsDefaultFor", { type: t(labelKey) })}
                                    </DropdownMenuItem>
                                )
                            })()}
                            {canDelete && (
                                <DropdownMenuItem onClick={(e) => onDelete(setlist, e)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 me-2" />
                                    {t("setlist.deleteSetlist")}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                )}
            </div>
        </article>
    )
}

/* ─── Past / Library Card ─── */

export interface PastCardProps {
    setlist: Setlist
    onPerform: (e: React.MouseEvent) => void
    onEdit: (e: React.MouseEvent) => void
    navigatingTo: string | null
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    /** v11.5-05-03 (Q4): show the inline Edit control only to signed-in users. */
    canEdit: boolean
    isAdmin: boolean
}

export function SetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onSaveAsDefault, onDelete, canDelete, canDuplicate, canEdit, isAdmin }: PastCardProps) {
    const isLoading = navigatingTo === setlist.id
    const org = useOrg() // v11-05-05: gate the liturgical "Save as Default" affordance for band tenants
    const t = useT()
    const fmt = useFormat()

    const eventDate = toDateHelper(setlist.eventDate)

    return (
        // C4-003: see UpcomingSetlistCard above for the rationale; mirror the
        // cover-button-as-sibling pattern here.
        <article
            className={cn(ROW_CLASS, isLoading && 'ring-2 ring-inset ring-ring', navigatingTo && !isLoading && 'opacity-50 pointer-events-none')}
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

            <RowDate date={eventDate} muted />

            <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                <h3 title={setlist.name} className="text-[0.95rem] font-semibold leading-snug text-foreground line-clamp-2">{setlist.name}</h3>
                <SetlistInfoLine setlist={setlist} />
            </div>

            {/* Action Menu */}
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity relative z-10">
                {canEdit && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                        aria-label={t("setlist.editSetlistAria", { name: setlist.name })}
                        className="touch-hit h-9 w-9 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}

                {(canDuplicate || canDelete) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={t("setlist.menuAria", { name: setlist.name })}
                                className="touch-hit h-9 w-9 hover:bg-accent rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {canDuplicate && (
                                <>
                                    <DropdownMenuItem onClick={(e) => onDuplicate?.(setlist, e)}>
                                        <Copy className="h-4 w-4 me-2" />
                                        {t("setlist.duplicateSetlist")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => onCloneNextWeek?.(setlist, e)}>
                                        <PlusSquare className="h-4 w-4 me-2" />
                                        {t("setlist.cloneNextWeek")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => onSaveAsTemplate?.(setlist, e)}>
                                        <BookmarkPlus className="h-4 w-4 me-2" />
                                        {t("setlist.saveAsTemplate")}
                                    </DropdownMenuItem>
                                </>
                            )}
                            {(() => {
                                const inferred = inferServiceType(setlist)
                                const canSaveAsDefault =
                                    isAdmin &&
                                    !!onSaveAsDefault &&
                                    !!inferred &&
                                    PHASE_1_DEFAULT_TYPES.includes(inferred) &&
                                    // v11-05-05: liturgical service-type affordance is CRC-only.
                                    !hidesLiturgicalFields(org)
                                const labelKey = inferred ? SERVICE_TYPE_LABEL_KEYS[inferred] : null
                                if (!canSaveAsDefault || !labelKey || !inferred) return null
                                return (
                                    <DropdownMenuItem
                                        onClick={(e) => onSaveAsDefault(setlist, inferred, e)}
                                        data-testid="setlist-card-save-as-default"
                                    >
                                        <Star className="h-4 w-4 me-2" />
                                        {t("setlist.saveAsDefaultFor", { type: t(labelKey) })}
                                    </DropdownMenuItem>
                                )
                            })()}
                            {canDelete && (
                                <DropdownMenuItem onClick={(e) => onDelete?.(setlist, e)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 me-2" />
                                    {t("setlist.deleteSetlist")}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </article>
    )
}

/* ─── Placeholder Card (Plan Service) ─── */

interface PlaceholderCardProps {
    date: Date
    onCreate: (date: Date) => void
}

export function PlaceholderCard({ date, onCreate }: PlaceholderCardProps) {
    const t = useT()
    const fmt = useFormat()
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onCreate(date)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCreate(date) } }}
            className={cn(ROW_CLASS, "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
        >
            <div aria-hidden className="w-9 h-9 shrink-0 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground group-hover:text-brand group-hover:border-brand transition-colors">
                <Plus className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="text-[0.95rem] font-semibold text-muted-foreground group-hover:text-foreground transition-colors truncate">
                    {t("org.planPlaceholder")}
                </h3>
                <div className="tnum text-xs text-muted-foreground">
                    {fmt.date(date, { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
            </div>
        </div>
    )
}
