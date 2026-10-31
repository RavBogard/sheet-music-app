"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { subscribeToMusicianProfile } from "@/lib/musician-profile"
import { instrumentLabel } from "@/lib/instrument-labels"
import { useT } from "@/i18n/client"
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
                    if (cancelled) return
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
                    if (cancelled) return
                    setTransposition(profile.defaultTransposition)
                    lastAppliedTranspositionRef.current = profile.defaultTransposition
                    setAppliedForFile(fileId)
                    return
                }

                // No preference — use current
                if (cancelled) return
                setAppliedForFile(fileId)
                lastAppliedTranspositionRef.current = transposition
            } catch {
                if (cancelled) return
                setAppliedForFile(fileId)
            }
        }

        // Reset user-adjusting flag for new file
        isUserAdjustingRef.current = false
        loadPref()
        return () => { cancelled = true }
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const t = useT()
    const getInstrumentLabel = useCallback((instrument: string): string => {
        return instrumentLabel(instrument, t)
    }, [t])

    return {
        profile,
        saving,
        isAutoTransposed: appliedForFile !== null && transposition !== 0,
        instrumentLabel: profile?.instrument
            ? getInstrumentLabel(profile.instrument)
            : null,
    }
}

/**
 * PERF-14: per-device transposition for SIGNED-OUT devices.
 *
 * A signed-out horn or guitar player used to re-transpose every chart every
 * week: `useMusicianTransposition` saves to Firestore and needs a user. This
 * hook keeps `{fileId → semitones}` in `music-storage` instead, as `chartZoom`
 * already does. It is mounted by PDFOverlay (always present while a chart is
 * open), not by the transposer popover, so the saved value is applied on
 * every chart change whether or not the popover is opened.
 *
 * - Signed-in users are untouched: they keep the Firestore preference.
 * - A leader's per-track transposition always wins — an explicit 0 included —
 *   and is never recorded as the device's own choice.
 * - Nothing runs while auth is still resolving, so a signed-in user's
 *   Firestore preference is never raced by the device map.
 */
export function useDeviceTranspositionPrefs(): void {
    const { user, loading } = useAuth()
    const fileId = useMusicStore((s) => s.playbackQueue[s.queueIndex]?.fileId ?? null)
    const leaderTransposition = useMusicStore((s) => s.playbackQueue[s.queueIndex]?.transposition)
    const transposition = useMusicStore((s) => s.transposition)
    // The queue array and position identify one "arrival" on a chart. A queue
    // rebuild (live-director edit) resets `transposition` to the track value
    // even when the fileId is unchanged, so it must count as a new arrival —
    // otherwise that reset would be recorded as the musician's choice.
    const queue = useMusicStore((s) => s.playbackQueue)
    const queueIndex = useMusicStore((s) => s.queueIndex)
    const appliedForRef = useRef<{ fileId: string; queue: unknown; queueIndex: number } | null>(null)

    const eligible = !loading && !user && !!fileId && !fileId.startsWith("flow-")
    // An explicit leader value — including 0, "play it as written" — is set
    // and wins. Only null/undefined means the leader left it to the musician.
    const leaderSet = leaderTransposition !== undefined && leaderTransposition !== null

    useEffect(() => {
        if (!eligible || !fileId) {
            appliedForRef.current = null
            return
        }
        const store = useMusicStore.getState()
        const applied = appliedForRef.current
        if (!applied || applied.fileId !== fileId || applied.queue !== queue || applied.queueIndex !== queueIndex) {
            // Arrived on this chart: apply the device's saved choice.
            appliedForRef.current = { fileId, queue, queueIndex }
            if (leaderSet) return
            const saved = store.chartTransposition?.[fileId]
            if (typeof saved === "number" && saved !== transposition) store.setTransposition(saved)
            return
        }
        // Same chart, transposition changed: the musician adjusted it.
        if (leaderSet) return
        if (store.chartTransposition?.[fileId] !== transposition) {
            store.setChartTransposition(fileId, transposition)
        }
    }, [eligible, fileId, transposition, leaderSet, queue, queueIndex])
}
