"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { subscribeToMusicianProfile } from "@/lib/musician-profile"
import { useMusicStore } from "@/lib/store"
import { MusicianProfile } from "@/types/models"

/**
 * Automatically applies the musician's profile transposition when they enter performance mode.
 * This reads the musician profile from Firestore and sets the transposer accordingly.
 * 
 * Only applies on initial load — manual adjustments override the auto-transposition.
 */
export function useMusicianTransposition() {
    const { user } = useAuth()
    const { transposition, setTransposition } = useMusicStore()
    const [profile, setProfile] = useState<MusicianProfile | null>(null)
    const [applied, setApplied] = useState(false)

    // Subscribe to profile
    useEffect(() => {
        if (!user) return
        const unsub = subscribeToMusicianProfile(user.uid, (p) => {
            setProfile(p)
        })
        return unsub
    }, [user])

    // Auto-apply transposition on first load (only once per session)
    useEffect(() => {
        if (applied) return
        if (!profile) return
        if (profile.defaultTransposition === undefined || profile.defaultTransposition === 0) return

        // Only auto-apply if user hasn't already manually adjusted
        if (transposition === 0) {
            setTransposition(profile.defaultTransposition)
            setApplied(true)
        }
    }, [profile, applied, transposition, setTransposition])

    return {
        profile,
        isAutoTransposed: applied && profile?.defaultTransposition !== 0,
        instrumentLabel: profile?.instrument
            ? getInstrumentLabel(profile.instrument)
            : null,
    }
}

function getInstrumentLabel(instrument: string): string {
    const labels: Record<string, string> = {
        'guitar': 'Guitar',
        'bass': 'Bass',
        'piano': 'Piano/Keys',
        'voice': 'Voice',
        'ukulele': 'Ukulele',
        'bb_trumpet': 'Bb Trumpet',
        'bb_clarinet': 'Bb Clarinet',
        'bb_tenor_sax': 'Bb Tenor Sax',
        'bb_soprano_sax': 'Bb Soprano Sax',
        'eb_alto_sax': 'Eb Alto Sax',
        'eb_bari_sax': 'Eb Baritone Sax',
        'f_horn': 'French Horn',
        'other': 'Custom',
    }
    return labels[instrument] || instrument
}
