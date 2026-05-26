/**
 * Per-song transposition preferences.
 * 
 * Stores each musician's preferred transposition for individual songs.
 * When a musician always plays "Modeh Ani" in D shapes (capo 2), 
 * this remembers that and auto-applies it every time they load the song.
 * 
 * Firestore path: users/{uid}/songPreferences/{fileId}
 * 
 * Priority chain for transposition:
 *   1. Per-track setlist setting (leader chose for everyone)
 *   2. User's saved song preference (this file)
 *   3. Musician profile instrument default (e.g., Bb trumpet = -2)
 *   4. Zero (original key)
 */

import { doc, getDoc, setDoc } from "firebase/firestore"
import { getDb } from "./firebase"

export interface SongPreference {
    transposition: number
    updatedAt: string
}

/**
 * Save a transposition preference for a specific song.
 */
export async function saveSongPreference(
    uid: string,
    fileId: string,
    transposition: number
): Promise<void> {
    const db = await getDb()
    const ref = doc(db, "users", uid, "songPreferences", fileId)

    await setDoc(ref, {
        transposition,
        updatedAt: new Date().toISOString(),
    }, { merge: true })
}

/**
 * Load a transposition preference for a specific song.
 * Returns null if no preference has been saved.
 */
export async function loadSongPreference(
    uid: string,
    fileId: string
): Promise<SongPreference | null> {
    const db = await getDb()
    const ref = doc(db, "users", uid, "songPreferences", fileId)

    const snap = await getDoc(ref)
    if (!snap.exists()) return null

    const data = snap.data()
    return {
        transposition: data.transposition ?? 0,
        updatedAt: data.updatedAt ?? "",
    }
}
