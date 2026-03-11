"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SetlistMusician, UserProfile, SchedulingAssignment } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { subscribeToAllUsers } from "@/lib/users-firebase"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { db } from "@/lib/firebase"
import { doc, updateDoc, collection } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Users, Plus, X, ChevronDown, ChevronUp, Guitar, UserPlus, Mail, MailCheck, MailOpen, MailX, Send, Check, Loader2, UserSearch, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { ErrorBoundary } from "react-error-boundary"
import { FallbackError } from "@/components/ui/fallback-error"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { subscribeToSetlistAssignments, assignMusicians } from "@/lib/scheduling-firebase"
import { RabbiBanner } from "@/components/scheduling/RabbiBanner"
import { MusicianChip } from "./MusicianChip"
import { BandSuggestionsPanel } from "./BandSuggestionsPanel"
import { AddGuestForm } from "./AddGuestForm"

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

export function MusicianPicker({ musicians, onChange, canEdit, setlistId, setlistName, eventDate, rabbiName, isPublished }: MusicianPickerProps) {
    const { isAdmin, isBandLeader, user: currentUser } = useAuth()
    const congregation = useCongregation()
    const [expanded, setExpanded] = useState(musicians.length > 0)
    const [allUsers, setAllUsers] = useState<UserProfile[]>([])
    const [showAddGuest, setShowAddGuest] = useState(false)
    const [editingInstrumentUid, setEditingInstrumentUid] = useState<string | null>(null)
    const instrumentRef = useRef<HTMLDivElement>(null)
    const [emailStatuses, setEmailStatuses] = useState<Map<string, EmailStatus>>(new Map())
    const [schedulingAssignments, setSchedulingAssignments] = useState<SchedulingAssignment[]>([])
    const [isSendingRequests, setIsSendingRequests] = useState(false)
    const [suggestingFor, setSuggestingFor] = useState<string | null>(null) // declined musician instrument
    const [suggestions, setSuggestions] = useState<Array<{ uid: string; name: string; email: string; instrument: string | null; instrumentMatch: boolean | null }>>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)

    // Smart band suggestion state
    const [bandSuggestions, setBandSuggestions] = useState<Array<{
        uid: string; name: string; email: string; phone: string | null;
        instrumentKey: string | null; instrumentLabel: string | null;
        schedulingTier: string; score: number;
        reasons: string[];
    }>>([])
    const [bandSuggestionsGap, setBandSuggestionsGap] = useState<string[]>([])
    const [bandSuggestionsGuidance, setBandSuggestionsGuidance] = useState<string | null>(null)
    const [loadingBandSuggestions, setLoadingBandSuggestions] = useState(false)
    const [showBandSuggestions, setShowBandSuggestions] = useState(false)

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

    // Fetch smart band suggestions via the suggest-band API
    const handleSuggestBand = useCallback(async () => {
        if (!setlistId) return
        setLoadingBandSuggestions(true)
        setShowBandSuggestions(true)
        try {
            const { apiFetch } = await import('@/lib/api-client')
            const params = new URLSearchParams({ setlistId })
            if (eventDate) params.set('date', eventDate.split('T')[0])
            if (rabbiName) params.set('rabbiName', rabbiName)
            const selectedUids = musicians.filter(m => m.uid).map(m => m.uid!).join(',')
            if (selectedUids) params.set('selectedUids', selectedUids)

            const res = await apiFetch(`/api/scheduling/suggest-band?${params}`)
            const data = await res.json()
            if (data.success) {
                setBandSuggestions(data.suggestions || [])
                setBandSuggestionsGap(data.coverageGap || [])
                setBandSuggestionsGuidance(data.rabbiGuidance || null)
            }
        } catch {
            toast.error('Failed to fetch suggestions')
        } finally {
            setLoadingBandSuggestions(false)
        }
    }, [setlistId, eventDate, rabbiName, musicians])

    useEffect(() => {
        const unsub = subscribeToAllUsers((users) => {
            // Only show musicians, band leaders, and admins in the picker
            // (not plain members — they're community, not band)
            let active = users.filter(u =>
                u.role === 'musician' || u.role === 'band_leader' || u.role === 'admin'
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

    const addGuest = useCallback((name: string, email: string, instrument?: string) => {
        onChange([...musicians, { name, email, instrument }])
        setShowAddGuest(false)
    }, [musicians, onChange])

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

                            {/* Suggest Band button — smart ranking */}
                            {canEdit && isBandLeader && setlistId && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                                    onClick={handleSuggestBand}
                                    disabled={loadingBandSuggestions}
                                >
                                    {loadingBandSuggestions ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3 w-3" />
                                    )}
                                    {loadingBandSuggestions ? 'Loading...' : 'Suggest Band'}
                                </Button>
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
                                    {allUsers.map((user) => (
                                        <MusicianChip
                                            key={user.uid}
                                            user={user}
                                            selected={isSelected(user.uid)}
                                            instrument={getInstrumentLabel(user)}
                                            isDefault={defaultUids.has(user.uid)}
                                            schedulingStatus={getSchedulingStatus(user.uid)}
                                            emailStatus={getEmailStatus(user.email)}
                                            canEdit={canEdit}
                                            isAdmin={isAdmin}
                                            showInstrumentPicker={editingInstrumentUid === user.uid}
                                            instrumentRef={instrumentRef}
                                            onToggle={() => toggleUser(user)}
                                            onEditInstrument={() => setEditingInstrumentUid(user.uid)}
                                            onSetInstrument={(instrument) => setInstrumentForUser(user.uid, instrument)}
                                            onToggleDefault={() => toggleDefault(user)}
                                        />
                                    ))}
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

                        {/* Smart Band Suggestions panel */}
                        {showBandSuggestions && (
                            <BandSuggestionsPanel
                                suggestions={bandSuggestions}
                                gap={bandSuggestionsGap}
                                guidance={bandSuggestionsGuidance}
                                loading={loadingBandSuggestions}
                                musicians={musicians}
                                onChange={onChange}
                                onClose={() => setShowBandSuggestions(false)}
                            />
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
                            <AddGuestForm
                                onAdd={addGuest}
                                onCancel={() => setShowAddGuest(false)}
                            />
                        )}
                    </div>
                )}
            </div>
        </ErrorBoundary>
    )
}
