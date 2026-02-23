"use client"

import { useState, useCallback, useRef } from "react"
import { versionedSetlistUpdate, forceSetlistUpdate, type ConflictInfo } from "@/lib/setlist-versioning"
import { toast } from "sonner"

/**
 * Hook for versioned setlist saves with conflict resolution.
 *
 * Usage:
 *   const { save, forceOverwrite, conflict, clearConflict, version } = useVersionedSave(setlistId, userId, userName)
 *
 *   // On initial load, set the version from Firestore:
 *   setVersion(setlist.version || 0)
 *
 *   // On save:
 *   await save({ tracks, name, ... })
 *   // If conflict is set, show ConflictDialog
 */
export function useVersionedSave(
    setlistId: string | null,
    userId: string,
    userName: string
) {
    const [conflict, setConflict] = useState<ConflictInfo | null>(null)
    const versionRef = useRef(0)
    const lastDataRef = useRef<Record<string, unknown>>({})

    const setVersion = useCallback((v: number) => {
        versionRef.current = v
    }, [])

    const save = useCallback(async (data: Record<string, unknown>): Promise<boolean> => {
        if (!setlistId) return false

        lastDataRef.current = data

        try {
            const result = await versionedSetlistUpdate(
                setlistId,
                versionRef.current,
                data,
                userId,
                userName
            )

            if (result === true) {
                versionRef.current += 1
                return true
            }

            // Conflict — surface it
            setConflict(result)
            return false
        } catch {
            toast.error("Failed to save setlist")
            return false
        }
    }, [setlistId, userId, userName])

    const acceptRemote = useCallback(() => {
        if (conflict) {
            versionRef.current = conflict.remoteVersion
        }
        setConflict(null)
    }, [conflict])

    const forceOverwrite = useCallback(async (): Promise<boolean> => {
        if (!setlistId) return false

        try {
            await forceSetlistUpdate(
                setlistId,
                lastDataRef.current,
                userId,
                userName
            )
            if (conflict) {
                versionRef.current = conflict.remoteVersion + 1
            }
            setConflict(null)
            toast.success("Changes saved (overwritten)")
            return true
        } catch {
            toast.error("Failed to save setlist")
            return false
        }
    }, [setlistId, userId, userName, conflict])

    const clearConflict = useCallback(() => {
        setConflict(null)
    }, [])

    return {
        save,
        forceOverwrite,
        acceptRemote,
        conflict,
        clearConflict,
        setVersion,
        getVersion: () => versionRef.current,
    }
}
