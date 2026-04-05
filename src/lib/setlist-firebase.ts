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
    writeBatch
} from "firebase/firestore";

import { SetlistTrack } from "@/types/api"
import { logSetlistChange } from "@/lib/setlist-audit"
import { setlistConverter } from "@/types/schemas"

// export interface SetlistTrack { ... } // Removed local definition
export type { SetlistTrack }

import { Setlist } from "@/types/api"
import { logger } from "@/lib/logger"
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
        async createSetlist(name: string, tracks: SetlistTrack[], isPublic: boolean = true, additionalData: Partial<Setlist> = {}) {
            try {
                // Sanitize tracks: Firebase rejects undefined values
                const cleanTracks = stripUndefinedDeep(tracks) as SetlistTrack[]
                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name,
                    date: serverTimestamp(),
                    tracks: cleanTracks,
                    trackCount: tracks.length,
                    isPublic,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    ...stripUndefined(additionalData as Record<string, unknown>)
                });
                logSetlistChange(docRef.id, 'created', userId || '', userName || 'Anonymous', { name, trackCount: tracks.length, isPublic })
                return docRef.id;
            } catch (e) {
                logger.error("Error creating setlist: ", e);
                throw e;
            }
        },
        // Subscribe to a single setlist by ID
        subscribeToSetlist(id: string, _isPublic: boolean, callback: (setlist: Setlist | null) => void) {
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

        // Update a setlist (sanitize undefined → null for Firestore)
        async updateSetlist(id: string, _isPublic: boolean, data: Partial<Setlist>) {
            const docRef = doc(db, COLLECTION_PATH, id);
            const cleanData = stripUndefined(data as Record<string, unknown>);
            cleanData.updatedAt = serverTimestamp();
            await updateDoc(docRef, cleanData);

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

        async deleteSetlist(id: string, _isPublic: boolean) {
            try {
                // Delete the setlist document — this is the critical operation.
                await deleteDoc(doc(db, COLLECTION_PATH, id))

                // Best-effort cleanup of associated tasks.
                // Tasks use `allow write: if false` in Firestore rules (server-only),
                // so client-side deletion will fail. Orphaned tasks are harmless
                // (they reference a non-existent setlist and won't render).
                try {
                    const tasksQuery = query(collection(db, 'tasks'), where('setlistId', '==', id))
                    const taskSnap = await getDocs(tasksQuery)
                    if (taskSnap.size > 0) {
                        const batch = writeBatch(db)
                        taskSnap.docs.forEach(taskDoc => batch.delete(taskDoc.ref))
                        await batch.commit()
                    }
                } catch {
                    // Expected in most cases — rules block client-side task writes
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
                    isPublic: true,
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
                    isPublic: true,
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
                    isPublic: true,
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

        // Make a personal setlist public (UPDATE field)
        async makePublic(setlistId: string) {
            try {
                const docRef = doc(db, COLLECTION_PATH, setlistId);
                await updateDoc(docRef, {
                    isPublic: true,
                    updatedAt: serverTimestamp(),
                    ownerName: userName || "Anonymous" // Update name in case it changed
                });
                logSetlistChange(setlistId, 'made_public', userId || '', userName || 'Anonymous')

                // Note: Publish notifications are handled server-side via /api/setlist/publish

                return setlistId;
            } catch (e) {
                logger.error("Error making setlist public: ", e);
                throw e;
            }
        },

        // Make a public setlist private (UPDATE field)
        async makePrivate(setlistId: string) {
            try {
                const docRef = doc(db, COLLECTION_PATH, setlistId);
                await updateDoc(docRef, {
                    isPublic: false
                });
                logSetlistChange(setlistId, 'made_private', userId || '', userName || 'Anonymous')
                return setlistId;
            } catch (e) {
                logger.error("Error making setlist private: ", e);
                throw e;
            }
        }
    };
}
