'use client'

import { storedClassFor } from '@/lib/history/classify'
import { Calendar as CalendarIcon, Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { formatError } from '@/lib/format-error'
import { useI18n } from '@/i18n/client'
import { useFormat } from '@/i18n/format-client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { toDate } from '@/lib/firestore-helpers'
import type { EditDescriptor } from '@/lib/local/types'
import { applyEdit as defaultApplyEdit } from '@/lib/local/write'
import { useOrg } from '@/lib/org/org-context'
import { hidesLiturgicalFields, isBandTenant } from '@/lib/org/vocab'
import { HHMM_RE, type Gig, type SetTarget } from '@/lib/gig/model'
import { cn } from '@/lib/utils'
import type { Setlist } from '@/types/models'

type ServiceType = NonNullable<Setlist['templateType']>

// shadcn Select forbids empty-string item values — sentinel for "no service
// type set" (mirrors CreationWizard's BLANK pattern).
const NO_SERVICE_TYPE = '__none__'

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
    shabbat_morning: 'setlistGrid.serviceTypeShabbatMorning',
    friday_night: 'setlistGrid.serviceTypeFridayNight',
    rosh_hashanah: 'setlistGrid.serviceTypeRoshHashanah',
    yom_kippur: 'setlistGrid.serviceTypeYomKippur',
    festival: 'setlistGrid.serviceTypeFestival',
    other: 'setlistGrid.serviceTypeOther',
}

const SERVICE_TYPE_ORDER: ServiceType[] = [
    'shabbat_morning',
    'friday_night',
    'rosh_hashanah',
    'yom_kippur',
    'festival',
    'other',
]

export interface SetlistMetaEditSheetProps {
    setlistId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Current setlist values used to seed the form. `eventDate` may be a ms
     *  number (LocalSetlist), an ISO string (post-applyEdit), or a Firestore
     *  shape — `toDate` normalizes all of them. */
    initial: {
        name: string
        eventDate?: number | string | null
        rabbi?: string
        templateType?: Setlist['templateType']
        /** BET-5: the gig (band tenants). */
        gig?: Gig | null
    }
    /**
     * BET-5: the sets (header rows) in the author's order, for the per-set
     * target lengths, with the minutes each set's target resolves to today.
     */
    sets?: Array<{ id: string; title: string; targetMinutes?: number }>
    /** Injectable for tests — defaults to the real outbox writer. */
    applyEdit?: (edit: EditDescriptor) => Promise<void>
}

/**
 * v70-09: edit a setlist's metadata (name / event date / service type / rabbi)
 * after creation. Opened from the pencil button in SetlistGridTopBar. Writes
 * route through the v6.0 sync engine via `applyEdit('update', 'setlists', …)`;
 * the patch carries ONLY the fields that actually changed. Cancel / Escape /
 * an unchanged Save are all non-destructive (no write enqueued).
 */
