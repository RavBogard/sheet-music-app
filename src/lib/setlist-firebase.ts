import { db } from "./firebase";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp,
    where,
    getDocs,
    writeBatch,
    runTransaction,
    type DocumentReference,
} from "firebase/firestore";

/** Thrown when a write precondition (expectedUpdatedAt) doesn't match the remote doc. */
export class StaleWriteError extends Error {
    remoteUpdatedAt: Timestamp | null
    constructor(remoteUpdatedAt: Timestamp | null) {
        super('STALE_WRITE')
        this.name = 'StaleWriteError'
        this.remoteUpdatedAt = remoteUpdatedAt
    }
}

function timestampsMatch(a: Timestamp | null, b: Timestamp | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds
}

/**
 * Concurrency-safe partial update. Reads the doc inside a transaction, verifies
 * expectedUpdatedAt matches, applies the patch, and stamps a new updatedAt.
 * Pass expectedUpdatedAt=null to skip the precondition (only for legacy docs
 * that have never been touched since the backfill).
 */
async function updateSetlistWithVersion(
    ref: DocumentReference,
    expectedUpdatedAt: Timestamp | null,
    patch: Record<string, unknown>,
): Promise<void> {
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('NOT_FOUND')
        const remote = snap.data() as { updatedAt?: Timestamp }
        const remoteUpdatedAt = remote.updatedAt ?? null
        // Skip precondition only when both sides know there's no stamp yet.
        if (expectedUpdatedAt !== null && !timestampsMatch(remoteUpdatedAt, expectedUpdatedAt)) {
            throw new StaleWriteError(remoteUpdatedAt)
        }
        tx.update(ref, { ...patch, updatedAt: serverTimestamp() })
    })
}

import { SetlistTrack } from "@/types/api"
import { logSetlistChange } from "@/lib/setlist-audit"
import { setlistConverter } from "@/types/schemas"

// export interface SetlistTrack { ... } // Removed local definition
export type { SetlistTrack }

import { Setlist } from "@/types/api"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/api-client"
import { toDate } from "@/lib/firestore-helpers"
import { getFullServiceContext } from "@/lib/liturgical-calendar"
import { generateSetlistName } from "@/lib/liturgical-templates"
export type { Setlist }

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as T
}

function stripUndefinedDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripUndefinedDeep)
    if (value && typeof value === 'object'
        && !(typeof Timestamp === 'function' && value instanceof Timestamp)
        && Object.getPrototypeOf(value) === Object.prototype)
        return stripUndefined(
            Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripUndefinedDeep(v)])
            ) as Record<string, unknown>
        )
    return value
}

