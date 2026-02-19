"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { SetlistMusician, UserProfile } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { subscribeToAllUsers } from "@/lib/users-firebase"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Plus, X, ChevronDown, ChevronUp, Guitar } from "lucide-react"

interface MusicianPickerProps {
    musicians: SetlistMusician[]
    onChange: (musicians: SetlistMusician[]) => void
    canEdit: boolean
}

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENT_PRESETS).map(([key, val]) => ({
    key,
    label: val.label,
}))

export function MusicianPicker({ musicians, onChange, canEdit }: MusicianPickerProps) {
    const { isAdmin, user: currentUser } = useAuth()
    const [expanded, setExpanded] = useState(musicians.length > 0)
    const [allUsers, setAllUsers] = useState<UserProfile[]>([])
    const [showAddGuest, setShowAddGuest] = useState(false)
    const [guestName, setGuestName] = useState("")
    const [guestEmail, setGuestEmail] = useState("")
    const [guestInstrument, setGuestInstrument] = useState("")
    // Which musician uid has instrument picker open
    const [editingInstrumentUid, setEditingInstrumentUid] = useState<string | null>(null)
    const instrumentRef = useRef<HTMLDivElement>(null)

    // Subscribe to all users — filter to active members
    useEffect(() => {
        const unsub = subscribeToAllUsers((users) => {
            let active = users.filter(u =>
                u.role === 'member' || u.role === 'leader' || u.role === 'admin'
            )

            // Ensure current user is always in the list
            if (currentUser && !active.some(u => u.uid === currentUser.uid)) {
                active = [{
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me',
                    role: 'member' as const,
                } as UserProfile, ...active]
            }

            setAllUsers(active)
        })
        return () => unsub()
    }, [currentUser])

    // Close instrument picker on outside click
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
        // Check if they're already assigned with an instrument override
        const assigned = musicians.find(m => m.uid === user.uid)
        if (assigned?.instrument) return assigned.instrument
        // Fall back to their profile instrument
        const profileKey = user.musicianProfile?.instrument
        if (profileKey) return INSTRUMENT_PRESETS[profileKey]?.label || profileKey
        return undefined
    }, [musicians])

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

    const guests = musicians.filter(m => !m.uid)

    return (
        <div className="border-b border-border/50">
            {/* Toggle header */}
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
                {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>

            {expanded && (
                <div className="px-4 pb-3 space-y-3">
                    {/* All active members — tap to toggle */}
                    {allUsers.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Members</p>
                            <div className="flex flex-wrap gap-1.5">
                                {allUsers.map((user) => {
                                    const selected = isSelected(user.uid)
                                    const instrument = getInstrumentLabel(user)
                                    const showInstrumentPicker = editingInstrumentUid === user.uid

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
                                                        : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border'
                                                    }
                                                    ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}
                                                `}
                                            >
                                                {selected && (
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
                                            </button>

                                            {/* Inline instrument picker */}
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

                    {/* Guest musicians */}
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

                    {/* Add guest form */}
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
    )
}
