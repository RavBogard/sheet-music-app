import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { useOffline } from "@/hooks/use-offline"
import { toast } from "sonner"
import { getNextFriday, getNextSaturday, getFullServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName } from "@/lib/liturgical-templates"
import { useCustomTemplates } from "@/lib/template-firebase"
import { useLibraryStore } from "@/lib/library-store"
import { useLibrary } from "@/hooks/use-library"
import { logger } from "@/lib/logger"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

export interface UseSetlistDashboardProps {
    onBack?: () => void
    onSelect?: (setlist: Setlist) => void
    onCreateNew?: () => void
    initialPersonalSetlists?: Setlist[]
    initialPublicSetlists?: Setlist[]
    serverIsBandLeader?: boolean
    serverIsMember?: boolean
    serverIsAdmin?: boolean
    serverUid?: string | null
}

export function useSetlistDashboard({
    onBack, onSelect, onCreateNew,
    initialPersonalSetlists = [],
    initialPublicSetlists = [],
    serverIsBandLeader = false,
    serverIsMember = false,
    serverIsAdmin = false,
    serverUid = null
}: UseSetlistDashboardProps) {
    const router = useRouter()
    const { user: authUser, signIn, isMember: authIsMember, isBandLeader: authIsBandLeader, isAdmin: authIsAdmin } = useAuth()

    // Use server-provided values for initial render to prevent hydration flashes
    const isMember = authIsMember || serverIsMember
    const isBandLeader = authIsBandLeader || serverIsBandLeader
    const isAdmin = authIsAdmin || serverIsAdmin
    const effectiveUid = authUser?.uid || serverUid
    // We construct a minimal user object if auth hasn't loaded but we have a server user
    const user = authUser || (serverUid ? { uid: serverUid, displayName: null } : null)

    const { downloadSetlist, isDownloading } = useOffline()

    const [personalSetlists, setPersonalSetlists] = useState<Setlist[]>(initialPersonalSetlists)
    const [publicSetlists, setPublicSetlists] = useState<Setlist[]>(initialPublicSetlists)
    const [loading, setLoading] = useState(initialPersonalSetlists.length === 0 && initialPublicSetlists.length === 0)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'personal' | 'public'>('public')
    const [view, setView] = useState<'list' | 'calendar' | 'matrix'>('list')
    const [searchQuery, setSearchQuery] = useState("")
    const [rabbiFilter, setRabbiFilter] = useState("")
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

    // Dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [setlistToDelete, setSetlistToDelete] = useState<Setlist | null>(null)
    const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false)
    const [setlistToDuplicate, setSetlistToDuplicate] = useState<Setlist | null>(null)
    const [showTransferDialog, setShowTransferDialog] = useState(false)
    const [showImporterModal, setShowImporterModal] = useState(false)
    const [selectedSetlistForTransfer, setSelectedSetlistForTransfer] = useState<Setlist | null>(null)
    const [transferEmail, setTransferEmail] = useState("")

    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user?.uid, user?.displayName])

    // Subscribe to personal setlists
    useEffect(() => {
        if (!user?.uid || !setlistService) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        const unsubscribe = setlistService.subscribeToPersonalSetlists(
            (data) => { setPersonalSetlists(data); setLoading(false) },
            (err) => {
                logger.error("Personal setlist subscription error:", err)
                setError("Failed to load your personal setlists. Please check your connection.")
                setLoading(false)
            }
        )
        return () => unsubscribe()
    }, [setlistService, user?.uid])

    // Subscribe to public setlists
    useEffect(() => {
        if (!setlistService) return
        const unsubscribe = setlistService.subscribeToPublicSetlists(
            (data) => setPublicSetlists(data),
            (err) => logger.error("Public setlist subscription error:", err)
        )
        return () => unsubscribe()
    }, [setlistService])

    // Force 'public' tab if guest
    useEffect(() => {
        if (!user?.uid) setActiveTab('public')
    }, [user?.uid])

    // Load library in background
    useLibrary()

    // Load custom templates from Firestore (overrides hardcoded defaults)
    const { overrides: customTemplates } = useCustomTemplates()

    // Handlers
    const handleSelect = (setlist: Setlist) => {
        setNavigatingTo(setlist.id)
        if (onSelect) {
            onSelect(setlist)
        } else {
            router.push(`/setlists/${setlist.id}`)
        }
    }

    const handleDeleteClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (setlist.isPublic && setlist.ownerId !== user?.uid && !isAdmin && !isBandLeader) {
            toast.error("You can only delete setlists you created")
            return
        }
        setSetlistToDelete(setlist)
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!setlistService || !setlistToDelete) return
        try {
            await setlistService.deleteSetlist(setlistToDelete.id, setlistToDelete.isPublic || false)
            toast.success("Setlist deleted")
        } catch {
            toast.error("Failed to delete setlist")
        }
        setDeleteConfirmOpen(false)
        setSetlistToDelete(null)
    }

    const handleDuplicateClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        setSetlistToDuplicate(setlist)
        setDuplicateConfirmOpen(true)
    }

    const confirmDuplicate = async () => {
        if (!setlistService || !user || !setlistToDuplicate) return
        try {
            await setlistService.copyToPersonal(setlistToDuplicate.id, setlistToDuplicate)
            toast.success("Setlist duplicated successfully!")
            setActiveTab('personal')
        } catch {
            toast.error("Failed to duplicate setlist.")
        }
        setDuplicateConfirmOpen(false)
        setSetlistToDuplicate(null)
    }

    const handleCloneNextWeekClick = async (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService || !user) return
        const toastId = toast.loading("Creating next week’s setlist…")
        try {
            const newId = await setlistService.cloneForNextWeek(setlist)
            toast.success("Cloned for next week!", { id: toastId })
            router.push(`/setlists/${newId}`)
        } catch {
            toast.error("Failed to clone setlist", { id: toastId })
        }
    }

    const handleSaveAsTemplateClick = async (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!setlistService || !user) return
        const toastId = toast.loading("Saving template…")
        try {
            await setlistService.saveAsTemplate(setlist)
            toast.success(`Template "${setlist.name}" saved!`, { id: toastId })
        } catch {
            toast.error("Failed to save template", { id: toastId })
        }
    }

    const [transferring, setTransferring] = useState(false)
    const isMountedRef = useRef(true)
    useEffect(() => { return () => { isMountedRef.current = false } }, [])

    const handleTransfer = async () => {
        if (!selectedSetlistForTransfer || !transferEmail) return
        setTransferring(true)
        try {
            const res = await apiFetch('/api/setlist/transfer', {
                method: 'POST',
                body: JSON.stringify({ setlistId: selectedSetlistForTransfer.id, newOwnerEmail: transferEmail })
            })
            if (!res.ok) throw new Error(await res.text())
            if (!isMountedRef.current) return
            toast.success("Transfer Successful!")
            setShowTransferDialog(false)
            setTransferEmail("")
            setSelectedSetlistForTransfer(null)
        } catch (err: unknown) {
            if (!isMountedRef.current) return
            toast.error(`Transfer Failed: ${err instanceof Error ? err.message : "Unknown error"}`)
        } finally {
            if (isMountedRef.current) setTransferring(false)
        }
    }

    const handleCreateFromCalendar = async (date: Date, type?: 'shabbat_morning') => {
        if (!setlistService || !user) return

        // Determine template type: explicit type, Saturday → shabbat_morning, Friday → friday_night
        const templateType = type
            || (date.getDay() === 6 ? 'shabbat_morning' : undefined)
            || (date.getDay() === 5 ? 'friday_night' : undefined)

        // If we have a matching template, build a full setlist from it (like "From Template")
        if (templateType) {
            const template = getTemplate(templateType, customTemplates)
            if (template) {
                let toastId: string | number | undefined
                try {
                    toastId = toast.loading('Building setlist from template...')
                    const context = await getFullServiceContext(date)
                    context.type = templateType as ServiceType
                    const { allFiles } = useLibraryStore.getState()
                    const tracks = buildSetlistFromTemplate(template, allFiles, context)
                    const name = generateSetlistName(context)

                    const id = await setlistService.createSetlist(name, tracks, true, {
                        eventDate: date.toISOString(),
                        templateType: templateType as Setlist['templateType'],
                        isTemplate: false,
                    })

                    toast.dismiss(toastId)
                    const matched = tracks.filter(t => t.fileId).length
                    const total = tracks.filter(t => t.type === 'song').length
                    toast.success(`Created "${name}" — ${matched}/${total} songs matched`)

                    router.push(`/setlists/${id}`)
                    return
                } catch (err: unknown) {
                    toast.dismiss(toastId)
                    toast.error("Failed to create setlist: " + (err instanceof Error ? err.message : "Unknown"))
                    return
                }
            }
        }

        // Fallback: no matching template, create blank setlist
        const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        const name = 'New Setlist — ' + formattedDate
        try {
            const id = await setlistService.createSetlist(name, [], true, {
                eventDate: date.toISOString(),
            })
            router.push(`/setlists/${id}`)
        } catch {
            toast.error("Failed to create setlist")
        }
    }

    const handleCreateFromTemplate = async (templateType: string) => {
        if (!setlistService || !user) return

        const isFriday = templateType.includes('friday') || templateType === 'shir_shabbat'
        const targetDate = isFriday ? getNextFriday() : getNextSaturday()
        const template = getTemplate(templateType, customTemplates)
        if (!template) return

        let templateToastId: string | number | undefined
        try {
            templateToastId = toast.loading('Building setlist from template...')
            const context = await getFullServiceContext(targetDate)
            context.type = templateType as ServiceType
            const { allFiles } = useLibraryStore.getState()
            const tracks = buildSetlistFromTemplate(template, allFiles, context)
            const name = generateSetlistName(context)

            const id = await setlistService.createSetlist(name, tracks, true, {
                eventDate: targetDate.toISOString(),
                templateType: templateType as Setlist['templateType'],
                isTemplate: false,
            })

            toast.dismiss(templateToastId)

            const matched = tracks.filter(t => t.fileId).length
            const total = tracks.filter(t => t.type === 'song').length
            toast.success(`Created "${name}" — ${matched}/${total} songs matched`)

            handleSelect({
                id, name, tracks, trackCount: tracks.length,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 },
                eventDate: targetDate.toISOString(), ownerId: user.uid, isPublic: false,
            })
        } catch (err: unknown) {
            toast.dismiss(templateToastId)
            toast.error("Failed to create template setlist: " + (err instanceof Error ? err.message : "Unknown"))
        }
    }

    const handleDownload = async (setlist: Setlist) => {
        if (setlist.tracks && setlist.tracks.length > 0) {
            await downloadSetlist(setlist.tracks)
        } else {
            toast.error("No tracks to download in this setlist")
        }
    }

    // Derived data
    const allSetlists = activeTab === 'personal' ? personalSetlists : publicSetlists

    const availableRabbis = useMemo(() => {
        const rabbis = new Set<string>()
            ;[...personalSetlists, ...publicSetlists].forEach(s => {
                if (s.rabbi) rabbis.add(s.rabbi)
            })
        return Array.from(rabbis).sort()
    }, [personalSetlists, publicSetlists])

    const displayedSetlists = useMemo(() => {
        let filtered = allSetlists
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(s => {
                if (s.name.toLowerCase().includes(q)) return true
                if (s.tracks?.some(t => t.title?.toLowerCase().includes(q))) return true
                if (s.eventDate) {
                    const d = toDateHelper(s.eventDate)
                    if (d) {
                        const long = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()
                        const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
                        const numeric = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
                        if (long.includes(q) || short.includes(q) || numeric.includes(q)) return true
                    }
                }
                return false
            })
        }
        if (rabbiFilter) {
            filtered = filtered.filter(s => s.rabbi === rabbiFilter)
        }
        return filtered
    }, [allSetlists, searchQuery, rabbiFilter])

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const getDate = (s: Setlist) => s.eventDate ? toDateHelper(s.eventDate) : null

    const upcoming = displayedSetlists
        .filter(s => { const d = getDate(s); return d && d >= today })
        .sort((a, b) => getDate(a)!.getTime() - getDate(b)!.getTime())

    const pastOrNoDate = displayedSetlists
        .filter(s => { const d = getDate(s); return !d || d < today })

    const placeholders: { date: Date }[] = []
    if (user && activeTab === 'public') {
        for (let i = 0; i < 7; i++) {
            const d = new Date(today)
            d.setDate(today.getDate() + i)
            const exists = publicSetlists.some(s => { const sd = getDate(s); return sd && sd.toDateString() === d.toDateString() })
            if (!exists && d.getDay() === 6) {
                placeholders.push({ date: d })
            }
        }
    }

    const hasUpcoming = upcoming.length > 0 || placeholders.length > 0

    return {
        router, user, signIn, isMember, isBandLeader, isAdmin, onBack, onCreateNew,
        loading, error, activeTab, setActiveTab, view, setView,
        searchQuery, setSearchQuery, rabbiFilter, setRabbiFilter, navigatingTo,
        deleteConfirmOpen, setDeleteConfirmOpen, setlistToDelete,
        duplicateConfirmOpen, setDuplicateConfirmOpen, setlistToDuplicate,
        showTransferDialog, setShowTransferDialog,
        showImporterModal, setShowImporterModal,
        selectedSetlistForTransfer, setSelectedSetlistForTransfer,
        transferEmail, setTransferEmail,
        handleSelect, handleDeleteClick, confirmDelete,
        handleDuplicateClick, confirmDuplicate, handleCloneNextWeekClick,
        handleSaveAsTemplateClick, handleTransfer, transferring, handleCreateFromCalendar,
        handleCreateFromTemplate, handleDownload,
        availableRabbis, displayedSetlists,
        upcoming, pastOrNoDate, placeholders, hasUpcoming, isDownloading
    }
}
