import { db } from "./firebase";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
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
import { getFullServiceContext, getServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { generateSetlistName } from "@/lib/liturgical-templates"
import { captureSyncFailure } from "@/lib/sync/sentry-capture"
export type { Setlist }

/**
 * ServiceType values that the legacy `templateType: 'festival'` field
 * collapses across. When a candidate setlist has `templateType: 'festival'`,
 * it matches a request for any of these specific holiday types (per v51-03
 * plan: festival templateType is a multi-match bucket because the field was
 * added before the per-holiday types existed).
 */
const FESTIVAL_SERVICE_TYPES: readonly ServiceType[] = [
    'sukkot',
    'simchat_torah',
    'passover',
    'shavuot',
] as const

/**
 * Returns true if the given setlist matches the requested ServiceType.
 *
 * Resolution order:
 *  1. If `templateType` is set and not 'other', use it (user's stated intent).
 *     - Direct types map 1:1.
 *     - 'festival' matches any of FESTIVAL_SERVICE_TYPES.
 *  2. Else infer from the setlist's eventDate (or date) via getServiceContext.
 *
 * Pure function — exported for unit testing.
 */
export function setlistMatchesServiceType(
    setlist: Pick<Setlist, 'eventDate' | 'date' | 'templateType'>,
    requestedType: ServiceType,
): boolean {
    const tt = setlist.templateType
    if (tt && tt !== 'other') {
        if (tt === 'festival') return FESTIVAL_SERVICE_TYPES.includes(requestedType)
        return tt === requestedType
    }
    const effDate = toDate(setlist.eventDate ?? setlist.date)
    if (!effDate) return false
    return getServiceContext(effDate).type === requestedType
}

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
                    // v51-h01: stamp updatedAt so SetlistGridHydrator's lazy-hydration
                    // can pass `expectedUpdatedAt: initialSetlist.updatedAt` and have
                    // it match the remote on first edit. Without this, the precondition
                    // check in updateSetlistWithVersion compares undefined vs the
                    // server-stamped value the snapshot-listener may have just
                    // delivered → StaleWriteError → engine state → 'failed'.
                    updatedAt: serverTimestamp(),
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
                // v51-h01: instrument the direct-write path that v50-07-05 missed.
                captureSyncFailure(e, {
                    feature: 'write-atomicity',
                    site: 'createSetlist',
                    op: 'create',
                    collection: COLLECTION_PATH,
                    trackCount: tracks.length,
                })
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
            const cleanData = stripUndefinedDeep(data) as Record<string, unknown>;
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
                    tracks: setlistData.tracks.map((t, i) => ({
                        ...t,
                        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`
                    })),
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

        // v52-05: read the admin-curated default pointer for `serviceType`
        // from `config/defaults`. Returns the setlistId stored at that key,
        // or null when the doc is missing / the key is unset / the read
        // fails. Silent fallback semantics — caller is expected to fall
        // through to the legacy 20-most-recent query on null (Track D OQ Q5).
        async getDefaultForServiceType(serviceType: ServiceType): Promise<string | null> {
            try {
                const ref = doc(db, 'config', 'defaults')
                const snap = await getDoc(ref)
                if (!snap.exists()) return null
                const data = snap.data() as Record<string, unknown>
                const id = data[serviceType]
                return typeof id === 'string' && id.length > 0 ? id : null
            } catch (e) {
                logger.error('Error reading config/defaults:', e)
                return null
            }
        },

        // v52-05: admin-only write of the canonical default for `serviceType`.
        // Uses setDoc with merge: true so each call only updates one key —
        // other service-type pointers are preserved. Firestore rules enforce
        // admin-only at the server (allow write: if isAdmin()); this method
        // does not gate client-side beyond what rules already enforce.
        async setDefaultForServiceType(serviceType: ServiceType, setlistId: string): Promise<void> {
            const ref = doc(db, 'config', 'defaults')
            await setDoc(
                ref,
                {
                    [serviceType]: setlistId,
                    updatedAt: serverTimestamp(),
                    updatedBy: userId ?? 'unknown',
                },
                { merge: true },
            )
            logSetlistChange(setlistId, 'set_as_default', userId || '', userName || 'Anonymous')
        },

        // Find the most recent setlist matching `serviceType` whose effective
        // event date is strictly before `beforeDate` (or before "now" if not
        // given). Returns null on no-match or query failure (graceful — wizard
        // simply hides the Clone CTA).
        async findLastMatchingService(
            serviceType: ServiceType,
            beforeDate?: Date,
        ): Promise<Setlist | null> {
            // v52-05: consult config/defaults pointer first. Silent fallback
            // on missing / dangling / repurposed pointer — graceful degradation,
            // no error surface (Track D OQ Q5 lock).
            try {
                const defaultId = await this.getDefaultForServiceType(serviceType)
                if (defaultId) {
                    const ref = doc(db, COLLECTION_PATH, defaultId).withConverter(setlistConverter)
                    const snap = await getDoc(ref)
                    if (snap.exists()) {
                        const candidate = snap.data() as Setlist | null
                        if (
                            candidate &&
                            !candidate.isTemplate &&
                            setlistMatchesServiceType(candidate, serviceType)
                        ) {
                            return candidate
                        }
                    }
                    // dangling or repurposed pointer — silent fallthrough
                }
            } catch {
                // pointer read failed — silent fallthrough to legacy query
            }

            try {
                const collectionRef = collection(db, COLLECTION_PATH).withConverter(setlistConverter)
                const q = query(collectionRef, orderBy('date', 'desc'), limit(20))
                const snap = await getDocs(q)
                for (const docSnap of snap.docs) {
                    const candidate = docSnap.data() as Setlist | null
                    if (!candidate) continue
                    if (candidate.isTemplate) continue
                    const effDate = toDate(candidate.eventDate ?? candidate.date)
                    if (!effDate) continue
                    if (beforeDate && effDate >= beforeDate) continue
                    if (setlistMatchesServiceType(candidate, serviceType)) {
                        return candidate
                    }
                }
                return null
            } catch (e) {
                logger.error("Error finding last matching service:", e)
                return null
            }
        },

        // Generic clone: copy source's tracks/musicians/rabbi onto a new
        // setlist scheduled for `targetDate`. Tracks are copied verbatim —
        // sticky-memory propagation (v50-04) happens at READ time via
        // seedTrackFromSong on next ChartBindPopover use, NOT at write time.
        // Cloned tracks preserve the user's intentful per-song values
        // (key, bpm, vocal lead) from the source setlist.
        async cloneSetlist(source: Setlist, targetDate: Date): Promise<string> {
            try {
                const context = await getFullServiceContext(targetDate)
                const name = generateSetlistName(context)

                const cloneData = stripUndefinedDeep({
                    name,
                    date: Timestamp.fromDate(targetDate),
                    eventDate: Timestamp.fromDate(targetDate),
                    // v51-h01: stamp updatedAt at clone time. See createSetlist
                    // for the rationale — closes the lazy-hydration precondition
                    // race that landed Daniel's editor in 'failed' state on phone.
                    updatedAt: serverTimestamp(),
                    tracks: source.tracks.map((t, i) => ({
                        ...t,
                        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`
                    })),
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
                logger.error("Error cloning setlist:", e)
                captureSyncFailure(e, {
                    feature: 'write-atomicity',
                    site: 'cloneSetlist',
                    op: 'create',
                    collection: COLLECTION_PATH,
                    trackCount: source.tracks?.length ?? 0,
                })
                throw e
            }
        },

        // Clone a setlist for next week: same tracks, musicians, rabbi; date +7 days; auto-name.
        // Public surface preserved (called by EmptyState's "Make next week's" CTA);
        // implementation is now a thin wrapper around cloneSetlist().
        async cloneForNextWeek(source: Setlist): Promise<string> {
            const sourceDate = toDate(source.eventDate || source.date) || new Date()
            const targetDate = new Date(sourceDate)
            targetDate.setDate(targetDate.getDate() + 7)
            // Delegate via `this` so the call participates in the same service
            // closure (logging, userId/userName binding stay consistent).
            return this.cloneSetlist(source, targetDate)
        },

        // Save a setlist as a reusable template (strips date, musicians, rabbi)
        async saveAsTemplate(source: Setlist, templateName?: string): Promise<string> {
            try {
                const templateData = stripUndefinedDeep({
                    name: templateName || `${source.name} (Template)`,
                    date: serverTimestamp(),
                    tracks: source.tracks.map((t, i) => ({
                        ...t,
                        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`
                    })),
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

    };
}
