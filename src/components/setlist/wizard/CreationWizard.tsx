"use client"

import { useEffect } from "react"
import { Check, Loader2, Calendar as CalendarIcon, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useCongregation } from "@/lib/congregation-store"
import { useCreationWizard } from "@/hooks/use-creation-wizard"
import { TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { toDate } from "@/lib/firestore-helpers"
import type { ServiceType } from "@/lib/liturgical-calendar"
import { useOrg } from "@/lib/org/org-context"
import { label, hidesLiturgicalFields } from "@/lib/org/vocab"

interface CreationWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** v51-h01: pre-fill the wizard's eventDate when opened from a date-driven
     *  entry point (calendar tap, "upcoming" placeholder card). The wizard's
     *  eventDate effect then fires findLastMatchingService and surfaces the
     *  v51-03 three-offer strip. */
    prefilledDate?: Date | null
}

// Sentinel for the "no template" option — empty-string values are forbidden by shadcn Select.
const BLANK = "__blank__"

// Friendly labels for the Clone CTA. Driven by the user's chosen date via
// getServiceContext(). 'regular' has no Clone match (non-Shabbat, non-holiday)
// so it never reaches the CTA copy.
const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
    friday_night: 'Erev Shabbat',
    shabbat_morning: 'Shabbat morning',
    rosh_hashanah: 'Rosh Hashanah',
    yom_kippur: 'Yom Kippur',
    sukkot: 'Sukkot',
    simchat_torah: 'Simchat Torah',
    hanukkah_shabbat: 'Hanukkah Shabbat',
    purim: 'Purim',
    passover: 'Passover',
    shavuot: 'Shavuot',
    regular: 'service',
}

