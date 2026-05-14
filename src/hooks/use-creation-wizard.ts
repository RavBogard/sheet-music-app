import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, type Setlist } from "@/lib/setlist-firebase"
import { assignMusicians } from "@/lib/scheduling-firebase"
import type { SetlistTrack, SetlistMusician, DriveFile } from "@/types/models"
import { toast } from "sonner"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName, getAllTemplateKeys, TEMPLATE_LABELS } from "@/lib/liturgical-templates"
import { getFullServiceContext, getServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { useLibraryStore } from "@/lib/library-store"
import { useCustomTemplates } from "@/lib/template-firebase"

export type CreationMode = 'idle' | 'clone' | 'template' | 'scratch'

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

    // Date-aware three-offer flow (v51-03):
    // mode tracks which offer the user has selected; clone* fields surface
    // the most recent matching prior setlist to power the Clone CTA.
    mode: CreationMode
    setMode: (m: CreationMode) => void
    inferredServiceType: ServiceType | null
    cloneSource: Setlist | null
    cloneSourceLoading: boolean

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

    const [mode, setMode] = useState<CreationMode>('idle')
    const [cloneSource, setCloneSource] = useState<Setlist | null>(null)
    const [cloneSourceLoading, setCloneSourceLoading] = useState(false)

    const inferredServiceType = useMemo<ServiceType | null>(
        () => (eventDate ? getServiceContext(eventDate).type : null),
        [eventDate],
    )

    const templateKeys = getAllTemplateKeys()
    const canCreate = useMemo(
        () => mode === 'clone' ? !!cloneSource : name.trim().length > 0,
        [mode, cloneSource, name],
    )

    // Selecting a template auto-fills name + date. Keeps the "shortcut" UX the
    // two-step wizard had, without the extra click-through.
    //
    // v60-14-01 fix: PRESERVE the user's already-chosen eventDate. The original
    // implementation always called setEventDate(new Date()), which silently
    // overwrote any date the user had picked via the Calendar before tapping
    // "Use a template" (or selecting from the Template dropdown). Daniel UAT
    // 2026-05-13: "when setting a date on mobile, it keeps accidently
    // ressetting to the current date instead of the date that i have
    // assigned…" — root cause located here, not in the picker UI.
    const handleTemplateSelect = useCallback(async (key: string | null) => {
        setSelectedTemplate(key)
        if (!key) return
        // Lock in template mode BEFORE the eventDate effect runs so its
        // auto-flip-to-'clone' branch sees the user's stated intent and skips.
        setMode('template')

        try {
            // Use the user's chosen date for liturgical-context name
            // generation when one is set; only fall back to today when the
            // user hasn't picked anything yet.
            const targetDate = eventDate ?? new Date()
            const context = await getFullServiceContext(targetDate)
            context.type = key as ServiceType
            setName(generateSetlistName(context))
            if (!eventDate) setEventDate(targetDate)
        } catch {
            const label = TEMPLATE_LABELS[key]?.label || 'Service'
            setName(label)
        }
    }, [eventDate])

    // When eventDate changes, query for the most recent prior setlist of the
    // inferred service type so the wizard can surface a Clone CTA. The lookup
    // is best-effort: failures degrade silently to "no clone offer".
    const modeRef = useRef(mode)
    useEffect(() => { modeRef.current = mode }, [mode])
    const userIdRef = useRef(user?.uid ?? null)
    useEffect(() => { userIdRef.current = user?.uid ?? null }, [user?.uid])

    useEffect(() => {
        if (!eventDate) {
            setCloneSource(null)
            setCloneSourceLoading(false)
            return
        }
        const inferred = getServiceContext(eventDate).type
        // 'regular' has no meaningful Clone match (non-Shabbat, non-holiday).
        if (inferred === 'regular' || !userIdRef.current) {
            setCloneSource(null)
            setCloneSourceLoading(false)
            return
        }

        let cancelled = false
        setCloneSourceLoading(true)
        const service = createSetlistService(userIdRef.current)
        service.findLastMatchingService(inferred, eventDate)
            .then((source) => {
                if (cancelled) return
                setCloneSource(source)
                // Only auto-default to clone when the user hasn't expressed a
                // preference yet. Respect explicit 'template' / 'scratch' picks.
                if (source && modeRef.current === 'idle') setMode('clone')
            })
            .catch(() => { if (!cancelled) setCloneSource(null) })
            .finally(() => { if (!cancelled) setCloneSourceLoading(false) })

        return () => { cancelled = true }
    }, [eventDate])

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
        setMode('idle')
        setCloneSource(null)
        setCloneSourceLoading(false)
    }, [])

    const create = useCallback(async () => {
        if (!user || creating) return
        // Clone path requires a source + date; other paths require a name.
        if (mode === 'clone') {
            if (!cloneSource || !eventDate) return
        } else if (!name.trim()) return
        setCreating(true)

        let loadingId: string | number | undefined
        try {
            const service = createSetlistService(user.uid, user.displayName)

            // ── Clone branch ──────────────────────────────────────────────
            if (mode === 'clone' && cloneSource && eventDate) {
                loadingId = toast.loading(`Cloning from ${cloneSource.name}…`)
                const setlistId = await service.cloneSetlist(cloneSource, eventDate)
                const trackCount = cloneSource.trackCount ?? 0
                toast.success(
                    `Cloned from ${cloneSource.name} — ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`,
                    loadingId ? { id: loadingId } : undefined,
                )
                router.push(`/setlists/${setlistId}`)
                return
            }

            // ── Template / Scratch branch ────────────────────────────────
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
                toast.success(`Created "${name}" from ${TEMPLATE_LABELS[selectedTemplate]?.label || selectedTemplate} — ${matched}/${total} songs matched`, successOpts)
            } else {
                toast.success(`"${name}" created!`, successOpts)
            }

            router.push(`/setlists/${setlistId}`)
        } catch (err) {
            // v51-h01: surface the underlying SDK error so Daniel-on-phone can
            // see WHY a save failed (was: bare catch swallowed the message).
            const detail = err instanceof Error ? err.message : String(err ?? '')
            toast.error(
                detail ? `Failed to create setlist: ${detail}` : 'Failed to create setlist',
                loadingId ? { id: loadingId } : undefined,
            )
        } finally {
            setCreating(false)
        }
    }, [user, creating, mode, cloneSource, name, tracks, eventDate, rabbi, musicians, selectedTemplate, router, customTemplates])

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
        mode,
        setMode,
        inferredServiceType,
        cloneSource,
        cloneSourceLoading,
        canCreate,
        creating,
        create,
        reset,
    }
}