// User-specific setlist service
export function createSetlistService(userId: string | null, userName?: string | null) {
    const COLLECTION_PATH = 'setlists';

    return {
        async createSetlist(name: string, tracks: SetlistTrack[], additionalData: Partial<Setlist> = {}) {
            try {
                // Sanitize tracks: Firebase rejects undefined values
                const cleanTracks = stripUndefinedDeep(tracks) as SetlistTrack[]
                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name,
                    date: serverTimestamp(),
                    tracks: cleanTracks,
                    trackCount: tracks.length,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    ...stripUndefined(additionalData as Record<string, unknown>)
                });
                logSetlistChange(docRef.id, 'created', userId || '', userName || 'Anonymous', { name, trackCount: tracks.length })
                return docRef.id;
            } catch (e) {
                logger.error("Error creating setlist: ", e);
                throw e;
            }
        },
        // Subscribe to a single setlist by ID
        subscribeToSetlist(id: string, callback: (setlist: Setlist | null) => void) {
            const docRef = doc(db, COLLECTION_PATH, id).withConverter(setlistConverter)
            return onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                    callback(snap.data() as Setlist);
                } else {
                    callback(null);
                }
            }, (err) => {
                logger.error("[Setlist] Listener error for %s:", id, err)
            });
        },

        // Update a setlist with concurrency protection. Pass expectedUpdatedAt
        // to enforce the precondition; the write will throw StaleWriteError
        // if the remote doc has been modified since the caller last saw it.
        async updateSetlist(id: string, data: Partial<Setlist>, expectedUpdatedAt: Timestamp | null = null) {
            const docRef = doc(db, COLLECTION_PATH, id);
            const cleanData = stripUndefined(data as Record<string, unknown>);
            // updateSetlistWithVersion adds its own updatedAt; don't double-set
            delete cleanData.updatedAt;
            await updateSetlistWithVersion(docRef, expectedUpdatedAt, cleanData);

            // Determine what changed for audit
            const action = data.name !== undefined ? 'renamed'
                : data.tracks !== undefined ? 'tracks_updated'
                    : 'tracks_updated'
            logSetlistChange(id, action, userId || '', userName || 'Anonymous', {
                ...(data.name !== undefined && { newName: data.name }),
                ...(data.tracks !== undefined && { trackCount: data.tracks.length }),
            }, data.tracks)

            // Note: Update notifications are handled server-side (publish route)
            // Client-side broadcast would fail because Firestore rules restrict user doc reads
        },

        async deleteSetlist(id: string) {
            try {
                // D01: cascade delete runs server-side via Admin SDK — removes
                // the setlist doc + scheduling_assignments + tasks + setlist-
                // rooted notifications + sub-collections (history, emailEvents).
                // Client rules correctly deny most of these; the API route is
                // the single source of truth for the cascade.
                const res = await apiFetch('/api/setlist/delete', {
                    method: 'POST',
                    body: JSON.stringify({ setlistId: id }),
                })
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data?.error || `Delete failed (${res.status})`)
                }

                logSetlistChange(id, 'deleted', userId || '', userName || 'Anonymous')
            } catch (e) {
                logger.error("Error deleting setlist:", e)
                throw e
            }
        },

        // Subscribe to ALL setlists (v4.0: no private/public distinction)
        subscribeToAllSetlists(callback: (setlists: Setlist[], fromCache: boolean) => void, onError?: (error: Error) => void) {
            const collectionRef = collection(db, COLLECTION_PATH).withConverter(setlistConverter)
            const q = query(
                collectionRef,
                orderBy("date", "desc"),
                limit(50)
            );

            return onSnapshot(q, {
                next: (snapshot) => {
                    const setlists = snapshot.docs
                        .map(doc => doc.data())
                        .filter(Boolean) as Setlist[];
                    callback(setlists, snapshot.metadata.fromCache);
                },
                error: (error) => {
                    logger.error("Error subscribing to setlists:", error)
                    if (onError) onError(error)
                }
            });
        },

        // Duplicate a setlist (creates a copy owned by current user)
        async duplicateSetlist(sourceSetlistId: string, setlistData: Setlist) {
            try {
                const copyData = stripUndefinedDeep({
                    name: `${setlistData.name} (Copy)`,
                    date: serverTimestamp(),
                    tracks: setlistData.tracks,
                    trackCount: setlistData.tracks.length,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    copiedFrom: sourceSetlistId
                }) as Record<string, unknown>
                const docRef = await addDoc(collection(db, COLLECTION_PATH), copyData);
                return docRef.id;
            } catch (e) {
                logger.error("Error duplicating setlist: ", e);
                throw e;
            }
        },

        // Clone a setlist for next week: same tracks, musicians, rabbi; date +7 days; auto-name
        async cloneForNextWeek(source: Setlist): Promise<string> {
            try {
                // Compute target date: same weekday, +7 days
                const sourceDate = toDate(source.eventDate || source.date) || new Date()
                const targetDate = new Date(sourceDate)
                targetDate.setDate(targetDate.getDate() + 7)

                // Generate name from liturgical context (async — parasha lookup)
                const context = await getFullServiceContext(targetDate)
                const name = generateSetlistName(context)

                const cloneData = stripUndefinedDeep({
                    name,
                    date: Timestamp.fromDate(targetDate),
                    eventDate: Timestamp.fromDate(targetDate),
                    tracks: source.tracks,
                    trackCount: source.tracks.length,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    musicians: source.musicians || [],
                    assignedUids: (source.musicians || []).map(m => m.uid).filter(Boolean),
                    ...(source.rabbi ? { rabbi: source.rabbi } : {}),
                    clonedFrom: source.id,
                }) as Record<string, unknown>
                const docRef = await addDoc(collection(db, COLLECTION_PATH), cloneData)

                logSetlistChange(docRef.id, 'cloned', userId || '', userName || 'Anonymous')
                return docRef.id
            } catch (e) {
                logger.error("Error cloning setlist for next week:", e)
                throw e
            }
        },

        // Save a setlist as a reusable template (strips date, musicians, rabbi)
        async saveAsTemplate(source: Setlist, templateName?: string): Promise<string> {
            try {
                const templateData = stripUndefinedDeep({
                    name: templateName || `${source.name} (Template)`,
                    date: serverTimestamp(),
                    tracks: source.tracks,
                    trackCount: source.tracks.length,
                    isTemplate: true,
                    templateType: 'other',
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                }) as Record<string, unknown>
                const docRef = await addDoc(collection(db, COLLECTION_PATH), templateData)

                logSetlistChange(docRef.id, 'saved_as_template', userId || '', userName || 'Anonymous')
                return docRef.id
            } catch (e) {
                logger.error("Error saving as template:", e)
                throw e
            }
        },

        // Swap a single track in a setlist (inline song replacement). Reads the
        // current tracks inside a transaction so a concurrent write can't be
        // silently clobbered.
        async swapTrack(setlistId: string, trackIndex: number, replacement: { fileId: string; title: string; key?: string }) {
            const docRef = doc(db, 'setlists', setlistId)
            let committedTrackCount = 0
            let committedTracks: SetlistTrack[] = []
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(docRef)
                if (!snap.exists()) throw new Error('NOT_FOUND')
                const remote = snap.data() as { tracks?: SetlistTrack[] }
                // v4.3 P6-B06: defensive — corrupted docs may store `tracks` as
                // something non-array (empty object from a bad migration, etc.).
                // Treat any non-array as "empty" rather than crashing on `.length`.
                const currentTracks: SetlistTrack[] = Array.isArray(remote.tracks)
                    ? remote.tracks
                    : []
                if (trackIndex < 0 || trackIndex >= currentTracks.length) {
                    throw new Error('TRACK_INDEX_OUT_OF_RANGE')
                }
                const newTracks = [...currentTracks]
                newTracks[trackIndex] = {
                    ...newTracks[trackIndex],
                    fileId: replacement.fileId,
                    title: replacement.title,
                    key: replacement.key || newTracks[trackIndex].key,
                }
                tx.update(docRef, {
                    tracks: stripUndefinedDeep(newTracks),
                    trackCount: newTracks.length,
                    updatedAt: serverTimestamp(),
                })
                committedTrackCount = newTracks.length
                committedTracks = newTracks
            })
            logSetlistChange(setlistId, 'tracks_updated', userId || '', userName || 'Anonymous', { trackCount: committedTrackCount }, committedTracks)
        }
    };
}
