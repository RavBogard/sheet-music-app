import { db, auth } from "./firebase"
import { doc, updateDoc, onSnapshot } from "firebase/firestore"
import { MusicianProfile } from "@/types/models"

/**
 * Save the current user's musician profile to Firestore.
 * Stored as a `musicianProfile` field on the user document.
 */
export async function saveMusicianProfile(profile: MusicianProfile): Promise<void> {
    const user = auth.currentUser
    if (!user) throw new Error("Not authenticated")
    if (!db || Object.keys(db).length === 0) throw new Error("Database not initialized")

    const ref = doc(db, "users", user.uid)
    await updateDoc(ref, { musicianProfile: profile })
}

/**
 * Subscribe to the current user's musician profile.
 * Returns an unsubscribe function.
 */
export function subscribeToMusicianProfile(
    uid: string,
    callback: (profile: MusicianProfile | null) => void
): () => void {
    if (!db || Object.keys(db).length === 0) return () => { }

    const ref = doc(db, "users", uid)
    return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            const data = snap.data()
            callback(data.musicianProfile || null)
        } else {
            callback(null)
        }
    })
}

/**
 * Common instrument presets with their default transpositions.
 * Transposition = semitones to subtract from concert pitch to get written pitch.
 * e.g., Bb Trumpet: written C sounds as Bb, so transposition = -2
 */
export const INSTRUMENT_PRESETS: Record<string, { label: string; transposition: number; description: string }> = {
    'guitar': { label: 'Guitar', transposition: 0, description: 'Concert pitch' },
    'bass': { label: 'Bass', transposition: 0, description: 'Concert pitch (octave lower)' },
    'piano': { label: 'Piano/Keys', transposition: 0, description: 'Concert pitch' },
    'voice': { label: 'Voice', transposition: 0, description: 'Concert pitch' },
    'ukulele': { label: 'Ukulele', transposition: 0, description: 'Concert pitch' },
    'bb_trumpet': { label: 'Bb Trumpet', transposition: 2, description: 'Sounds a whole step lower' },
    'bb_clarinet': { label: 'Bb Clarinet', transposition: 2, description: 'Sounds a whole step lower' },
    'bb_tenor_sax': { label: 'Bb Tenor Sax', transposition: 2, description: 'Sounds a major 9th lower' },
    'bb_soprano_sax': { label: 'Bb Soprano Sax', transposition: 2, description: 'Sounds a whole step lower' },
    'eb_alto_sax': { label: 'Eb Alto Sax', transposition: -3, description: 'Sounds a major 6th lower' },
    'eb_bari_sax': { label: 'Eb Baritone Sax', transposition: -3, description: 'Sounds an octave + major 6th lower' },
    'f_horn': { label: 'French Horn (F)', transposition: 7, description: 'Sounds a 5th lower' },
    'other': { label: 'Other', transposition: 0, description: 'Set custom transposition' },
}
