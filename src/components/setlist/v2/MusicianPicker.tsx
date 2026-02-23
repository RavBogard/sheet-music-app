"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SetlistMusician, UserProfile, SchedulingAssignment, MusicianBlockout } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { subscribeToAllUsers } from "@/lib/users-firebase"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { db } from "@/lib/firebase"
import { doc, updateDoc, collection } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Plus, X, ChevronDown, ChevronUp, Guitar, Star, UserPlus, Mail, MailCheck, MailOpen, MailX, Send, Check, Clock, Loader2, Ban, UserSearch } from "lucide-react"
import { toast } from "sonner"
import { ErrorBoundary } from "react-error-boundary"
import { FallbackError } from "@/components/ui/fallback-error"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { subscribeToSetlistAssignments, subscribeToAllBlockouts, assignMusicians, getAvailabilityStatus } from "@/lib/scheduling-firebase"
import { RabbiBanner } from "@/components/scheduling/RabbiBanner"

interface MusicianPickerProps {
    musicians: SetlistMusician[]
    onChange: (musicians: SetlistMusician[]) => void
    canEdit: boolean
    setlistId?: string
    setlistName?: string
    eventDate?: string | null
    rabbiName?: string
    isPublished?: boolean
}

interface EmailStatus {
    recipientEmail: string
    status: 'sent' | 'delivered' | 'opened' | 'bounced' | 'complained' | 'delayed'
}

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENT_PRESETS).map(([key, val]) => ({
    key,
    label: val.label,
}))

