"use client"

import { useEffect } from "react"
import { Check, Loader2, Calendar as CalendarIcon } from "lucide-react"
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

interface CreationWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// Sentinel for the "no template" option — empty-string values are forbidden by shadcn Select.
const BLANK = "__blank__"

export function CreationWizard({ open, onOpenChange }: CreationWizardProps) {
    const wizard = useCreationWizard()

    // Reset state each time the dialog opens
    useEffect(() => {
        if (open) wizard.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []

    const regularTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'regular')
    const holidayTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'holiday')

    const handleSubmit = () => {
        if (wizard.canCreate && !wizard.creating) wizard.create()
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !wizard.creating && onOpenChange(v)}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-md p-0">
                <div className="px-6 pt-6 pb-2">
                    <h2 className="text-xl font-bold mb-1">New Setlist</h2>
                    <p className="text-sm text-muted-foreground">
                        Name it and create. Optionally pick a template to pre-fill the liturgical skeleton.
                    </p>
                </div>

                <div className="px-6 py-4 space-y-4">
                    {/* Template shortcut */}
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
                                <SelectItem value={BLANK}>Blank setlist</SelectItem>
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

                    {/* Name (required, autofocus) */}
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
                            placeholder="e.g., Shabbat Morning, Friday Night..."
                            className="text-base h-11 bg-background/50 border-border"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Date (optional)</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-background/50",
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

                        {/* Rabbi (only when congregation has a list) */}
                        {rabbiProfiles.length > 0 && (
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
                        ) : (
                            <><Check className="h-4 w-4" /> Create Setlist</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
