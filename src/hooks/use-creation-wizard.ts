import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, type Setlist } from "@/lib/setlist-firebase"
import { assignMusicians } from "@/lib/scheduling-firebase"
import type { SetlistTrack, SetlistMusician, DriveFile } from "@/types/models"
import { toast } from "sonner"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName, getAllTemplateKeys, TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { getFullServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { useLibraryStore } from "@/lib/library-store"
import { useCustomTemplates } from "@/lib/template-firebase"

export interface UseCreationWizardReturn {
    // Form state
    name: string
    setName: (v: string) => void
    eventDate: Date | null
    setEventDate: (v: Date | null) => void
    rabbi: string
    setRabbi: (v: string) => void

    // Optional template shortcut
    selectedTemplate: string | null
    setSelectedTemplate: (key: string | null) => void
    templateKeys: string[]

    // Songs (auto-populated from template or editable)
    tracks: SetlistTrack[]
    setTracks: (v: SetlistTrack[]) => void
    addSongsFromFiles: (files: DriveFile[]) => void

    // Musicians
    musicians: SetlistMusician[]
    setMusicians: (v: SetlistMusician[]) => void

    // Create action
    canCreate: boolean
    creating: boolean
    create: () => Promise<void>
    reset: () => void
}

export function useCreationWizard(): UseCreationWizardReturn {
    const router = useRouter()
    const { user } = useAuth()

    const [creating, setCreating] = useState(false)
    const { overrides: customTemplates } = useCustomTemplates()

    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

    const [name, setName] = useState("")
    const [eventDate, setEventDate] = useState<Date | null>(null)
    const [rabbi, setRabbi] = useState("")

    const [tracks, setTracks] = useState<SetlistTrack[]>([])
    const [musicians, setMusicians] = useState<SetlistMusician[]>([])

    const templateKeys = getAllTemplateKeys()
    const canCreate = useMemo(() => name.trim().length > 0, [name])

    // Selecting a template auto-fills name + date. Keeps the "shortcut" UX the
    // two-step wizard had, without the extra click-through.
    const handleTemplateSelect = useCallback(async (key: string | null) => {
        setSelectedTemplate(key)
        if (!key) return

        try {
            const baseDate = new Date()
            const context = await getFullServiceContext(baseDate)
            context.type = key as ServiceType
            setName(generateSetlistName(context))
            setEventDate(baseDate)
        } catch {
            const label = TEMPLATE_LABELS[key]?.label || 'Service'
            setName(label)
        }
    }, [])

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
        if (!name.trim()) return
        setCreating(true)

        let loadingId: string | number | undefined
        try {
            const service = createSetlistService(user.uid, user.displayName)

            let finalTracks = tracks
            if (selectedTemplate && finalTracks.length === 0) {
                const template = getTemplate(selectedTemplate, customTemplates)
                if (template && eventDate) {
                    loadingId = toast.loading('Building setlist from template...')
                    const baseContext = await getFullServiceContext(eventDate)
                    baseContext.type = selectedTemplate as ServiceType
                    const context = rabbi ? { ...baseContext, rabbi } : baseContext
                    const { allFiles } = useLibraryStore.getState()
                    finalTracks = buildSetlistFromTemplate(template, allFiles, context)
                }
            }

            const setlistId = await service.createSetlist(name, finalTracks, {
                eventDate: eventDate?.toISOString() ?? undefined,
                rabbi: rabbi || undefined,
                musicians,
                templateType: selectedTemplate as Setlist['templateType'],
            })

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

            const successOpts = loadingId ? { id: loadingId } : undefined
            if (selectedTemplate) {
                const matched = finalTracks.filter(t => t.fileId).length
                const total = finalTracks.filter(t => t.type === 'song').length
                toast.success(`Created "${name}" — ${matched}/${total} songs matched`, successOpts)
            } else {
                toast.success(`"${name}" created!`, successOpts)
            }

            router.push(`/setlists/${setlistId}`)
        } catch {
            toast.error('Failed to create setlist', loadingId ? { id: loadingId } : undefined)
        } finally {
            setCreating(false)
        }
    }, [user, creating, name, tracks, eventDate, rabbi, musicians, selectedTemplate, router, customTemplates])

    return {
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
        canCreate,
        creating,
        create,
        reset,
    }
}
