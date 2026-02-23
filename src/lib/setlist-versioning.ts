/**
 * Setlist Versioning & Conflict Resolution
 *
 * Adds optimistic locking to setlist saves. Each save increments a
 * `version` counter. Before writing, we check that the version in
 * Firestore matches what we last read. If not, another user modified
 * the setlist and we surface a conflict to the user.
 */

import { db } from "./firebase"
import { doc, runTransaction, serverTimestamp } from "firebase/firestore"
import { logger } from "@/lib/logger"
import { SetlistTrack } from "@/types/models"

export interface VersionedUpdate {
    /** The version number we read when the editor opened */
    expectedVersion: number
    /** Partial setlist fields to update */
    data: Record<string, unknown>
}

export interface ConflictInfo {
    /** Who last modified the setlist */
    lastEditor: string
    /** When the remote version was saved */
    lastUpdatedAt: Date | null
    /** The remote tracks (for comparison) */
    remoteTracks: SetlistTrack[]
    /** The remote version number */
    remoteVersion: number
}

/**
 * Attempt a versioned update. Returns true on success,
 * or a ConflictInfo object if versions don't match.
 */
export async function versionedSetlistUpdate(
    setlistId: string,
    expectedVersion: number,
    data: Record<string, unknown>,
    userId: string,
    userName: string
): Promise<true | ConflictInfo> {
    const docRef = doc(db, "setlists", setlistId)

    try {
        const result = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(docRef)
            if (!snap.exists()) throw new Error("Setlist not found")

            const current = snap.data()
            const currentVersion = current.version || 0

            if (currentVersion !== expectedVersion) {
                // Conflict detected
                return {
                    conflict: true as const,
                    lastEditor: current.ownerName || 'Someone',
                    lastUpdatedAt: current.updatedAt?.toDate?.() || null,
                    remoteTracks: current.tracks || [],
                    remoteVersion: currentVersion,
                }
            }

            // Version matches — safe to write
            transaction.update(docRef, {
                ...data,
                version: currentVersion + 1,
                updatedAt: serverTimestamp(),
                lastEditedBy: userId,
                lastEditedByName: userName,
            })

            return { conflict: false as const }
        })

        if (result.conflict) {
            return {
                lastEditor: result.lastEditor,
                lastUpdatedAt: result.lastUpdatedAt,
                remoteTracks: result.remoteTracks,
                remoteVersion: result.remoteVersion,
            }
        }

        return true
    } catch (err) {
        logger.error("[Versioning] Transaction failed:", err)
        throw err
    }
}

/**
 * Force-save with a new version (used after user reviews conflict and
 * chooses "Keep my changes"). Overwrites regardless of current version.
 */
export async function forceSetlistUpdate(
    setlistId: string,
    data: Record<string, unknown>,
    userId: string,
    userName: string
): Promise<void> {
    const docRef = doc(db, "setlists", setlistId)

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef)
        if (!snap.exists()) throw new Error("Setlist not found")

        const current = snap.data()
        const currentVersion = current.version || 0

        transaction.update(docRef, {
            ...data,
            version: currentVersion + 1,
            updatedAt: serverTimestamp(),
            lastEditedBy: userId,
            lastEditedByName: userName,
        })
    })
}
