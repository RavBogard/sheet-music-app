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
    serverTimestamp,
    Timestamp,
    where,
} from "firebase/firestore";

import { SetlistTrack } from "@/types/api"
import { logSetlistChange } from "@/lib/setlist-audit"

// export interface SetlistTrack { ... } // Removed local definition
export type { SetlistTrack }

import { Setlist } from "@/types/api"
import { logger } from "@/lib/logger"
import { toDate } from "@/lib/firestore-helpers"
import { getFullServiceContext } from "@/lib/liturgical-calendar"
import { generateSetlistName } from "@/lib/liturgical-templates"
export type { Setlist }

// User-specific setlist service
export function createSetlistService(userId: string | null, userName?: string | null) {
    const COLLECTION_PATH = 'setlists';

    return {
        // ===== PERSONAL SETLISTS =====

        async createSetlist(name: string, tracks: SetlistTrack[], isPublic: boolean = false, additionalData: Partial<Setlist> = {}) {
            try {
                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name,
                    date: serverTimestamp(),
                    tracks,
                    trackCount: tracks.length,
                    isPublic,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    ...JSON.parse(JSON.stringify(additionalData)) // Sanitize undefined
                });
                logSetlistChange(docRef.id, 'created', userId || '', userName || 'Anonymous', { name, trackCount: tracks.length, isPublic })
                return docRef.id;
            } catch (e) {
                logger.error("Error creating setlist: ", e);
                throw e;
            }
        },
        subscribeToPersonalSetlists(callback: (setlists: Setlist[], fromCache: boolean) => void, onError?: (error: Error) => void) {
            const q = query(
                collection(db, COLLECTION_PATH),
                where("ownerId", "==", userId),
                // where("isPublic", "==", false), // Removed to include ALL my setlists (public or private)
                orderBy("date", "desc")
            );

            return onSnapshot(q, {
                next: (snapshot) => {
                    const setlists = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as Setlist[];
                    callback(setlists, snapshot.metadata.fromCache);
                },
                error: (error) => {
                    logger.error("Error subscribing to personal setlists:", error);
                    if (onError) onError(error);
                }
            });
        },

        // Subscribe to a single setlist by ID
        subscribeToSetlist(id: string, _isPublic: boolean, callback: (setlist: Setlist | null) => void) {
            const docRef = doc(db, COLLECTION_PATH, id);
            return onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                    callback({ id: snap.id, ...snap.data() } as Setlist);
                } else {
                    callback(null);
                }
            });
        },

        // Update a setlist (sanitize undefined → null for Firestore)
        async updateSetlist(id: string, isPublic: boolean, data: Partial<Setlist>) {
            const docRef = doc(db, COLLECTION_PATH, id);
            const cleanData = JSON.parse(JSON.stringify(data));
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
            logSetlistChange(id, 'deleted', userId || '', userName || 'Anonymous')
            await deleteDoc(doc(db, COLLECTION_PATH, id));
        },

        // ===== PUBLIC SETLISTS =====

        // Subscribe to ALL public setlists
        subscribeToPublicSetlists(callback: (setlists: Setlist[], fromCache: boolean) => void, onError?: (error: Error) => void) {
            const q = query(
                collection(db, COLLECTION_PATH),
                where("isPublic", "==", true),
                orderBy("date", "desc")
            );

            return onSnapshot(q, {
                next: (snapshot) => {
                    const setlists = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as Setlist[];
                    callback(setlists, snapshot.metadata.fromCache);
                },
                error: (error) => {
                    logger.error("Error subscribing to public setlists:", error)
                    if (onError) onError(error)
                }
            });
        },

        // Copy a public setlist to personal collection
        async copyToPersonal(publicSetlistId: string, setlistData: Setlist) {
            try {
                // Just create a new doc in the SAME collection, but owned by ME and PRIVATE
                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name: `${setlistData.name} (Copy)`,
                    date: serverTimestamp(),
                    tracks: setlistData.tracks,
                    trackCount: setlistData.tracks.length,
                    isPublic: false,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    copiedFrom: publicSetlistId
                });
                return docRef.id;
            } catch (e) {
                logger.error("Error copying setlist: ", e);
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

                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name,
                    date: Timestamp.fromDate(targetDate),
                    eventDate: Timestamp.fromDate(targetDate),
                    tracks: source.tracks,
                    trackCount: source.tracks.length,
                    isPublic: false,
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                    musicians: source.musicians || [],
                    rabbi: source.rabbi || '',
                    clonedFrom: source.id,
                })

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
                const docRef = await addDoc(collection(db, COLLECTION_PATH), {
                    name: templateName || `${source.name} (Template)`,
                    date: serverTimestamp(),
                    tracks: source.tracks,
                    trackCount: source.tracks.length,
                    isPublic: false,
                    isTemplate: true,
                    templateType: 'other',
                    ownerId: userId,
                    ownerName: userName || "Anonymous",
                })

                logSetlistChange(docRef.id, 'saved_as_template', userId || '', userName || 'Anonymous')
                return docRef.id
            } catch (e) {
                logger.error("Error saving as template:", e)
                throw e
            }
        },

        // Make a personal setlist public (UPDATE field)
        async makePublic(setlistId: string, _setlistData: Setlist) {
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
        async makePrivate(setlistId: string, _setlistData: Setlist) {
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
