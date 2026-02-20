"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { subscribeToMusicianProfile, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { loadSongPreference, saveSongPreference } from "@/lib/song-preferences"
import { useMusicStore } from "@/lib/store"
import { MusicianProfile } from "@/types/models"

/**
 * Manages transposition with sticky per-song preferences.
 * 
 * Priority chain (highest wins):
 *   1. Per-track setlist setting (leader chose for everyone) — track.transposition
 *   2. User's saved song preference — songPreferences/{fileId}
 *   3. Musician profile instrument default — e.g., Bb trumpet = -2
 *   4. Zero (original key)
 * 
 * Auto-saves: When the user manually adjusts transposition, it's saved
 * for that song so it persists across sessions.
 */
export function useMusicianTransposition() {
    const { user } = useAuth()
    const { transposition, setTransposition, playbackQueue, queueIndex, fileUrl } = useMusicStore()
    const [profile, setProfile] = useState<MusicianProfile | null>(null)
    const [appliedForFile, setAppliedForFile] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isUserAdjustingRef = useRef(false)
    const lastAppliedTranspositionRef = useRef<number | null>(null)

    // Derive current fileId
    const fileId = (() => {
        if (queueIndex >= 0 && playbackQueue[queueIndex]?.fileId) {
            return playbackQueue[queueIndex].fileId
        }
        if (fileUrl && typeof fileUrl === "string") {
            const match = fileUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            if (match) return match[1]
        }
        return null
    })()

    // Check if leader set a per-track transposition
    const trackTransposition = (() => {
        if (queueIndex >= 0 && playbackQueue[queueIndex]) {
            return playbackQueue[queueIndex].transposition
        }
        return undefined
    })()

    // Subscribe to musician profile
    useEffect(() => {
        if (!user?.uid) return
        const unsub = subscribeToMusicianProfile(user.uid, (p) => {
            setProfile(p)
        })
        return unsub
    }, [user?.uid])

    // Load per-song preference when file changes
    useEffect(() => {
        if (!user || !fileId) return
        if (fileId === appliedForFile) return

        let cancelled = false

        async function loadPref() {
            if (!user || !fileId) return

            try {
                // If leader set a track transposition, that wins
                if (trackTransposition !== undefined && trackTransposition !== 0) {
                    setAppliedForFile(fileId)
                    lastAppliedTranspositionRef.current = trackTransposition
                    return
                }

                // Try loading user's saved preference for this song
                const pref = await loadSongPreference(user.uid, fileId)
                if (cancelled) return

                if (pref && pref.transposition !== undefined) {
                    setTransposition(pref.transposition)
                    lastAppliedTranspositionRef.current = pref.transposition
                    setAppliedForFile(fileId)
                    return
                }

                // Fall back to musician profile default
                if (profile?.defaultTransposition && profile.defaultTransposition !== 0) {
                    setTransposition(profile.defaultTransposition)
                    lastAppliedTranspositionRef.current = profile.defaultTransposition
                    setAppliedForFile(fileId)
                    return
                }

                // No preference — use current
                setAppliedForFile(fileId)
                lastAppliedTranspositionRef.current = transposition
            } catch {
                setAppliedForFile(fileId)
            }
        }

        // Reset user-adjusting flag for new file
        isUserAdjustingRef.current = false
        loadPref()
        return () => { cancelled = true }
     
    }, [user?.uid, fileId, profile, trackTransposition])

    // Auto-save when user manually changes transposition (debounced)
    useEffect(() => {
        if (!user?.uid || !fileId) return
        if (!appliedForFile || fileId !== appliedForFile) return

        // Skip if this is the initial load
        if (lastAppliedTranspositionRef.current === transposition && !isUserAdjustingRef.current) {
            return
        }

        // If leader set per-track transposition, don't save
        if (trackTransposition !== undefined && trackTransposition !== 0) return

        isUserAdjustingRef.current = true
        lastAppliedTranspositionRef.current = transposition

        const uid = user.uid

        // Debounce save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
            if (!uid || !fileId) return
            try {
                setSaving(true)
                await saveSongPreference(uid, fileId, transposition)
            } catch {
                // Silent fail
            } finally {
                setSaving(false)
            }
        }, 1500)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [transposition, user?.uid, fileId, appliedForFile, trackTransposition])

    const getInstrumentLabel = useCallback((instrument: string): string => {
        return INSTRUMENT_PRESETS[instrument]?.label || instrument
    }, [])

    return {
        profile,
        saving,
        isAutoTransposed: appliedForFile !== null && transposition !== 0,
        instrumentLabel: profile?.instrument
            ? getInstrumentLabel(profile.instrument)
            : null,
    }
}
