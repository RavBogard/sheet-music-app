import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, type Setlist } from "@/lib/setlist-firebase"
import { assignMusicians } from "@/lib/scheduling-firebase"
import type { SetlistTrack, SetlistMusician, DriveFile } from "@/types/models"
import { toast } from "sonner"

export type WizardStep = 'details' | 'songs' | 'musicians'

const STEP_ORDER: WizardStep[] = ['details', 'songs', 'musicians']

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

    // Step 1: Details
    name: string
    setName: (v: string) => void
    isPublic: boolean
    setIsPublic: (v: boolean) => void
    eventDate: Date | null
    setEventDate: (v: Date | null) => void
    rabbi: string
    setRabbi: (v: string) => void

    // Step 2: Songs
    tracks: SetlistTrack[]
    setTracks: (v: SetlistTrack[]) => void
    addSongsFromFiles: (files: DriveFile[]) => void

    // Step 3: Musicians
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

    const [step, setStep] = useState<WizardStep>('details')
    const [creating, setCreating] = useState(false)

    // Step 1
    const [name, setName] = useState("")
    const [isPublic, setIsPublic] = useState(false)
    const [eventDate, setEventDate] = useState<Date | null>(null)
    const [rabbi, setRabbi] = useState("")

    // Step 2
    const [tracks, setTracks] = useState<SetlistTrack[]>([])

    // Step 3
    const [musicians, setMusicians] = useState<SetlistMusician[]>([])

    const stepIndex = STEP_ORDER.indexOf(step)
    const totalSteps = STEP_ORDER.length

    const canGoBack = stepIndex > 0
    const canGoNext = useMemo(() => {
        if (step === 'details') return name.trim().length > 0
        return true // Songs, musicians are all optional to skip
    }, [step, name])

    const goNext = useCallback(() => {
        if (stepIndex < STEP_ORDER.length - 1) {
            setStep(STEP_ORDER[stepIndex + 1])
        }
    }, [stepIndex])

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
        setStep('details')
        setCreating(false)
        setName("")
        setIsPublic(false)
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

            // 1. Create the setlist
            const setlistId = await service.createSetlist(name, tracks, isPublic, {
                eventDate: eventDate?.toISOString() ?? undefined,
                rabbi: rabbi || undefined,
                musicians,
            })

            // 2. Schedule musicians (if any selected and setlist is public)
            if (musicians.length > 0 && isPublic) {
                const musiciansToAssign = musicians
                    .filter(m => m.uid) // Only registered musicians
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
                        // Don't block creation if scheduling fails
                        toast.error('Setlist created but musician scheduling failed')
                    }
                }
            }

            toast.success(`"${name}" created!`)
            router.push(`/setlists/${setlistId}`)
        } catch (err) {
            toast.error('Failed to create setlist')
        } finally {
            setCreating(false)
        }
    }, [user, creating, name, tracks, isPublic, eventDate, rabbi, musicians, router])

    return {
        step,
        stepIndex,
        totalSteps,
        canGoBack,
        canGoNext,
        goNext,
        goBack,
        goToStep,
        name,
        setName,
        isPublic,
        setIsPublic,
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