export function CreationWizard({ open, onOpenChange, prefilledDate }: CreationWizardProps) {
    const wizard = useCreationWizard()

    // Reset state each time the dialog opens. If opened with a prefilledDate
    // (calendar/placeholder entry point), seed eventDate so the offer strip
    // fires immediately on the v51-03 lookup effect.
    useEffect(() => {
        if (open) {
            wizard.reset()
            if (prefilledDate) wizard.setEventDate(prefilledDate)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, prefilledDate])

    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []
    // v11-05-05: band tenants (BL) get band vocab + no liturgical framing.
    const org = useOrg()
    const hideLiturgical = hidesLiturgicalFields(org)

    const regularTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'regular')
    const holidayTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'holiday')

    const handleSubmit = () => {
        if (wizard.canCreate && !wizard.creating) wizard.create()
    }

    // Offer-strip presentation derived state.
    const inferredType = wizard.inferredServiceType
    const serviceLabel = inferredType ? SERVICE_TYPE_LABELS[inferredType] : null
    // 'regular' weekday picks aren't a meaningful Clone target; suppress the
    // strip entirely so the user falls through to template/scratch.
    // v11-05-05: the offer strip is liturgical (SERVICE_TYPE_LABELS, e.g. "Erev
    // Shabbat") — hide it for band tenants; they create via date + name + template.
    const offerStripVisible = !!wizard.eventDate && !!serviceLabel && inferredType !== 'regular' && !hideLiturgical
    const cloneSourceDate = wizard.cloneSource
        ? toDate(wizard.cloneSource.eventDate ?? wizard.cloneSource.date)
        : null

    const showTemplateField = wizard.mode !== 'clone'
    const showNameField = wizard.mode !== 'clone'

    return (
        <Dialog open={open} onOpenChange={(v) => !wizard.creating && onOpenChange(v)}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-md p-0">
                <div className="px-6 pt-6 pb-2">
                    <h2 className="text-xl font-bold mb-1">{label(org, 'newSetlist')}</h2>
                    <p className="text-sm text-muted-foreground">
                        Pick a date — we&rsquo;ll offer to clone last week&rsquo;s service, use a template, or start fresh.
                    </p>
                </div>

                <div className="px-6 py-4 space-y-4">
                    {/* Date — moved to top so the offer strip can react to it */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Service date</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal h-11 bg-background/50",
                                        !wizard.eventDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {wizard.eventDate ? format(wizard.eventDate, "PPP") : "Pick a date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                                <Calendar
                                    mode="single"
                                    selected={wizard.eventDate ?? undefined}
                                    onSelect={(d) => wizard.setEventDate(d ?? null)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Three-offer strip — appears once a meaningful service date is set */}
                    {offerStripVisible && (
                        <div
                            data-testid="creation-offer-strip"
                            className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2.5"
                        >
                            {wizard.cloneSourceLoading ? (
                                <Button
                                    disabled
                                    variant="outline"
                                    className="w-full h-11 justify-start gap-2"
                                    aria-busy="true"
                                >
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Looking for last {serviceLabel}…
                                </Button>
                            ) : wizard.cloneSource ? (
                                <Button
                                    type="button"
                                    onClick={() => wizard.setMode('clone')}
                                    aria-pressed={wizard.mode === 'clone'}
                                    className={cn(
                                        "w-full h-11 justify-start gap-2 transition-colors",
                                        wizard.mode === 'clone'
                                            ? "bg-brand text-brand-foreground hover:bg-brand/90 ring-2 ring-brand/40"
                                            : "bg-brand/15 text-foreground border border-brand/40 hover:bg-brand/25"
                                    )}
                                >
                                    <Copy className="h-4 w-4 shrink-0" />
                                    <span className="flex-1 text-left truncate">
                                        Clone last {serviceLabel}
                                        {cloneSourceDate && (
                                            <span className="ml-1.5 opacity-80 font-normal">
                                                ({format(cloneSourceDate, 'MMM d')})
                                            </span>
                                        )}
                                    </span>
                                    {wizard.mode === 'clone' && <Check className="h-4 w-4 shrink-0 opacity-90" />}
                                </Button>
                            ) : (
                                // No prior match — guide the user to the alternatives without
                                // a disabled button. AC-5 allows hide-with-explanatory-text.
                                <p className="text-xs text-muted-foreground px-1 py-0.5">
                                    No prior {serviceLabel} to clone yet — pick a template or start from scratch below.
                                </p>
                            )}

                            <div className="flex items-center justify-between gap-3 px-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        wizard.setMode('template')
                                        if (!wizard.selectedTemplate) {
                                            // Suggest the inferred type when it has a matching template key.
                                            const candidate = wizard.templateKeys.find(k => k === inferredType)
                                            if (candidate) wizard.setSelectedTemplate(candidate)
                                        }
                                    }}
                                    aria-pressed={wizard.mode === 'template'}
                                    className={cn(
                                        "text-xs font-medium underline-offset-2 hover:underline min-h-[44px] py-2 px-1",
                                        wizard.mode === 'template' ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Use a template
                                </button>
                                <span aria-hidden className="text-xs text-muted-foreground/40">·</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        wizard.setMode('scratch')
                                        wizard.setSelectedTemplate(null)
                                    }}
                                    aria-pressed={wizard.mode === 'scratch'}
                                    className={cn(
                                        "text-xs font-medium underline-offset-2 hover:underline min-h-[44px] py-2 px-1",
                                        wizard.mode === 'scratch' ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Start from scratch
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Template select — hidden once user commits to clone */}
                    {showTemplateField && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Template (optional)</label>
                            <Select
                                value={wizard.selectedTemplate ?? BLANK}
                                onValueChange={(v) => wizard.setSelectedTemplate(v === BLANK ? null : v)}
                            >
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Start from blank" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={BLANK}>{label(org, 'blankSetlist')}</SelectItem>
                                    {regularTemplates.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>Regular services</SelectLabel>
                                            {regularTemplates.map(key => (
                                                <SelectItem key={key} value={key}>
                                                    {TEMPLATE_LABELS[key]?.label || key}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                    {holidayTemplates.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>Holiday services</SelectLabel>
                                            {holidayTemplates.map(key => (
                                                <SelectItem key={key} value={key}>
                                                    {TEMPLATE_LABELS[key]?.label || key}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Name — hidden when cloning (auto-derived from cloneSetlist) */}
                    {showNameField && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Name</label>
                            <Input
                                value={wizard.name}
                                onChange={(e) => wizard.setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && wizard.canCreate && !wizard.creating) {
                                        e.preventDefault()
                                        wizard.create()
                                    }
                                }}
                                placeholder={label(org, 'wizardNamePlaceholder')}
                                className="text-base h-11 bg-background/50 border-border"
                            />
                        </div>
                    )}

                    {/* Rabbi (only when congregation has a list; hidden for non-synagogue tenants) */}
                    {rabbiProfiles.length > 0 && !hideLiturgical && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Rabbi (optional)</label>
                            <Select value={wizard.rabbi} onValueChange={wizard.setRabbi}>
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Select rabbi" />
                                </SelectTrigger>
                                <SelectContent>
                                    {rabbiProfiles.map((rp) => (
                                        <SelectItem key={rp.name} value={rp.name}>{rp.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/50 bg-muted/20">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={wizard.creating}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!wizard.canCreate || wizard.creating}
                        className="gap-1.5 bg-brand hover:bg-brand/90"
                    >
                        {wizard.creating ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                        ) : wizard.mode === 'clone' && wizard.cloneSource ? (
                            <><Copy className="h-4 w-4" /> {label(org, 'cloneSetlistAction')}</>
                        ) : (
                            <><Check className="h-4 w-4" /> {label(org, 'createSetlistAction')}</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
