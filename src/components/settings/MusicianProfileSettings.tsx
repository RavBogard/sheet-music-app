"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { MusicianProfile } from "@/types/models"
import { saveMusicianProfile, subscribeToMusicianProfile, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { Button } from "@/components/ui/button"
import { Guitar, Check } from "lucide-react"
import { toast } from "sonner"

export function MusicianProfileSettings() {
    const { user } = useAuth()
    const [profile, setProfile] = useState<MusicianProfile>({})
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Subscribe to current profile
    useEffect(() => {
        if (!user) return
        const unsub = subscribeToMusicianProfile(user.uid, (p) => {
            if (p) setProfile(p)
            setLoaded(true)
        })
        return unsub
    }, [user])

    const updateField = <K extends keyof MusicianProfile>(key: K, value: MusicianProfile[K]) => {
        setProfile(prev => ({ ...prev, [key]: value }))
        setHasChanges(true)
    }

    const selectInstrument = (instrumentKey: string) => {
        const preset = INSTRUMENT_PRESETS[instrumentKey]
        if (!preset) return

        setProfile(prev => ({
            ...prev,
            instrument: instrumentKey,
            defaultTransposition: preset.transposition,
            // Set sensible defaults based on instrument
            preferCapo: preset.suggestCapo || false,
            preferFlats: preset.transposition !== 0, // Transposing instruments often prefer flats
        }))
        setHasChanges(true)
    }

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        try {
            await saveMusicianProfile(profile)
            setHasChanges(false)
            toast.success("Profile saved")
        } catch (err: unknown) {
            toast.error("Failed to save: " + (err instanceof Error ? err.message : "Unknown error"))
        } finally {
            setSaving(false)
        }
    }

    if (!loaded) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-6 bg-muted rounded w-48" />
                <div className="h-32 bg-muted rounded-xl" />
            </div>
        )
    }

    const currentPreset = profile.instrument ? INSTRUMENT_PRESETS[profile.instrument] : null

    return (
        <div className="space-y-6">
            {/* Section Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Guitar className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Musician Profile</h3>
                    <p className="text-sm text-muted-foreground">
                        Set your instrument for automatic transposition and personalized gig packets
                    </p>
                </div>
            </div>

            {/* Instrument Selection */}
            <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Instrument</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(INSTRUMENT_PRESETS).map(([key, preset]) => (
                        <button
                            key={key}
                            onClick={() => selectInstrument(key)}
                            className={`
                                relative px-3 py-2.5 rounded-xl text-left transition-all text-sm
                                ${profile.instrument === key
                                    ? 'bg-violet-500/10 border-violet-500/50 text-foreground ring-1 ring-violet-500/30'
                                    : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                                }
                                border
                            `}
                        >
                            <div className="font-medium">{preset.label}</div>
                            {preset.transposition !== 0 && (
                                <div className="text-xs opacity-60 mt-0.5">
                                    {preset.transposition > 0 ? '+' : ''}{preset.transposition} semitones
                                </div>
                            )}
                            {profile.instrument === key && (
                                <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-violet-500" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Transposition Details (shown when instrument selected) */}
            {currentPreset && (
                <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border">
                    <p className="text-sm text-muted-foreground">{currentPreset.description}</p>

                    {/* Custom Transposition Override */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                            Transposition Offset (semitones)
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => updateField('defaultTransposition', (profile.defaultTransposition || 0) - 1)}
                                className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors font-bold"
                            >
                                −
                            </button>
                            <div className="w-16 text-center font-mono text-lg text-foreground">
                                {(profile.defaultTransposition || 0) > 0 ? '+' : ''}{profile.defaultTransposition || 0}
                            </div>
                            <button
                                onClick={() => updateField('defaultTransposition', (profile.defaultTransposition || 0) + 1)}
                                className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors font-bold"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Capo Preferences (for instruments that use capo) */}
                    {currentPreset?.suggestCapo && (
                        <div className="space-y-3 pt-2 border-t border-border">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">
                                    Show capo notation
                                </label>
                                <button
                                    onClick={() => updateField('preferCapo', !profile.preferCapo)}
                                    className={`
                                        w-11 h-6 rounded-full transition-colors relative
                                        ${profile.preferCapo ? 'bg-violet-500' : 'bg-muted border border-border'}
                                    `}
                                >
                                    <div className={`
                                        w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform
                                        ${profile.preferCapo ? 'translate-x-5' : 'translate-x-0.5'}
                                    `} />
                                </button>
                            </div>
                            {profile.preferCapo && (
                                <div className="space-y-2">
                                    <label className="text-sm text-muted-foreground">
                                        Default capo fret
                                    </label>
                                    <div className="flex gap-1.5">
                                        {[0, 1, 2, 3, 4, 5, 6, 7].map(fret => (
                                            <button
                                                key={fret}
                                                onClick={() => updateField('preferredCapoFret', fret)}
                                                className={`
                                                    w-9 h-9 rounded-lg text-sm font-medium transition-all
                                                    ${profile.preferredCapoFret === fret
                                                        ? 'bg-violet-500 text-white'
                                                        : 'bg-muted border border-border text-muted-foreground hover:text-foreground'
                                                    }
                                                `}
                                            >
                                                {fret || '—'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Flat/Sharp Preference */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <label className="text-sm font-medium text-foreground">
                            Prefer flats (Bb) over sharps (A#)
                        </label>
                        <button
                            onClick={() => updateField('preferFlats', !profile.preferFlats)}
                            className={`
                                w-11 h-6 rounded-full transition-colors relative
                                ${profile.preferFlats ? 'bg-violet-500' : 'bg-muted border border-border'}
                            `}
                        >
                            <div className={`
                                w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform
                                ${profile.preferFlats ? 'translate-x-5' : 'translate-x-0.5'}
                            `} />
                        </button>
                    </div>
                </div>
            )}

            {/* Save Button */}
            {hasChanges && (
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold"
                >
                    {saving ? "Saving..." : "Save Profile"}
                </Button>
            )}
        </div>
    )
}
