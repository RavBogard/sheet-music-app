"use client"

import { useState, useEffect, useCallback } from "react"
import { SetlistMusician } from "@/types/models"
import { MusicianProfile } from "@/types/models"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Plus, X, ChevronDown, ChevronUp, Guitar } from "lucide-react"

interface RegisteredMusician {
    uid: string
    displayName: string
    profile: MusicianProfile
}

interface MusicianPickerProps {
    musicians: SetlistMusician[]
    onChange: (musicians: SetlistMusician[]) => void
    canEdit: boolean
}

export function MusicianPicker({ musicians, onChange, canEdit }: MusicianPickerProps) {
    const [expanded, setExpanded] = useState(musicians.length > 0)
    const [registered, setRegistered] = useState<RegisteredMusician[]>([])
    const [showAddGuest, setShowAddGuest] = useState(false)
    const [guestName, setGuestName] = useState("")
    const [guestEmail, setGuestEmail] = useState("")
    const [guestInstrument, setGuestInstrument] = useState("")

    // Subscribe to registered musicians
    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles((profiles) => {
            setRegistered(profiles)
        })
        return () => unsub()
    }, [])

    const isSelected = useCallback((uid: string) => {
        return musicians.some(m => m.uid === uid)
    }, [musicians])

    const toggleRegistered = useCallback((reg: RegisteredMusician) => {
        if (!canEdit) return
        const exists = musicians.find(m => m.uid === reg.uid)
        if (exists) {
            onChange(musicians.filter(m => m.uid !== reg.uid))
        } else {
            const instrumentLabel = reg.profile.instrument
                ? INSTRUMENT_PRESETS[reg.profile.instrument]?.label || reg.profile.instrument
                : undefined
            onChange([...musicians, {
                uid: reg.uid,
                name: reg.displayName,
                email: "", // Will be filled from Firestore at publish time
                instrument: instrumentLabel,
            }])
        }
    }, [musicians, onChange, canEdit])

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

    const removeMusician = useCallback((index: number) => {
        if (!canEdit) return
        onChange(musicians.filter((_, i) => i !== index))
    }, [musicians, onChange, canEdit])

    // Guests are musicians without a uid
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
                    {/* Registered musicians — tap to toggle */}
                    {registered.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Members</p>
                            <div className="flex flex-wrap gap-1.5">
                                {registered.map((reg) => {
                                    const selected = isSelected(reg.uid)
                                    const instrumentLabel = reg.profile.instrument
                                        ? INSTRUMENT_PRESETS[reg.profile.instrument]?.label || reg.profile.instrument
                                        : null
                                    return (
                                        <button
                                            key={reg.uid}
                                            onClick={() => toggleRegistered(reg)}
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
                                            <span>{reg.displayName}</span>
                                            {instrumentLabel && (
                                                <span className="text-xs text-muted-foreground/60">{instrumentLabel}</span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {registered.length === 0 && musicians.length === 0 && (
                        <p className="text-xs text-muted-foreground/60 italic">
                            No members have set up musician profiles yet. Add guests below.
                        </p>
                    )}

                    {/* Guest musicians */}
                    {guests.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Guests</p>
                            <div className="space-y-1">
                                {guests.map((guest, idx) => {
                                    // Find the actual index in the full musicians array
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
                                            <span className="text-xs text-muted-foreground/40">{guest.email}</span>
                                            {canEdit && (
                                                <button
                                                    onClick={() => removeMusician(fullIndex)}
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