export function MusicianPicker({ musicians, onChange, canEdit, setlistId, setlistName, eventDate, rabbiName, isPublished }: MusicianPickerProps) {
    const { isAdmin, isBandLeader, user: currentUser } = useAuth()
    const congregation = useCongregation()
    const [expanded, setExpanded] = useState(musicians.length > 0)
    const [allUsers, setAllUsers] = useState<UserProfile[]>([])
    const [showAddGuest, setShowAddGuest] = useState(false)
    const [guestName, setGuestName] = useState("")
    const [guestEmail, setGuestEmail] = useState("")
    const [guestInstrument, setGuestInstrument] = useState("")
    const [editingInstrumentUid, setEditingInstrumentUid] = useState<string | null>(null)
    const instrumentRef = useRef<HTMLDivElement>(null)
    const [emailStatuses, setEmailStatuses] = useState<Map<string, EmailStatus>>(new Map())
    const [schedulingAssignments, setSchedulingAssignments] = useState<SchedulingAssignment[]>([])
    const [allBlockouts, setAllBlockouts] = useState<MusicianBlockout[]>([])
    const [isSendingRequests, setIsSendingRequests] = useState(false)
    const [suggestingFor, setSuggestingFor] = useState<string | null>(null) // declined musician instrument
    const [suggestions, setSuggestions] = useState<Array<{ uid: string; name: string; email: string; instrument: string | null; instrumentMatch: boolean | null }>>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)

    const defaultMusicians = useMemo(() => congregation.defaultMusicians || [], [congregation.defaultMusicians])
    const defaultUids = useMemo(() => new Set(defaultMusicians.map(m => m.uid)), [defaultMusicians])

    // Subscribe to email delivery status after publish
    const emailEventsRef = useMemo(() => setlistId && isPublished ? collection(db, "setlists", setlistId, "emailEvents") : null, [setlistId, isPublished])
    const { data: emailEventsData } = useSafeFirestoreSync(emailEventsRef as any)

    useEffect(() => {
        if (!emailEventsData) {
            setEmailStatuses(new Map())
            return
        }

        const map = new Map<string, EmailStatus>()
        const eventsArray = emailEventsData as EmailStatus[]
        eventsArray.forEach(data => {
            if (data.recipientEmail) {
                map.set(data.recipientEmail.toLowerCase(), data)
            }
        })
        setEmailStatuses(map)
    }, [emailEventsData])

    // Subscribe to scheduling assignments for this setlist
    useEffect(() => {
        if (!setlistId) return
        const unsub = subscribeToSetlistAssignments(setlistId, setSchedulingAssignments)
        return unsub
    }, [setlistId])

    // Subscribe to all blockouts for availability indicators (band leaders only)
    useEffect(() => {
        if (!isBandLeader) return
        const unsub = subscribeToAllBlockouts(setAllBlockouts)
        return unsub
    }, [isBandLeader])

    // Get scheduling status for a musician
    const getSchedulingStatus = useCallback((uid: string): SchedulingAssignment | undefined => {
        return schedulingAssignments.find(a => a.musicianUid === uid && a.status !== 'cancelled')
    }, [schedulingAssignments])

    // Send scheduling requests to all selected musicians
    const handleRequestAll = useCallback(async () => {
        if (!setlistId || !setlistName || musicians.length === 0) return
        setIsSendingRequests(true)
        try {
            const musiciansToAssign = musicians
                .filter(m => m.uid) // Only registered users
                .filter(m => {
                    // Skip musicians who already have active assignments
                    const existing = getSchedulingStatus(m.uid!)
                    return !existing
                })
                .map(m => {
                    const user = allUsers.find(u => u.uid === m.uid)
                    return {
                        uid: m.uid!,
                        name: m.name,
                        email: m.email,
                        phone: user?.musicianProfile?.phone,
                        instrument: m.instrument,
                        schedulingTier: user?.musicianProfile?.schedulingTier,
                    }
                })

            if (musiciansToAssign.length === 0) {
                toast.info('All musicians already have scheduling requests')
                setIsSendingRequests(false)
                return
            }

            const result = await assignMusicians({
                setlistId,
                setlistName,
                eventDate: eventDate || null,
                musicians: musiciansToAssign,
            })

            if (result.success) {
                toast.success(`Sent scheduling requests to ${result.assigned} musician${result.assigned === 1 ? '' : 's'}`)
            } else {
                toast.error('Failed to send some scheduling requests')
            }
        } catch (e) {
            toast.error('Failed to send scheduling requests')
        } finally {
            setIsSendingRequests(false)
        }
    }, [setlistId, setlistName, eventDate, musicians, allUsers, getSchedulingStatus])

    // Get availability status for a musician on the event date
    const getMusicianAvailability = useCallback((uid: string): 'available' | 'blocked' | 'unknown' => {
        if (!eventDate || !isBandLeader) return 'unknown'
        const dateOnly = eventDate.split('T')[0]
        return getAvailabilityStatus(allBlockouts, uid, dateOnly)
    }, [eventDate, isBandLeader, allBlockouts])

    // Fetch replacement suggestions when a musician declines
    const handleSuggestReplacement = useCallback(async (instrument?: string) => {
        if (!setlistId) return
        setLoadingSuggestions(true)
        setSuggestingFor(instrument || 'any')
        try {
            const { apiFetch } = await import('@/lib/api-client')
            const params = new URLSearchParams({ setlistId })
            if (instrument) params.set('instrument', instrument)
            if (eventDate) params.set('date', eventDate.split('T')[0])
            const res = await apiFetch(`/api/scheduling/suggest?${params}`)
            const data = await res.json()
            if (data.success) {
                setSuggestions(data.suggestions)
            }
        } catch {
            toast.error('Failed to fetch suggestions')
        } finally {
            setLoadingSuggestions(false)
        }
    }, [setlistId, eventDate])

    useEffect(() => {
        const unsub = subscribeToAllUsers((users) => {
            // Only show musicians, band leaders, and admins in the picker
            // (not plain members — they're community, not band)
            // Backward compat: old 'leader' role maps to band_leader
            let active = users.filter(u =>
                u.role === 'musician' || u.role === 'band_leader' || u.role === 'admin' || u.role === ('leader' as string)
            )
            if (currentUser && !active.some(u => u.uid === currentUser.uid)) {
                active = [{
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me',
                    role: 'musician' as const,
                } as UserProfile, ...active]
            }
            setAllUsers(active)
        })
        return () => unsub()
    }, [currentUser])

    useEffect(() => {
        if (!editingInstrumentUid) return
        const handler = (e: MouseEvent) => {
            if (instrumentRef.current && !instrumentRef.current.contains(e.target as Node)) {
                setEditingInstrumentUid(null)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [editingInstrumentUid])

    const getInstrumentLabel = useCallback((user: UserProfile): string | undefined => {
        const assigned = musicians.find(m => m.uid === user.uid)
        if (assigned?.instrument) return assigned.instrument
        const profileKey = user.musicianProfile?.instrument
        if (profileKey) return INSTRUMENT_PRESETS[profileKey]?.label || profileKey
        return undefined
    }, [musicians])

    const getLiveInstrument = useCallback((uid: string): string | undefined => {
        const user = allUsers.find(u => u.uid === uid)
        if (!user) return undefined
        const profileKey = user.musicianProfile?.instrument
        if (profileKey) return INSTRUMENT_PRESETS[profileKey]?.label || profileKey
        return undefined
    }, [allUsers])

    const isSelected = useCallback((uid: string) => {
        return musicians.some(m => m.uid === uid)
    }, [musicians])

    const toggleUser = useCallback((user: UserProfile) => {
        if (!canEdit) return
        const exists = musicians.find(m => m.uid === user.uid)
        if (exists) {
            onChange(musicians.filter(m => m.uid !== user.uid))
        } else {
            const instrumentLabel = getInstrumentLabel(user)
            onChange([...musicians, {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Unknown',
                email: user.email || "",
                instrument: instrumentLabel,
            }])
        }
    }, [musicians, onChange, canEdit, getInstrumentLabel])

    const setInstrumentForUser = useCallback((uid: string, instrument: string) => {
        onChange(musicians.map(m =>
            m.uid === uid ? { ...m, instrument } : m
        ))
        setEditingInstrumentUid(null)
    }, [musicians, onChange])

    const addGuest = useCallback(() => {
        if (!guestName.trim() || !guestEmail.trim()) return
        onChange([...musicians, {
            name: guestName.trim(),
            email: guestEmail.trim(),
            instrument: guestInstrument.trim() || undefined,
        }])
        setGuestName("")
        setGuestEmail("")
        setGuestInstrument("")
        setShowAddGuest(false)
    }, [musicians, onChange, guestName, guestEmail, guestInstrument])

    const removeGuest = useCallback((index: number) => {
        if (!canEdit) return
        onChange(musicians.filter((_, i) => i !== index))
    }, [musicians, onChange, canEdit])

    // Load default band — merge saved defaults with live user data for fresh instruments
    const loadDefaults = useCallback(() => {
        const loaded: SetlistMusician[] = defaultMusicians.map(dm => {
            const liveInstrument = getLiveInstrument(dm.uid)
            const liveUser = allUsers.find(u => u.uid === dm.uid)
            return {
                uid: dm.uid,
                name: liveUser?.displayName || dm.name,
                email: liveUser?.email || "",
                instrument: liveInstrument || dm.instrument,
            }
        })
        onChange(loaded)
    }, [defaultMusicians, getLiveInstrument, allUsers, onChange])

    // Toggle a user as default band member (persists to congregation config)
    const toggleDefault = useCallback(async (user: UserProfile) => {
        const ref = doc(db, "config", "congregation")
        const isDefault = defaultUids.has(user.uid)
        const instrument = getInstrumentLabel(user)
        const updated = isDefault
            ? defaultMusicians.filter(m => m.uid !== user.uid)
            : [...defaultMusicians, { uid: user.uid, name: user.displayName || 'Unknown', instrument }]
        try {
            await updateDoc(ref, { defaultMusicians: updated })
            toast.success(isDefault ? `Removed ${user.displayName} from defaults` : `Added ${user.displayName} to defaults`)
        } catch {
            toast.error("Failed to update defaults")
        }
    }, [defaultMusicians, defaultUids, getInstrumentLabel])

    // Get email delivery status for a musician
    const getEmailStatus = useCallback((email: string | undefined): EmailStatus | null => {
        if (!email || emailStatuses.size === 0) return null
        return emailStatuses.get(email.toLowerCase()) || null
    }, [emailStatuses])

    const guests = musicians.filter(m => !m.uid)

    return (
        <ErrorBoundary FallbackComponent={(props) => <FallbackError {...props} title="Failed to load musicians" compact />}>
            <div className="border-b border-border/50">
                <button
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpanded(!expanded)}
                >
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="font-medium">
                        Musicians
                        {musicians.length > 0 && (
                            <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {musicians.length}
                            </span>
                        )}
                    </span>
                    {/* Email delivery summary for published setlists */}
                    {isPublished && emailStatuses.size > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 ml-1 flex items-center gap-1.5">
                            <Mail className="h-3 w-3" />
                            {(() => {
                                const statuses = Array.from(emailStatuses.values())
                                const opened = statuses.filter(s => s.status === 'opened').length
                                const delivered = statuses.filter(s => s.status === 'delivered').length
                                const total = statuses.length
                                if (opened > 0) return `${opened}/${total} opened`
                                if (delivered > 0) return `${delivered}/${total} delivered`
                                return `${total} sent`
                            })()}
                        </span>
                    )}
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                </button>

                {expanded && (
                    <div className="px-4 pb-3 space-y-3">
                        {/* Rabbi guidance banner */}
                        <RabbiBanner rabbiName={rabbiName} />

                        {/* Action buttons row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Load Defaults button */}
                            {canEdit && defaultMusicians.length > 0 && (
                                <button
                                    onClick={loadDefaults}
                                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    {musicians.length === 0 ? 'Load Default Band' : 'Reset to Defaults'}
                                </button>
                            )}

                            {/* Request All button — sends scheduling requests */}
                            {canEdit && isBandLeader && setlistId && musicians.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1.5 border-brand/30 text-brand hover:bg-brand/10"
                                    onClick={handleRequestAll}
                                    disabled={isSendingRequests}
                                >
                                    {isSendingRequests ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Send className="h-3 w-3" />
                                    )}
                                    {isSendingRequests ? 'Sending...' : 'Request All'}
                                </Button>
                            )}
                        </div>

                        {allUsers.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Members</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {allUsers.map((user) => {
                                        const selected = isSelected(user.uid)
                                        const instrument = getInstrumentLabel(user)
                                        const showInstrumentPicker = editingInstrumentUid === user.uid
                                        const isDefault = defaultUids.has(user.uid)
                                        const schedulingStatus = getSchedulingStatus(user.uid)
                                        const availability = getMusicianAvailability(user.uid)

                                        return (
                                            <div key={user.uid} className="relative">
                                                <button
                                                    onClick={() => toggleUser(user)}
                                                    disabled={!canEdit}
                                                    className={`
                                                        inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm
                                                        transition-all duration-150 border
                                                        ${selected
                                                            ? 'bg-primary/15 border-primary/40 text-foreground'
                                                            : availability === 'blocked'
                                                                ? 'bg-red-500/5 border-red-500/30 text-muted-foreground'
                                                                : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border'
                                                        }
                                                        ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}
                                                    `}
                                                >
                                                    {/* Availability dot (band leaders only) */}
                                                    {isBandLeader && availability !== 'unknown' && (
                                                        <span
                                                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                                                availability === 'blocked' ? 'bg-red-500' : 'bg-emerald-500'
                                                            }`}
                                                            title={availability === 'blocked' ? 'Unavailable (blockout)' : 'Available'}
                                                        />
                                                    )}
                                                    {selected && availability === 'unknown' && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                    )}
                                                    <span>{user.displayName || user.email?.split('@')[0]}</span>
                                                    {instrument ? (
                                                        <span
                                                            className={`text-xs text-muted-foreground/60 ${selected && isAdmin ? 'underline decoration-dotted cursor-pointer' : ''}`}
                                                            onClick={(e) => {
                                                                if (selected && isAdmin) {
                                                                    e.stopPropagation()
                                                                    setEditingInstrumentUid(user.uid)
                                                                }
                                                            }}
                                                        >
                                                            {instrument}
                                                        </span>
                                                    ) : selected && isAdmin ? (
                                                        <span
                                                            className="text-xs text-muted-foreground/40 underline decoration-dotted cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setEditingInstrumentUid(user.uid)
                                                            }}
                                                        >
                                                            + instrument
                                                        </span>
                                                    ) : null}
                                                    {/* Default star — admins only (config/congregation write requires admin) */}
                                                    {isAdmin && (
                                                        <span
                                                            className={`ml-0.5 cursor-pointer transition-colors ${isDefault
                                                                ? 'text-amber-400 hover:text-amber-300'
                                                                : 'text-muted-foreground/20 hover:text-muted-foreground/50'
                                                                }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                toggleDefault(user)
                                                            }}
                                                            title={isDefault ? 'Remove from default band' : 'Add to default band'}
                                                        >
                                                            <Star className={`h-3 w-3 ${isDefault ? 'fill-current' : ''}`} />
                                                        </span>
                                                    )}
                                                    {/* Scheduling status indicator */}
                                                    {selected && schedulingStatus && (
                                                        <span title={`Scheduling: ${schedulingStatus.status}`}>
                                                            {schedulingStatus.status === 'confirmed' ? (
                                                                <Check className="h-3 w-3 text-emerald-500" />
                                                            ) : schedulingStatus.status === 'pending' ? (
                                                                <Clock className="h-3 w-3 text-amber-500" />
                                                            ) : schedulingStatus.status === 'declined' ? (
                                                                <X className="h-3 w-3 text-red-500" />
                                                            ) : null}
                                                        </span>
                                                    )}
                                                    {/* Blocked indicator */}
                                                    {availability === 'blocked' && !selected && (
                                                        <Ban className="h-3 w-3 text-red-400" />
                                                    )}
                                                    {/* Email delivery status */}
                                                    {selected && (() => {
                                                        const es = getEmailStatus(user.email)
                                                        if (!es) return null
                                                        const StatusIcon = es.status === 'opened' ? MailOpen
                                                            : es.status === 'delivered' ? MailCheck
                                                                : es.status === 'bounced' || es.status === 'complained' ? MailX
                                                                    : Mail
                                                        const color = es.status === 'opened' ? 'text-blue-400'
                                                            : es.status === 'delivered' ? 'text-green-400'
                                                                : es.status === 'bounced' || es.status === 'complained' ? 'text-red-400'
                                                                    : 'text-muted-foreground/40'
                                                        return (
                                                            <span title={`Email ${es.status}`}>
                                                                <StatusIcon className={`h-3 w-3 ${color}`} />
                                                            </span>
                                                        )
                                                    })()}
                                                </button>

                                                {showInstrumentPicker && (
                                                    <div
                                                        ref={instrumentRef}
                                                        className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto w-48"
                                                    >
                                                        {INSTRUMENT_OPTIONS.map((opt) => (
                                                            <button
                                                                key={opt.key}
                                                                className="w-full text-left px-2.5 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors"
                                                                onClick={() => setInstrumentForUser(user.uid, opt.label)}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {allUsers.length === 0 && musicians.length === 0 && (
                            <p className="text-xs text-muted-foreground/60 italic">
                                No active members found.
                            </p>
                        )}

                        {guests.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Guests</p>
                                <div className="space-y-1">
                                    {guests.map((guest, idx) => {
                                        const fullIndex = musicians.findIndex(m =>
                                            !m.uid && m.email === guest.email && m.name === guest.name
                                        )
                                        return (
                                            <div key={`guest-${idx}`} className="flex items-center gap-2 text-sm">
                                                <Guitar className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                                <span>{guest.name}</span>
                                                {guest.instrument && (
                                                    <span className="text-xs text-muted-foreground/60">({guest.instrument})</span>
                                                )}
                                                <span className="text-xs text-muted-foreground/40 truncate">{guest.email}</span>
                                                {(() => {
                                                    const es = getEmailStatus(guest.email)
                                                    if (!es) return null
                                                    const StatusIcon = es.status === 'opened' ? MailOpen
                                                        : es.status === 'delivered' ? MailCheck
                                                            : es.status === 'bounced' || es.status === 'complained' ? MailX
                                                                : Mail
                                                    const color = es.status === 'opened' ? 'text-blue-400'
                                                        : es.status === 'delivered' ? 'text-green-400'
                                                            : es.status === 'bounced' || es.status === 'complained' ? 'text-red-400'
                                                                : 'text-muted-foreground/40'
                                                    return <span title={`Email ${es.status}`}><StatusIcon className={`h-3 w-3 shrink-0 ${color}`} /></span>
                                                })()}
                                                {canEdit && (
                                                    <button
                                                        onClick={() => removeGuest(fullIndex)}
                                                        className="ml-auto p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Suggest Replacement — shown when any musician has declined */}
                        {canEdit && isBandLeader && setlistId && schedulingAssignments.some(a => a.status === 'declined') && (
                            <div className="space-y-2">
                                {schedulingAssignments
                                    .filter(a => a.status === 'declined')
                                    .map(a => (
                                        <div key={a.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                                            <X className="h-3 w-3 text-red-500 shrink-0" />
                                            <span className="text-muted-foreground">
                                                {a.musicianName} declined{a.instrument ? ` (${a.instrument})` : ''}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-[11px] gap-1 text-brand hover:text-brand ml-auto"
                                                onClick={() => handleSuggestReplacement(a.instrument)}
                                                disabled={loadingSuggestions}
                                            >
                                                {loadingSuggestions && suggestingFor === (a.instrument || 'any') ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <UserSearch className="h-3 w-3" />
                                                )}
                                                Find Replacement
                                            </Button>
                                        </div>
                                    ))
                                }
                            </div>
                        )}

                        {/* Replacement suggestions panel */}
                        {suggestions.length > 0 && suggestingFor && (
                            <div className="p-3 rounded-lg bg-brand/5 border border-brand/20 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                        <UserSearch className="h-3.5 w-3.5 text-brand" />
                                        Available Musicians
                                    </p>
                                    <button onClick={() => { setSuggestions([]); setSuggestingFor(null) }} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestions.map(s => (
                                        <button
                                            key={s.uid}
                                            onClick={() => {
                                                const existing = musicians.find(m => m.uid === s.uid)
                                                if (!existing) {
                                                    const instrumentLabel = s.instrument
                                                        ? (INSTRUMENT_PRESETS[s.instrument]?.label || s.instrument)
                                                        : undefined
                                                    onChange([...musicians, {
                                                        uid: s.uid,
                                                        name: s.name,
                                                        email: s.email,
                                                        instrument: instrumentLabel,
                                                    }])
                                                    toast.success(`Added ${s.name}`)
                                                }
                                                setSuggestions([])
                                                setSuggestingFor(null)
                                            }}
                                            className={`
                                                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs
                                                border transition-all
                                                ${s.instrumentMatch
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground'
                                                    : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border'
                                                }
                                            `}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            {s.name}
                                            {s.instrument && (
                                                <span className="text-muted-foreground/60">
                                                    {INSTRUMENT_PRESETS[s.instrument]?.label || s.instrument}
                                                </span>
                                            )}
                                            {s.instrumentMatch && (
                                                <Check className="h-2.5 w-2.5 text-emerald-500" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canEdit && !showAddGuest && (
                            <button
                                onClick={() => setShowAddGuest(true)}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add guest musician
                            </button>
                        )}

                        {canEdit && showAddGuest && (
                            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                                <p className="text-xs font-medium text-muted-foreground">Add Guest</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Name"
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                    <Input
                                        placeholder="Instrument"
                                        value={guestInstrument}
                                        onChange={(e) => setGuestInstrument(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <Input
                                    placeholder="Email"
                                    type="email"
                                    value={guestEmail}
                                    onChange={(e) => setGuestEmail(e.target.value)}
                                    className="h-8 text-sm"
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddGuest(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={addGuest}
                                        disabled={!guestName.trim() || !guestEmail.trim()}
                                    >
                                        Add
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ErrorBoundary>
    )
}
