"use client"

import { useState, useEffect } from "react"
import {
    ChevronLeft, ChevronRight, Check, Loader2, Music, Users, ListTodo,
    Calendar as CalendarIcon, Lock, Globe, Plus, X, Trash2,
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
import { useCreationWizard, type WizardStep, type WizardTask } from "@/hooks/use-creation-wizard"
import { AddSongsModal } from "../modals/AddSongsModal"
import { MusicianPicker } from "../v2/MusicianPicker"

interface CreationWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
    { id: 'details', label: 'Details', icon: <CalendarIcon className="h-4 w-4" /> },
    { id: 'songs', label: 'Songs', icon: <Music className="h-4 w-4" /> },
    { id: 'musicians', label: 'Musicians', icon: <Users className="h-4 w-4" /> },
    { id: 'tasks', label: 'Tasks', icon: <ListTodo className="h-4 w-4" /> },
]

export function CreationWizard({ open, onOpenChange }: CreationWizardProps) {
    const { isBandLeader } = useAuth()
    const wizard = useCreationWizard()
    const [showAddSongs, setShowAddSongs] = useState(false)

    // Reset wizard state each time the dialog opens
    useEffect(() => {
        if (open) wizard.reset()
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
        <>
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
                        {wizard.step === 'details' && (
                            <DetailsStep wizard={wizard} isBandLeader={isBandLeader} />
                        )}
                        {wizard.step === 'songs' && (
                            <SongsStep wizard={wizard} onOpenPicker={() => setShowAddSongs(true)} />
                        )}
                        {wizard.step === 'musicians' && (
                            <MusiciansStep wizard={wizard} />
                        )}
                        {wizard.step === 'tasks' && (
                            <TasksStep wizard={wizard} />
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
                            {!isLastStep && (
                                <Button
                                    variant="ghost"
                                    onClick={() => wizard.goToStep('tasks')}
                                    className="text-xs text-muted-foreground"
                                >
                                    Skip to end
                                </Button>
                            )}
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

            {/* AddSongsModal (rendered outside the dialog to avoid z-index issues) */}
            <AddSongsModal
                isOpen={showAddSongs}
                onClose={() => setShowAddSongs(false)}
                onAdd={(files) => {
                    wizard.addSongsFromFiles(files)
                    setShowAddSongs(false)
                }}
                currentTrackFileIds={new Set(wizard.tracks.filter(t => t.fileId).map(t => t.fileId!))}
            />
        </>
    )
}

// ── Step 1: Details ──

function DetailsStep({ wizard, isBandLeader }: { wizard: ReturnType<typeof useCreationWizard>; isBandLeader: boolean }) {
    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []

    return (
        <div className="space-y-6 max-w-md mx-auto">
            <div>
                <h2 className="text-xl font-bold mb-1">Name your setlist</h2>
                <p className="text-sm text-muted-foreground">What service is this for?</p>
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

// ── Step 2: Songs ──

function SongsStep({ wizard, onOpenPicker }: { wizard: ReturnType<typeof useCreationWizard>; onOpenPicker: () => void }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold mb-1">Add songs</h2>
                    <p className="text-sm text-muted-foreground">
                        {wizard.tracks.length === 0
                            ? "Browse the library to add songs. You can skip this and add them later."
                            : `${wizard.tracks.length} song${wizard.tracks.length !== 1 ? 's' : ''} selected`}
                    </p>
                </div>
                <Button onClick={onOpenPicker} className="gap-1.5 bg-brand hover:bg-brand/90">
                    <Plus className="h-4 w-4" /> Add Songs
                </Button>
            </div>

            {wizard.tracks.length > 0 && (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                    {wizard.tracks.map((track, i) => (
                        <div key={track.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-card/70 hover:bg-card transition-colors group">
                            <span className="text-xs text-muted-foreground/60 w-5 text-right">{i + 1}</span>
                            <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium flex-1 truncate">{track.title}</span>
                            {track.key && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{track.key}</span>}
                            <button
                                onClick={() => wizard.setTracks(wizard.tracks.filter(t => t.id !== track.id))}
                                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {wizard.tracks.length === 0 && (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                    <Music className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No songs yet</p>
                    <p className="text-xs mt-1">Click "Add Songs" to browse the library</p>
                </div>
            )}
        </div>
    )
}

// ── Step 3: Musicians ──

function MusiciansStep({ wizard }: { wizard: ReturnType<typeof useCreationWizard> }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold mb-1">Assign musicians</h2>
                <p className="text-sm text-muted-foreground">
                    Select who will play this service. You can skip this and assign later.
                </p>
            </div>

            <MusicianPicker
                musicians={wizard.musicians}
                onChange={wizard.setMusicians}
                canEdit={true}
                setlistName={wizard.name}
                eventDate={wizard.eventDate?.toISOString() ?? null}
                rabbiName={wizard.rabbi}
            />
        </div>
    )
}

// ── Step 4: Tasks ──

function TasksStep({ wizard }: { wizard: ReturnType<typeof useCreationWizard> }) {
    const { user } = useAuth()
    const [title, setTitle] = useState("")
    const handleAdd = () => {
        if (!title.trim() || !user) return
        wizard.addTask({
            title: title.trim(),
            assigneeUid: user.uid,
            assigneeName: user.displayName || user.email?.split('@')[0] || 'Me',
            assigneeEmail: user.email || '',
        })
        setTitle("")
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold mb-1">Add prep tasks</h2>
                <p className="text-sm text-muted-foreground">
                    Assign preparation tasks. You can skip this and add them later.
                </p>
            </div>

            {/* Add form */}
            <div className="flex gap-2">
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Add chart wrapper for new song..."
                    className="flex-1 h-9"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <Button size="sm" onClick={handleAdd} disabled={!title.trim()} className="gap-1.5 h-9">
                    <Plus className="h-3.5 w-3.5" /> Add
                </Button>
            </div>

            {/* Task list */}
            {wizard.tasks.length > 0 ? (
                <div className="space-y-2">
                    {wizard.tasks.map((task, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card/70 border border-border/50 group">
                            <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{task.title}</p>
                                <p className="text-xs text-muted-foreground">{task.assigneeName}</p>
                            </div>
                            <button
                                onClick={() => wizard.removeTask(i)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border/60 rounded-xl bg-muted/10">
                    <ListTodo className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No tasks yet</p>
                    <p className="text-xs mt-1">Add preparation tasks or skip this step</p>
                </div>
            )}
        </div>
    )
}
