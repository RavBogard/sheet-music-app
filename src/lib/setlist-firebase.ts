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
    Timestamp
} from "firebase/firestore";

export interface SetlistTrack {
    id: string
    originalTitle: string
    matchedFileId?: string
    customTitle?: string
    notes?: string
    key?: string
}

export interface Setlist {
    id: string
    name: string
    date: Timestamp
    tracks: SetlistTrack[]
    trackCount: number
}

const COLLECTION_NAME = "setlists";

export const SetlistService = {
    // 1. Create a new setlist from a list of songs
    async createSetlist(name: string, tracks: SetlistTrack[]) {
        try {
            const docRef = await addDoc(collection(db, COLLECTION_NAME), {
                name,
                date: serverTimestamp(),
                tracks,
                trackCount: tracks.length
            });
            return docRef.id;
        } catch (e) {
            console.error("Error creating setlist: ", e);
            throw e;
        }
    },

    // 2. Subscribe to ALL setlists (Real-time Dashboard)
    subscribeToSetlists(callback: (setlists: Setlist[]) => void) {
        const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const setlists = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Setlist[];
            callback(setlists);
        });
    },

    // 3. Subscribe to a SINGLE setlist (Real-time Editor)
    subscribeToSetlist(id: string, callback: (setlist: Setlist | null) => void) {
        const docRef = doc(db, COLLECTION_NAME, id);
        return onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                callback({ id: doc.id, ...doc.data() } as Setlist);
            } else {
                callback(null);
            }
        });
    },

    // 4. Update a setlist (Rename, Reorder, Change Tracks)
    async updateSetlist(id: string, data: Partial<Setlist>) {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, data);
    },

    // 5. Delete a setlist
    async deleteSetlist(id: string) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
