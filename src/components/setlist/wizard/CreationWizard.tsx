"use client"

import { useState, useEffect } from "react"
import {
    ChevronLeft, ChevronRight, Check, Loader2,
    Calendar as CalendarIcon, Lock, Globe, Sparkles, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { useCreationWizard, type WizardStep } from "@/hooks/use-creation-wizard"
import { TEMPLATE_LABELS } from "@/lib/liturgical-templates"

interface CreationWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
    { id: 'template', label: 'Template', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'details', label: 'Details', icon: <CalendarIcon className="h-4 w-4" /> },
]

export function CreationWizard({ open, onOpenChange }: CreationWizardProps) {
    const { isBandLeader } = useAuth()
    const wizard = useCreationWizard()

    // Reset wizard state each time the dialog opens
    useEffect(() => {
        if (open) wizard.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const isLastStep = wizard.stepIndex === wizard.totalSteps - 1

    const handleNext = () => {
        if (isLastStep) {
            wizard.create()
        } else {
            wizard.goNext()
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !wizard.creating && onOpenChange(v)}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
                {/* Step indicator */}
                <div className="flex items-center gap-1 px-6 pt-6 pb-4 border-b border-border/50">
                    {STEPS.map((s, i) => {
                        const isCurrent = s.id === wizard.step
                        const isDone = i < wizard.stepIndex
                        return (
                            <button
                                key={s.id}
                                onClick={() => i <= wizard.stepIndex && wizard.goToStep(s.id)}
                                disabled={i > wizard.stepIndex}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                    isCurrent && "bg-brand/10 text-brand",
                                    isDone && "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer",
                                    !isCurrent && !isDone && "text-muted-foreground/50 cursor-not-allowed",
                                )}
                            >
                                {isDone ? <Check className="h-3.5 w-3.5" /> : s.icon}
                                <span className="hidden sm:inline">{s.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Step content */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {wizard.step === 'template' && (
                        <TemplateStep wizard={wizard} />
                    )}
                    {wizard.step === 'details' && (
                        <DetailsStep wizard={wizard} isBandLeader={isBandLeader} />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/20">
                    <Button
                        variant="ghost"
                        onClick={wizard.goBack}
                        disabled={!wizard.canGoBack || wizard.creating}
                        className="gap-1.5"
                    >
                        <ChevronLeft className="h-4 w-4" /> Back
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleNext}
                            disabled={!wizard.canGoNext || wizard.creating}
                            className={cn(
                                "gap-1.5",
                                isLastStep && "bg-brand hover:bg-brand/90",
                            )}
                        >
                            {wizard.creating ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                            ) : isLastStep ? (
                                <><Check className="h-4 w-4" /> Create Setlist</>
                            ) : (
                                <>Next <ChevronRight className="h-4 w-4" /></>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Step 1: Template Picker ──

function TemplateStep({ wizard }: { wizard: ReturnType<typeof useCreationWizard> }) {
    const regularTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'regular')
    const holidayTemplates = wizard.templateKeys.filter(k => TEMPLATE_LABELS[k]?.category === 'holiday')

    return (
        <div className="space-y-6 max-w-lg mx-auto">
            <div>
                <h2 className="text-xl font-bold mb-1">Choose a template</h2>
                <p className="text-sm text-muted-foreground">
                    Pick a service type to get a pre-filled liturgical skeleton, or start blank.
                </p>
            </div>

            {/* Regular templates */}
            <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Regular Services</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {regularTemplates.map(key => {
                        const meta = TEMPLATE_LABELS[key]
                        const isSelected = wizard.selectedTemplate === key
                        return (
                            <button
                                key={key}
                                onClick={() => wizard.setSelectedTemplate(isSelected ? null : key)}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                                    isSelected
                                        ? "border-brand bg-brand/10 ring-1 ring-brand/30"
                                        : "border-border/50 bg-card/70 hover:bg-card hover:border-border"
                                )}
                            >
                                <div className={cn(
                                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                    isSelected ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"
                                )}>
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{meta?.label || key}</div>
                                    <div className="text-xs text-muted-foreground">{meta?.slotCount || 0} slots</div>
                                </div>
                                {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Holiday templates */}
            <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Holiday Services</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {holidayTemplates.map(key => {
                        const meta = TEMPLATE_LABELS[key]
                        const isSelected = wizard.selectedTemplate === key
                        return (
                            <button
                                key={key}
                                onClick={() => wizard.setSelectedTemplate(isSelected ? null : key)}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                                    isSelected
                                        ? "border-brand bg-brand/10 ring-1 ring-brand/30"
                                        : "border-border/50 bg-card/70 hover:bg-card hover:border-border"
                                )}
                            >
                                <div className={cn(
                                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                    isSelected ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"
                                )}>
                                    <FileText className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{meta?.label || key}</div>
                                    <div className="text-xs text-muted-foreground">{meta?.slotCount || 0} slots</div>
                                </div>
                                {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Blank option */}
            <button
                onClick={() => wizard.setSelectedTemplate(null)}
                className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                    wizard.selectedTemplate === null
                        ? "border-muted-foreground/30 bg-muted/20"
                        : "border-border/30 bg-transparent hover:bg-muted/10"
                )}
            >
                <div className="text-sm text-muted-foreground">
                    Or skip template and start with a blank setlist
                </div>
            </button>
        </div>
    )
}

// ── Step 2: Details (Name, Date, Rabbi, Public/Private) ──

function DetailsStep({ wizard, isBandLeader }: { wizard: ReturnType<typeof useCreationWizard>; isBandLeader: boolean }) {
    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []

    return (
        <div className="space-y-6 max-w-md mx-auto">
            <div>
                <h2 className="text-xl font-bold mb-1">Name your setlist</h2>
                <p className="text-sm text-muted-foreground">
                    {wizard.selectedTemplate
                        ? "Auto-generated from template. Edit if needed."
                        : "What service is this for?"}
                </p>
            </div>

            <Input
                value={wizard.name}
                onChange={(e) => wizard.setName(e.target.value)}
                placeholder="e.g., Shabbat Morning, Friday Night..."
                className="text-lg h-12 bg-background/50 border-border"
                autoFocus
            />

            <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Date</label>
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

                {/* Rabbi */}
                {rabbiProfiles.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-muted-foreground">Rabbi</label>
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

            {/* Public/Private */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg border border-border/50">
                <button
                    onClick={() => wizard.setIsPublic(false)}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors",
                        !wizard.isPublic ? "bg-blue-600 text-foreground shadow-lg shadow-blue-900/20" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                >
                    <Lock className="h-4 w-4" /> Personal
                </button>
                {isBandLeader ? (
                    <button
                        onClick={() => wizard.setIsPublic(true)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors",
                            wizard.isPublic ? "bg-green-600 text-foreground shadow-lg shadow-green-900/20" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                    >
                        <Globe className="h-4 w-4" /> Public
                    </button>
                ) : (
                    <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground/60 cursor-not-allowed opacity-50" title="Only Leaders can create Public Setlists">
                        <Globe className="h-4 w-4" /> Public
                    </div>
                )}
            </div>
        </div>
    )
}