export function SetlistMetaEditSheet({
    setlistId,
    open,
    onOpenChange,
    initial,
    sets = EMPTY_SETS,
    applyEdit = defaultApplyEdit,
}: SetlistMetaEditSheetProps) {
    const { t, isRtl } = useI18n()
    const fmt = useFormat()
    const initialDate = toDate(initial.eventDate ?? null)

    // v11-03-03: non-synagogue tenants (Brothers Lazaroff) hide the
    // service-type + rabbi fields and use band vocab. Hidden fields keep their
    // state seeded from `initial`, so the save handler's per-field diff never
    // enqueues a spurious templateType/rabbi patch.
    const org = useOrg()
    const hideLiturgical = hidesLiturgicalFields(org)

    const [name, setName] = useState(initial.name)
    const [eventDate, setEventDate] = useState<Date | undefined>(
        initialDate ?? undefined,
    )
    const [serviceType, setServiceType] = useState<Setlist['templateType']>(
        initial.templateType,
    )
    const [rabbi, setRabbi] = useState(initial.rabbi ?? '')
    const [saving, setSaving] = useState(false)

    // BET-5: the gig fields, band tenants only. Times are the browser's
    // 24-hour <input type="time"> value (HH:mm whatever the display locale).
    const isBand = isBandTenant(org)
    const [gigDraft, setGigDraft] = useState<GigDraft>(() => gigDraftOf(initial.gig))
    const [targets, setTargets] = useState<Record<string, string>>(() => targetDraftOf(sets))
    const [targetsTouched, setTargetsTouched] = useState(false)
    const [gigError, setGigError] = useState(false)

    // Re-seed the form whenever the sheet transitions closed → open, so
    // reopening always shows the setlist's current values (not stale edits).
    useEffect(() => {
        if (open) {
            setName(initial.name)
            setEventDate(toDate(initial.eventDate ?? null) ?? undefined)
            setServiceType(initial.templateType)
            setRabbi(initial.rabbi ?? '')
            setGigDraft(gigDraftOf(initial.gig))
            setTargets(targetDraftOf(sets))
            setTargetsTouched(false)
            setGigError(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const nameValid = name.trim().length > 0

    const handleSave = async () => {
        if (!nameValid || saving) return

        const patch: Record<string, unknown> = {}

        if (name !== initial.name) patch.name = name.trim()

        const initialMs = initialDate?.getTime() ?? null
        const currentMs = eventDate?.getTime() ?? null
        if (currentMs !== initialMs) {
            // firestoreTimestampSchema accepts Date / {seconds,nanoseconds} /
            // string — NOT plain numbers. ISO string matches what
            // service.createSetlist writes for this field.
            patch.eventDate = eventDate ? eventDate.toISOString() : null
        }

        // Setlist memory r2: the stored class (serviceType / rabbiSlot) is
        // written from the same normalisation as the edited field, so it can
        // never go stale against what the author just typed.
        if (serviceType !== initial.templateType) {
            patch.templateType = serviceType ?? null
            patch.serviceType = storedClassFor({ templateType: serviceType ?? null }).serviceType ?? null
        }

        if (rabbi !== (initial.rabbi ?? '')) {
            patch.rabbi = rabbi.trim() ? rabbi.trim() : null
            patch.rabbiSlot = storedClassFor({ rabbi: rabbi.trim() || null }).rabbiSlot ?? null
        }

        if (isBand) {
            const built = buildGig(gigDraft, initial.gig ?? null, targetsTouched ? targets : null, sets)
            if (!built.ok) {
                setGigError(true)
                return
            }
            setGigError(false)
            // Compared against the stored gig read the same way, so a stored
            // gig whose keys sit in another order is not rewritten unchanged.
            const before = buildGig(gigDraftOf(initial.gig), initial.gig ?? null, null, sets)
            const beforeGig = before.ok ? before.gig : initial.gig ?? null
            if (JSON.stringify(built.gig) !== JSON.stringify(beforeGig)) patch.gig = built.gig
        }

        // Nothing changed — close without enqueueing a write (AC-4).
        if (Object.keys(patch).length === 0) {
            onOpenChange(false)
            return
        }

        setSaving(true)
        try {
            await applyEdit({
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch,
            })
            toast.success(t('setlistGrid.metaSaved'))
            onOpenChange(false)
        } catch (err) {
            toast.error(t('setlistGrid.metaSaveFailed', { error: formatError(err) }))
            // Keep the sheet open so the edits aren't lost — Daniel can retry.
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
            <SheetContent
                // The sheet slides in from the inline end: right in ltr (as
                // before), left on a right-to-left page.
                side={isRtl ? 'left' : 'right'}
                className="flex flex-col gap-0 w-full sm:max-w-md"
            >
                <SheetHeader>
                    <SheetTitle>{t('org.editSetlistDetails')}</SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-5 py-6 flex-1">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-name" variant="setlist">
                            {t('setlistGrid.metaName')}
                        </Label>
                        <Input
                            id="setlist-meta-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('org.namePlaceholder')}
                            className="h-11 text-base bg-background/50 border-border"
                        />
                    </div>

                    {/* Event date */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-date" variant="setlist">
                            {t('setlistGrid.metaEventDate')}
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="setlist-meta-date"
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        'h-11 w-full justify-start text-start font-normal bg-background/50',
                                        !eventDate && 'text-muted-foreground',
                                    )}
                                >
                                    <CalendarIcon className="me-2 h-4 w-4" />
                                    {eventDate
                                        ? fmt.pattern(eventDate, 'PPP')
                                        : t('setlistGrid.metaPickDate')}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-auto p-0 bg-card border-border"
                                align="start"
                            >
                                <Calendar
                                    mode="single"
                                    selected={eventDate}
                                    onSelect={(d) => setEventDate(d ?? undefined)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Service type + Rabbi — synagogue-only; hidden for
                        non-synagogue tenants (e.g. Brothers Lazaroff). */}
                    {!hideLiturgical && (
                        <>
                            {/* Service type */}
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="setlist-meta-service" variant="setlist">
                                    {t('setlistGrid.metaServiceType')}
                                </Label>
                                <Select
                                    value={serviceType ?? NO_SERVICE_TYPE}
                                    onValueChange={(v) =>
                                        setServiceType(
                                            v === NO_SERVICE_TYPE
                                                ? undefined
                                                : (v as ServiceType),
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        id="setlist-meta-service"
                                        className="h-11 bg-background/50"
                                    >
                                        <SelectValue placeholder={t('setlistGrid.metaServiceTypePlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_SERVICE_TYPE}>
                                            {t('setlistGrid.metaServiceTypeNone')}
                                        </SelectItem>
                                        {SERVICE_TYPE_ORDER.map((st) => (
                                            <SelectItem key={st} value={st}>
                                                {t(SERVICE_TYPE_LABELS[st])}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Rabbi */}
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="setlist-meta-rabbi" variant="setlist">
                                    {t('setlistGrid.metaRabbi')}
                                </Label>
                                <Input
                                    id="setlist-meta-rabbi"
                                    value={rabbi}
                                    onChange={(e) => setRabbi(e.target.value)}
                                    placeholder={t('setlistGrid.metaRabbiPlaceholder')}
                                    className="h-11 text-base bg-background/50 border-border"
                                />
                            </div>
                        </>
                    )}

                    {isBand && (
                        <fieldset data-testid="gig-fields" className="flex flex-col gap-4 border-t border-rule pt-5">
                            <legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground mb-1">
                                {t('gig.sheetGigHeading')}
                            </legend>
                            {PLACE_FIELDS.map(([f, labelKey, max]) => (
                                <div key={f} className="flex flex-col gap-1.5">
                                    <Label htmlFor={`gig-${f}`} variant="setlist">{t(labelKey)}</Label>
                                    <Input
                                        id={`gig-${f}`}
                                        value={gigDraft[f]}
                                        maxLength={max}
                                        onChange={(e) => setGigDraft((d) => ({ ...d, [f]: e.target.value }))}
                                        className="h-11 text-base bg-background/50 border-border"
                                    />
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-3">
                                {TIME_FIELDS.map(([f, labelKey]) => (
                                    <div key={f} className="flex flex-col gap-1.5">
                                        <Label htmlFor={`gig-${f}`} variant="setlist">{t(labelKey)}</Label>
                                        <Input
                                            id={`gig-${f}`}
                                            type="time"
                                            value={gigDraft[f]}
                                            onChange={(e) => setGigDraft((d) => ({ ...d, [f]: e.target.value }))}
                                            className="tnum h-11 text-base bg-background/50 border-border"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="gig-notes" variant="setlist">{t('gig.fieldNotes')}</Label>
                                <textarea
                                    id="gig-notes"
                                    value={gigDraft.notes}
                                    maxLength={2000}
                                    rows={2}
                                    onChange={(e) => setGigDraft((d) => ({ ...d, notes: e.target.value }))}
                                    className="min-h-11 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                            {sets.length > 0 && (
                                <div className="flex flex-col gap-2" data-testid="gig-set-targets">
                                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                        {t('gig.setTargetsHeading')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{t('gig.setTargetsHint')}</p>
                                    {sets.map((set) => (
                                        <div key={set.id} className="flex items-center gap-3">
                                            <Label htmlFor={`gig-target-${set.id}`} variant="setlist" className="min-w-0 flex-1 truncate">
                                                {t('gig.setTargetLabel', { set: set.title || t('gig.setUntitled') })}
                                            </Label>
                                            <Input
                                                id={`gig-target-${set.id}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                max={600}
                                                value={targets[set.id] ?? ''}
                                                onChange={(e) => {
                                                    setTargetsTouched(true)
                                                    setTargets((cur) => ({ ...cur, [set.id]: e.target.value }))
                                                }}
                                                className="tnum h-11 w-24 text-base bg-background/50 border-border"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {gigError && (
                                <p role="alert" data-testid="gig-error" className="text-sm font-semibold text-warning-line">
                                    {t('gig.gigInvalid')}
                                </p>
                            )}
                        </fieldset>
                    )}
                </div>

                <SheetFooter className="gap-2 border-t border-border/50 pt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="min-h-[44px]"
                    >
                        {t('setlistGrid.cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={!nameValid || saving}
                        className="min-h-[44px] gap-1.5 bg-brand hover:bg-brand/90"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('setlistGrid.saving')}
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4" />
                                {t('setlistGrid.save')}
                            </>
                        )}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}

// ── BET-5: the gig draft ──

type GigTextField = 'venue' | 'address' | 'loadIn' | 'soundcheck' | 'start' | 'end' | 'contact' | 'notes'
type GigDraft = Record<GigTextField, string>

const EMPTY_SETS: Array<{ id: string; title: string; targetMinutes?: number }> = []

const PLACE_FIELDS: ReadonlyArray<[GigTextField, string, number]> = [
    ['venue', 'gig.fieldVenue', 200],
    ['address', 'gig.fieldAddress', 500],
    ['contact', 'gig.fieldContact', 500],
]

const TIME_FIELDS: ReadonlyArray<[GigTextField, string]> = [
    ['loadIn', 'gig.fieldLoadIn'],
    ['soundcheck', 'gig.fieldSoundcheck'],
    ['start', 'gig.fieldStart'],
    ['end', 'gig.fieldEnd'],
]

const GIG_TEXT_FIELDS: readonly GigTextField[] = ['venue', 'address', 'loadIn', 'soundcheck', 'start', 'end', 'contact', 'notes']
const GIG_TIME_FIELDS = new Set<GigTextField>(['loadIn', 'soundcheck', 'start', 'end'])

function gigDraftOf(gig: Gig | null | undefined): GigDraft {
    const out = {} as GigDraft
    for (const f of GIG_TEXT_FIELDS) {
        const v = gig?.[f]
        out[f] = typeof v === 'string' ? v : ''
    }
    return out
}

function targetDraftOf(sets: ReadonlyArray<{ id: string; targetMinutes?: number }>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const s of sets) out[s.id] = s.targetMinutes === undefined ? '' : String(s.targetMinutes)
    return out
}

/**
 * The gig to store, with only the fields that hold a value, in the order the
 * model lists them; `null` when nothing is left. Set targets are rewritten
 * (by header row id) only when the author edited them; otherwise the stored
 * ones are kept as they are.
 */
export function buildGig(
    draft: GigDraft,
    previous: Gig | null,
    targets: Record<string, string> | null,
    sets: ReadonlyArray<{ id: string }>,
): { ok: true; gig: Gig | null } | { ok: false } {
    const gig: Gig = {}
    for (const f of GIG_TEXT_FIELDS) {
        const v = draft[f].trim()
        if (!v) continue
        if (GIG_TIME_FIELDS.has(f) && !HHMM_RE.test(v)) return { ok: false }
        gig[f] = v
    }
    let setTargets: SetTarget[] | undefined = previous?.setTargets
    if (targets) {
        setTargets = []
        for (const s of sets) {
            const raw = (targets[s.id] ?? '').trim()
            if (!raw) continue
            const minutes = Number(raw)
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return { ok: false }
            setTargets.push({ headerRowId: s.id, minutes })
        }
    }
    if (setTargets && setTargets.length > 0) gig.setTargets = setTargets
    return { ok: true, gig: Object.keys(gig).length > 0 ? gig : null }
}
