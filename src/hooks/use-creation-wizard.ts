import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, type Setlist } from "@/lib/setlist-firebase"
import { assignMusicians } from "@/lib/scheduling-firebase"
import type { SetlistTrack, SetlistMusician, DriveFile } from "@/types/models"
import { toast } from "sonner"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName, getAllTemplateKeys, TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { getNextFriday, getNextSaturday, getFullServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { useLibraryStore } from "@/lib/library-store"
import { useCustomTemplates } from "@/lib/template-firebase"

export type WizardStep = 'template' | 'details'

const STEP_ORDER: WizardStep[] = ['template', 'details']

export interface UseCreationWizardReturn {
    // Navigation
    step: WizardStep
    stepIndex: number
    totalSteps: number
    canGoBack: boolean
    canGoNext: boolean
    goNext: () => void
    goBack: () => void
    goToStep: (step: WizardStep) => void

    // Step 1: Template
    selectedTemplate: string | null
    setSelectedTemplate: (key: string | null) => void
    templateKeys: string[]

    // Step 2: Details
    name: string
    setName: (v: string) => void
    eventDate: Date | null
    setEventDate: (v: Date | null) => void
    rabbi: string
    setRabbi: (v: string) => void

    // Songs (auto-populated from template or editable)
    tracks: SetlistTrack[]
    setTracks: (v: SetlistTrack[]) => void
    addSongsFromFiles: (files: DriveFile[]) => void

    // Musicians
    musicians: SetlistMusician[]
    setMusicians: (v: SetlistMusician[]) => void

    // Final
    creating: boolean
    create: () => Promise<void>
    reset: () => void
}

export function useCreationWizard(): UseCreationWizardReturn {
    const router = useRouter()
    const { user } = useAuth()

    const [step, setStep] = useState<WizardStep>('template')
    const [creating, setCreating] = useState(false)
    const { overrides: customTemplates } = useCustomTemplates()

    // Step 1: Template
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

    // Step 2: Details
    const [name, setName] = useState("")
    const [eventDate, setEventDate] = useState<Date | null>(null)
    const [rabbi, setRabbi] = useState("")

    // Tracks & musicians
    const [tracks, setTracks] = useState<SetlistTrack[]>([])
    const [musicians, setMusicians] = useState<SetlistMusician[]>([])

    const templateKeys = getAllTemplateKeys()
    const stepIndex = STEP_ORDER.indexOf(step)
    const totalSteps = STEP_ORDER.length

    const canGoBack = stepIndex > 0
    const canGoNext = useMemo(() => {
        if (step === 'template') return true // Template selection is optional (blank setlist)
        if (step === 'details') return name.trim().length > 0
        return true
    }, [step, name])

    // When template is selected, auto-fill name and date
    const handleTemplateSelect = useCallback(async (key: string | null) => {
        setSelectedTemplate(key)
        if (!key) return

        // Determine a sensible date based on template type
        const isFriday = key.includes('friday') || key === 'shir_shabbat'
        const targetDate = isFriday ? getNextFriday() : getNextSaturday()
        setEventDate(targetDate)

        // Auto-generate name from liturgical context
        try {
            const context = await getFullServiceContext(targetDate)
            context.type = key as ServiceType
            setName(generateSetlistName(context))
        } catch {
            const label = TEMPLATE_LABELS[key]?.label || 'Service'
            setName(label)
        }
    }, [])

    const goNext = useCallback(() => {
        if (stepIndex < STEP_ORDER.length - 1) {
            // When advancing from template to details, trigger auto-fill
            if (step === 'template' && selectedTemplate) {
                handleTemplateSelect(selectedTemplate)
            }
            setStep(STEP_ORDER[stepIndex + 1])
        }
    }, [stepIndex, step, selectedTemplate, handleTemplateSelect])

    const goBack = useCallback(() => {
        if (stepIndex > 0) {
            setStep(STEP_ORDER[stepIndex - 1])
        }
    }, [stepIndex])

    const goToStep = useCallback((s: WizardStep) => setStep(s), [])

    const addSongsFromFiles = useCallback((files: DriveFile[]) => {
        const newTracks: SetlistTrack[] = files.map(f => ({
            id: crypto.randomUUID(),
            title: f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
            fileId: f.id,
            fileName: f.name,
            key: f.metadata?.key,
            bpm: f.metadata?.bpm,
        }))
        setTracks(prev => [...prev, ...newTracks])
    }, [])

    const reset = useCallback(() => {
        setStep('template')
        setCreating(false)
        setSelectedTemplate(null)
        setName("")
        setEventDate(null)
        setRabbi("")
        setTracks([])
        setMusicians([])
    }, [])

    const create = useCallback(async () => {
        if (!user || creating) return
        setCreating(true)

        try {
            const service = createSetlistService(user.uid, user.displayName)

            // If a template was selected, build tracks from template + library
            let finalTracks = tracks
            if (selectedTemplate && finalTracks.length === 0) {
                const template = getTemplate(selectedTemplate, customTemplates)
                if (template && eventDate) {
                    toast.loading('Building setlist from template...')
                    const baseContext = await getFullServiceContext(eventDate)
                    baseContext.type = selectedTemplate as ServiceType
                    const context = rabbi ? { ...baseContext, rabbi } : baseContext
                    const { allFiles } = useLibraryStore.getState()
                    finalTracks = buildSetlistFromTemplate(template, allFiles, context)
                    toast.dismiss()
                }
            }

            // Create the setlist
            const setlistId = await service.createSetlist(name, finalTracks, {
                eventDate: eventDate?.toISOString() ?? undefined,
                rabbi: rabbi || undefined,
                musicians,
                templateType: selectedTemplate as Setlist['templateType'],
            })

            // Schedule musicians (if any selected)
            if (musicians.length > 0) {
                const musiciansToAssign = musicians
                    .filter(m => m.uid)
                    .map(m => ({
                        uid: m.uid!,
                        name: m.name,
                        email: m.email,
                        instrument: m.instrument,
                    }))

                if (musiciansToAssign.length > 0) {
                    try {
                        await assignMusicians({
                            setlistId,
                            setlistName: name,
                            eventDate: eventDate?.toISOString() ?? null,
                            musicians: musiciansToAssign,
                        })
                    } catch {
                        toast.error('Setlist created but musician scheduling failed')
                    }
                }
            }

            // Report matching stats
            if (selectedTemplate) {
                const matched = finalTracks.filter(t => t.fileId).length
                const total = finalTracks.filter(t => t.type === 'song').length
                toast.success(`Created "${name}" — ${matched}/${total} songs matched`)
            } else {
                toast.success(`"${name}" created!`)
            }

            router.push(`/setlists/${setlistId}`)
        } catch (err) {
            toast.dismiss()
            toast.error('Failed to create setlist')
        } finally {
            setCreating(false)
        }
    }, [user, creating, name, tracks, eventDate, rabbi, musicians, selectedTemplate, router, customTemplates])

    return {
        step,
        stepIndex,
        totalSteps,
        canGoBack,
        canGoNext,
        goNext,
        goBack,
        goToStep,
        selectedTemplate,
        setSelectedTemplate: handleTemplateSelect,
        templateKeys,
        name,
        setName,
        eventDate,
        setEventDate,
        rabbi,
        setRabbi,
        tracks,
        setTracks,
        addSongsFromFiles,
        musicians,
        setMusicians,
        creating,
        create,
        reset,
    }
}
