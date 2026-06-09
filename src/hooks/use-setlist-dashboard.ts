import { useState, useEffect, useMemo, useRef } from "react"
import { formatError } from "@/lib/format-error"
import { useRouter } from "next/navigation"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { SERVICE_TYPE_LABELS } from "@/components/setlist/SetlistCards"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { apiFetch } from "@/lib/api-client"
import { useOffline } from "@/hooks/use-offline"
import { fetchTracksForSetlistClient } from "@/lib/client-tracks"
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
    /** @deprecated Use initialSetlists instead */
    initialPersonalSetlists?: Setlist[]
    /** @deprecated Use initialSetlists instead */
    initialPublicSetlists?: Setlist[]
    initialSetlists?: Setlist[]
    /**
     * Cycle-3.5 P2-004 — cursor for the next page of older setlists.
     * `null` when there are no more pages; `string` (ISO date) otherwise.
     * The dashboard renders a "Load more" CTA when this is non-null.
     */
    initialNextCursor?: string | null
    serverIsBandLeader?: boolean
    serverIsMember?: boolean
    serverIsAdmin?: boolean
    serverUid?: string | null
}

export function useSetlistDashboard({
    onBack, onSelect, onCreateNew,
    initialPersonalSetlists = [],
    initialPublicSetlists = [],
    initialSetlists,
    initialNextCursor = null,
    serverIsBandLeader = false,
    serverIsMember = false,
    serverIsAdmin = false,
    serverUid = null
}: UseSetlistDashboardProps) {
    const router = useRouter()
    const { user: authUser, signIn, isMember: authIsMember, isBandLeader: authIsBandLeader, isAdmin: authIsAdmin } = useAuth()
    // v11-04-03: scope the dashboard subscription to the host's tenant.
    const org = useOrg()

    // Use server-provided values for initial render to prevent hydration flashes
    const isMember = authIsMember || serverIsMember
    const isBandLeader = authIsBandLeader || serverIsBandLeader
    const isAdmin = authIsAdmin || serverIsAdmin
    const effectiveUid = authUser?.uid || serverUid
    // We construct a minimal user object if auth hasn't loaded but we have a server user
    const user = authUser || (serverUid ? { uid: serverUid, displayName: null } : null)

    const { downloadSetlist, isDownloading } = useOffline()

    // v4.0: single unified setlist list (no personal/public split)
    const mergedInitial = initialSetlists || [...initialPublicSetlists, ...initialPersonalSetlists]
    const [setlists, setSetlists] = useState<Setlist[]>(mergedInitial)
    const [loading, setLoading] = useState(mergedInitial.length === 0)
    const [error, setError] = useState<string | null>(null)

    // Cycle-3.5 P2-004 — pages beyond the live 50-window subscription
    // are loaded on-demand via `/api/setlists/page` and merged into the
    // displayed list. They are NOT realtime — the client subscription
    // covers the first 50; explicit `loadMore` extends the catalog.
    const [extraSetlists, setExtraSetlists] = useState<Setlist[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
    const [loadingMore, setLoadingMore] = useState(false)
    const loadMore = async () => {
        if (!nextCursor || loadingMore) return
        setLoadingMore(true)
        try {
            const res = await fetch(
                `/api/setlists/page?cursor=${encodeURIComponent(nextCursor)}&pageSize=50`,
            )
            if (!res.ok) throw new Error(`status ${res.status}`)
            const data = (await res.json()) as {
                items: Setlist[]
                nextCursor: string | null
            }
            setExtraSetlists((prev) => {
                const seen = new Set(prev.map((s) => s.id))
                const fresh = data.items.filter((s) => !seen.has(s.id))
                return [...prev, ...fresh]
            })
            setNextCursor(data.nextCursor)
        } catch (err) {
            logger.warn("Load-more setlists failed:", err)
            toast.error("Could not load older setlists. Please retry.")
        } finally {
            setLoadingMore(false)
        }
    }
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

    // Subscribe to all setlists (v4.0: single unified list).
    // v60-13-01 (2026-05-13): subscription runs even before auth hydrates.
    // firestore.rules now allows `allow read: if true` on setlists/* (opened
    // in v60-12 alongside tracks/*). The previous gate on authUser?.uid caused
    // (a) incognito users to see no setlists at all, and (b) mobile cold-loads
    // to flash setlists then blank them when the auth race resolved post-mount
    // and triggered an empty re-sub. The Firestore client SDK handles
    // auth-state changes natively; dropping the app-level gate is safe.
    useEffect(() => {
        if (!setlistService) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        const unsubscribe = setlistService.subscribeToAllSetlists(
            (data) => { setSetlists(data); setLoading(false) },
            (err) => {
                logger.error("Setlist subscription error:", err)
                setError("Failed to load setlists. Please check your connection.")
                setLoading(false)
            },
            org,
        )
        return () => unsubscribe()
    }, [setlistService, authUser?.uid, org])

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
        if (setlist.ownerId !== user?.uid && !isAdmin && !isBandLeader) {
            toast.error("You can only delete setlists you created")
            return
        }
        setSetlistToDelete(setlist)
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!setlistService || !setlistToDelete) return
        try {
            await setlistService.deleteSetlist(setlistToDelete.id)
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
            await setlistService.duplicateSetlist(setlistToDuplicate.id, setlistToDuplicate)
            toast.success("Setlist duplicated successfully!")
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

    // v52-05: admin-only "Save as Default for {service-type}" handler.
    // Writes the setlistId to config/defaults.{serviceType} via setDoc(merge:true).
    // Firestore rules enforce admin-at-server (allow write: if isAdmin()); UI
    // gates by isAdmin && type ∈ Phase 1 set in SetlistCards.
    const handleSaveAsDefaultClick = async (
        setlist: Setlist,
        serviceType: ServiceType,
        e: React.MouseEvent,
    ) => {
        e.stopPropagation()
        if (!setlistService || !user) return
        const friendly = SERVICE_TYPE_LABELS[serviceType] ?? serviceType
        const toastId = toast.loading("Saving default…")
        try {
            await setlistService.setDefaultForServiceType(serviceType, setlist.id)
            toast.success(`Saved as default for ${friendly}`, { id: toastId })
        } catch {
            toast.error("Failed to save as default", { id: toastId })
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
            toast.error(`Transfer Failed: ${formatError(err)}`)
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

                    const id = await setlistService.createSetlist(name, tracks, {
                        eventDate: date.toISOString(),
                        templateType: templateType as Setlist['templateType'],
                        isTemplate: false,
                    })

                    const matched = tracks.filter(t => t.fileId).length
                    const total = tracks.filter(t => t.type === 'song').length
                    toast.success(`Created "${name}" — ${matched}/${total} songs matched`, { id: toastId })

                    router.push(`/setlists/${id}`)
                    return
                } catch (err: unknown) {
                    toast.error("Failed to create setlist: " + (err instanceof Error ? err.message : "Unknown"), { id: toastId })
                    return
                }
            }
        }

        // Fallback: no matching template, create blank setlist
        const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        const name = 'New Setlist — ' + formattedDate
        try {
            const id = await setlistService.createSetlist(name, [], {
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

            const id = await setlistService.createSetlist(name, tracks, {
                eventDate: targetDate.toISOString(),
                templateType: templateType as Setlist['templateType'],
                isTemplate: false,
            })

            const matched = tracks.filter(t => t.fileId).length
            const total = tracks.filter(t => t.type === 'song').length
            toast.success(`Created "${name}" — ${matched}/${total} songs matched`, { id: templateToastId })

            handleSelect({
                id, name, trackCount: tracks.length,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 },
                eventDate: targetDate.toISOString(), ownerId: user.uid,
            })
        } catch (err: unknown) {
            toast.error("Failed to create template setlist: " + (err instanceof Error ? err.message : "Unknown"), { id: templateToastId })
        }
    }

    const handleDownload = async (setlist: Setlist) => {
        try {
            const tracks = await fetchTracksForSetlistClient(setlist.id, setlist)
            if (tracks.length === 0) {
                toast.error("No tracks to download in this setlist")
                return
            }
            await downloadSetlist(tracks)
        } catch {
            toast.error("Failed to load setlist for download")
        }
    }

    // Derived data (v4.0: single list, no tab switching)
    // Cycle-3.5 P2-004: union of the subscription window + on-demand
    // pages loaded via `loadMore`. Subscription wins on id collisions
    // so realtime updates to the live 50-window override stale paged data.
    const allSetlists = useMemo(() => {
        if (extraSetlists.length === 0) return setlists
        const subIds = new Set(setlists.map((s) => s.id))
        const trailing = extraSetlists.filter((s) => !subIds.has(s.id))
        return [...setlists, ...trailing]
    }, [setlists, extraSetlists])

    const availableRabbis = useMemo(() => {
        const rabbis = new Set<string>()
        setlists.forEach(s => {
            if (s.rabbi) rabbis.add(s.rabbi)
        })
        return Array.from(rabbis).sort()
    }, [setlists])

    const displayedSetlists = useMemo(() => {
        let filtered = allSetlists
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(s => {
                if (s.name.toLowerCase().includes(q)) return true
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

    // Past list: dated-past sorted DESC (most recent first — usually the
    // clone source for "next week"); null-dated trail in stable/original order.
    const pastOrNoDate = (() => {
        const dated: Setlist[] = []
        const undated: Setlist[] = []
        for (const s of displayedSetlists) {
            const d = getDate(s)
            if (!d) undated.push(s)
            else if (d < today) dated.push(s)
        }
        dated.sort((a, b) => getDate(b)!.getTime() - getDate(a)!.getTime())
        return [...dated, ...undated]
    })()

    const placeholders: { date: Date }[] = []
    if (user) {
        for (let i = 0; i < 7; i++) {
            const d = new Date(today)
            d.setDate(today.getDate() + i)
            const exists = setlists.some(s => { const sd = getDate(s); return sd && sd.toDateString() === d.toDateString() })
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
        handleSaveAsTemplateClick, handleSaveAsDefaultClick, handleTransfer, transferring, handleCreateFromCalendar,
        handleCreateFromTemplate, handleDownload,
        availableRabbis, displayedSetlists,
        upcoming, pastOrNoDate, placeholders, hasUpcoming, isDownloading,
        // P2-004 cursor pagination
        nextCursor, loadMore, loadingMore,
    }
}
