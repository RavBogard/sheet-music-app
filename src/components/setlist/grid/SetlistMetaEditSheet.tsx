'use client'

import { format } from 'date-fns'
import { Calendar as CalendarIcon, Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
import { cn } from '@/lib/utils'
import type { Setlist } from '@/types/models'

type ServiceType = NonNullable<Setlist['templateType']>

// shadcn Select forbids empty-string item values — sentinel for "no service
// type set" (mirrors CreationWizard's BLANK pattern).
const NO_SERVICE_TYPE = '__none__'

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
    shabbat_morning: 'Shabbat Morning',
    friday_night: 'Friday Night',
    rosh_hashanah: 'Rosh Hashanah',
    yom_kippur: 'Yom Kippur',
    festival: 'Festival',
    other: 'Other',
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
    }
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
    applyEdit = defaultApplyEdit,
}: SetlistMetaEditSheetProps) {
    const initialDate = toDate(initial.eventDate ?? null)

    const [name, setName] = useState(initial.name)
    const [eventDate, setEventDate] = useState<Date | undefined>(
        initialDate ?? undefined,
    )
    const [serviceType, setServiceType] = useState<Setlist['templateType']>(
        initial.templateType,
    )
    const [rabbi, setRabbi] = useState(initial.rabbi ?? '')
    const [saving, setSaving] = useState(false)

    // Re-seed the form whenever the sheet transitions closed → open, so
    // reopening always shows the setlist's current values (not stale edits).
    useEffect(() => {
        if (open) {
            setName(initial.name)
            setEventDate(toDate(initial.eventDate ?? null) ?? undefined)
            setServiceType(initial.templateType)
            setRabbi(initial.rabbi ?? '')
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

        if (serviceType !== initial.templateType) {
            patch.templateType = serviceType ?? null
        }

        if (rabbi !== (initial.rabbi ?? '')) {
            patch.rabbi = rabbi.trim() ? rabbi.trim() : null
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
            toast.success('Setlist details updated')
            onOpenChange(false)
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? `Couldn't save setlist details: ${err.message}`
                    : "Couldn't save setlist details",
            )
            // Keep the sheet open so the edits aren't lost — Daniel can retry.
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
            <SheetContent
                side="right"
                className="flex flex-col gap-0 w-full sm:max-w-md"
            >
                <SheetHeader>
                    <SheetTitle>Edit setlist details</SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-5 py-6 flex-1">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-name" variant="setlist">
                            Name
                        </Label>
                        <Input
                            id="setlist-meta-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Shabbat Morning"
                            className="h-11 text-base bg-background/50 border-border"
                        />
                    </div>

                    {/* Event date */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-date" variant="setlist">
                            Event date
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="setlist-meta-date"
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        'h-11 w-full justify-start text-left font-normal bg-background/50',
                                        !eventDate && 'text-muted-foreground',
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {eventDate
                                        ? format(eventDate, 'PPP')
                                        : 'Pick a date'}
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

                    {/* Service type */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-service" variant="setlist">
                            Service type
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
                                <SelectValue placeholder="Select a service type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_SERVICE_TYPE}>
                                    None
                                </SelectItem>
                                {SERVICE_TYPE_ORDER.map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {SERVICE_TYPE_LABELS[t]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Rabbi */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="setlist-meta-rabbi" variant="setlist">
                            Rabbi
                        </Label>
                        <Input
                            id="setlist-meta-rabbi"
                            value={rabbi}
                            onChange={(e) => setRabbi(e.target.value)}
                            placeholder="Who's leading this service"
                            className="h-11 text-base bg-background/50 border-border"
                        />
                    </div>
                </div>

                <SheetFooter className="gap-2 border-t border-border/50 pt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="min-h-[44px]"
                    >
                        Cancel
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
                                Saving…
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4" />
                                Save
                            </>
                        )}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
