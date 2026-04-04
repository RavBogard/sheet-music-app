"use client"

import { useMemo, useCallback } from "react"
import { doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import type { SongGroupsConfig, SongGroup, SongGroupEntry } from "@/types/song-groups"

/**
 * Real-time subscription to config/songGroups with lookup helpers.
 *
 * Provides:
 * - getAlternatives(slot, currentFileId) — other songs in the same liturgical group
 * - hasAlternatives(slot, currentFileId) — boolean for swap eligibility
 * - allGroups — sorted array of all groups (for admin UI)
 */
export function useSongGroups() {
    const { user } = useAuth()

    const ref = useMemo(
        () => (user ? doc(db, "config", "songGroups") : null),
        [user]
    )

    const { data, loading, error } = useSafeFirestoreSync<SongGroupsConfig>(ref)

    /** Get alternatives for a given liturgical slot, excluding the current song */
    const getAlternatives = useCallback((liturgicalSlot: string, currentFileId?: string): SongGroupEntry[] => {
        if (!data?.groups) return []
        const group = Object.values(data.groups).find(
            (g) => g.liturgicalSlot === liturgicalSlot
        )
        if (!group) return []
        return group.songs.filter((s) => s.fileId !== currentFileId)
    }, [data])

    /** Fallback: find alternatives by fileId when liturgicalSlot is missing on the track */
    const getAlternativesByFileId = useCallback((fileId: string): SongGroupEntry[] => {
        if (!data?.groups) return []
        for (const group of Object.values(data.groups)) {
            if (group.songs.some(s => s.fileId === fileId)) {
                return group.songs.filter(s => s.fileId !== fileId)
            }
        }
        return []
    }, [data])

    /** Check if a slot has swap alternatives available */
    const hasAlternatives = useCallback((liturgicalSlot: string, currentFileId?: string): boolean => {
        if (!data?.groups) return false
        return getAlternatives(liturgicalSlot, currentFileId).length > 0
    }, [data, getAlternatives])

    /** Get all groups sorted by sortOrder (for admin UI) */
    const allGroups: SongGroup[] = useMemo(() => {
        if (!data?.groups) return []
        return Object.values(data.groups).sort((a, b) => a.sortOrder - b.sortOrder)
    }, [data])

    return {
        groups: data,
        allGroups,
        getAlternatives,
        getAlternativesByFileId,
        hasAlternatives,
        loading,
        error,
    }
}
