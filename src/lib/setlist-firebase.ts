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
    getDoc
} from "firebase/firestore";

import { SetlistTrack } from "@/types/api"

// export interface SetlistTrack { ... } // Removed local definition
export type { SetlistTrack }

import { Setlist } from "@/types/api"
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
                    ownerName: userName || "Anonymous",
                    ...JSON.parse(JSON.stringify(additionalData)) // Sanitize undefined
                });
                return docRef.id;
            } catch (e) {
                console.error("Error creating setlist: ", e);
                throw e;
            }
        },

        // Subscribe to user's personal setlists (FILTERED)
        subscribeToPersonalSetlists(callback: (setlists: Setlist[]) => void, onError?: (error: Error) => void) {
            // Query: ownerId == userId AND isPublic == false
            // Note: We might want valid indexes for this. For now client-side filtering can work if dataset is small,
            // but server-side filtering is better.

            // Simpler query: Just get all owned by user.
            // Then let the UI separate them? 
            // Or explicit query:
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
                    callback(setlists);
                },
                error: (error) => {
                    console.error("Error subscribing to personal setlists:", error);
                    if (onError) onError(error);
                }
            });
        },

        // Subscribe to a single setlist (ANY)
        subscribeToSetlist(id: string, isPublic: boolean, callback: (setlist: Setlist | null) => void) {
            const docRef = doc(db, COLLECTION_PATH, id);
            return onSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    callback({ id: doc.id, ...doc.data() } as Setlist);
                } else {
                    callback(null);
                }
            });
        },

        // Update a setlist
        async updateSetlist(id: string, isPublic: boolean, data: Partial<Setlist>) {
            const docRef = doc(db, COLLECTION_PATH, id);
            // Sanitize data -> remove undefined, or convert to null? Firestore prefers DELETEField for removal, or just ignore.
            // But if we want to CLEAR a field, we send null.
            // Typically we want to convert undefined to null to avoid crashes.
            const cleanData = JSON.parse(JSON.stringify(data));
            await updateDoc(docRef, cleanData);
        },

        // Delete a setlist
        async deleteSetlist(id: string, isPublic: boolean) {
            await deleteDoc(doc(db, COLLECTION_PATH, id));
        },

        // ===== PUBLIC SETLISTS =====

        // Subscribe to ALL public setlists
        subscribeToPublicSetlists(callback: (setlists: Setlist[]) => void, onError?: (error: Error) => void) {
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
                    callback(setlists);
                },
                error: (error) => {
                    console.error("Error subscribing to public setlists:", error)
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
                console.error("Error copying setlist: ", e);
                throw e;
            }
        },

        // Make a personal setlist public (UPDATE field)
        async makePublic(setlistId: string, setlistData: Setlist) {
            try {
                const docRef = doc(db, COLLECTION_PATH, setlistId);
                await updateDoc(docRef, {
                    isPublic: true,
                    ownerName: userName || "Anonymous" // Update name in case it changed
                });
                return setlistId;
            } catch (e) {
                console.error("Error making setlist public: ", e);
                throw e;
            }
        },

        // Make a public setlist private (UPDATE field)
        async makePrivate(setlistId: string, setlistData: Setlist) {
            try {
                const docRef = doc(db, COLLECTION_PATH, setlistId);
                await updateDoc(docRef, {
                    isPublic: false
                });
                return setlistId;
            } catch (e) {
                console.error("Error making setlist private: ", e);
                throw e;
            }
        }
    };
}
