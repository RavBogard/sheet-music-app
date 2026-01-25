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
    where
} from "firebase/firestore";

export interface SetlistTrack {
    id: string
    title: string
    fileId?: string
    key?: string
    notes?: string
}

export interface Setlist {
    id: string
    name: string
    date: Timestamp
    tracks: SetlistTrack[]
    trackCount: number
    // New fields for public/private
    isPublic?: boolean
    ownerId?: string
    ownerName?: string
}

// User-specific setlist service (for personal setlists)
export function createSetlistService(userId: string, userName?: string | null) {
    const PERSONAL_PATH = `users/${userId}/setlists`;
    const PUBLIC_PATH = `publicSetlists`;

    return {
        // ===== PERSONAL SETLISTS =====

        async createSetlist(name: string, tracks: SetlistTrack[], isPublic: boolean = false) {
            const collectionPath = isPublic ? PUBLIC_PATH : PERSONAL_PATH;
            try {
                const docRef = await addDoc(collection(db, collectionPath), {
                    name,
                    date: serverTimestamp(),
                    tracks,
                    trackCount: tracks.length,
                    isPublic,
                    ownerId: userId,
                    ownerName: userName || "Anonymous"
                });
                return docRef.id;
            } catch (e) {
                console.error("Error creating setlist: ", e);
                throw e;
            }
        },

        // Subscribe to user's personal setlists
        subscribeToPersonalSetlists(callback: (setlists: Setlist[]) => void) {
            const q = query(collection(db, PERSONAL_PATH), orderBy("date", "desc"));
            return onSnapshot(q, (snapshot) => {
                const setlists = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    isPublic: false
                })) as Setlist[];
                callback(setlists);
            });
        },

        // Subscribe to a single personal setlist
        subscribeToSetlist(id: string, isPublic: boolean, callback: (setlist: Setlist | null) => void) {
            const collectionPath = isPublic ? PUBLIC_PATH : PERSONAL_PATH;
            const docRef = doc(db, collectionPath, id);
            return onSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    callback({ id: doc.id, ...doc.data() } as Setlist);
                } else {
                    callback(null);
                }
            });
        },

        // Update a setlist (only works if user owns it)
        async updateSetlist(id: string, isPublic: boolean, data: Partial<Setlist>) {
            const collectionPath = isPublic ? PUBLIC_PATH : PERSONAL_PATH;
            const docRef = doc(db, collectionPath, id);
            await updateDoc(docRef, data);
        },

        // Delete a setlist
        async deleteSetlist(id: string, isPublic: boolean) {
            const collectionPath = isPublic ? PUBLIC_PATH : PERSONAL_PATH;
            await deleteDoc(doc(db, collectionPath, id));
        },

        // ===== PUBLIC SETLISTS =====

        // Subscribe to ALL public setlists
        subscribeToPublicSetlists(callback: (setlists: Setlist[]) => void) {
            const q = query(collection(db, PUBLIC_PATH), orderBy("date", "desc"));
            return onSnapshot(q, (snapshot) => {
                const setlists = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    isPublic: true
                })) as Setlist[];
                callback(setlists);
            });
        },

        // Copy a public setlist to personal collection
        async copyToPersonal(publicSetlistId: string, setlistData: Setlist) {
            try {
                const docRef = await addDoc(collection(db, PERSONAL_PATH), {
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
        }
    };
}

// Legacy global service (deprecated)
export const SetlistService = {
    async createSetlist(name: string, tracks: SetlistTrack[]) {
        console.warn("Using global SetlistService - setlists won't be user-specific");
        const docRef = await addDoc(collection(db, "setlists"), {
            name,
            date: serverTimestamp(),
            tracks,
            trackCount: tracks.length
        });
        return docRef.id;
    },
    subscribeToSetlists(callback: (setlists: Setlist[]) => void) {
        const q = query(collection(db, "setlists"), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const setlists = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Setlist[];
            callback(setlists);
        });
    },
    subscribeToSetlist(id: string, callback: (setlist: Setlist | null) => void) {
        const docRef = doc(db, "setlists", id);
        return onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                callback({ id: doc.id, ...doc.data() } as Setlist);
            } else {
                callback(null);
            }
        });
    },
    async updateSetlist(id: string, data: Partial<Setlist>) {
        const docRef = doc(db, "setlists", id);
        await updateDoc(docRef, data);
    },
    async deleteSetlist(id: string) {
        await deleteDoc(doc(db, "setlists", id));
    }
};
