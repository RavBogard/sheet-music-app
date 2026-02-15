import { db, auth } from "./firebase"
import { doc, updateDoc, onSnapshot, collection } from "firebase/firestore"
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
 * Transposition = semitones to add to concert pitch to get written pitch.
 * e.g., Bb Trumpet: written C sounds as Bb, so transposition = 2
 *
 * Ordered by frequency of use at CRC, then occasional instruments.
 */
export const INSTRUMENT_PRESETS: Record<string, { label: string; transposition: number; description: string; suggestCapo?: boolean }> = {
    // ─── Core CRC Ensemble ──────────────────────────────────────
    'acoustic_guitar': { label: 'Acoustic Guitar', transposition: 0, description: 'Concert pitch', suggestCapo: true },
    'electric_bass': { label: 'Electric Bass', transposition: 0, description: 'Concert pitch (octave lower)' },
    'mandolin': { label: 'Mandolin', transposition: 0, description: 'Concert pitch' },
    'electric_guitar': { label: 'Electric Guitar', transposition: 0, description: 'Concert pitch' },
    'classical_guitar': { label: 'Classical Guitar', transposition: 0, description: 'Concert pitch' },
    'voice': { label: 'Voice / Vocal', transposition: 0, description: 'Concert pitch' },
    'hand_drums': { label: 'Hand Drums / Percussion', transposition: 0, description: 'Rhythm only — no transposition' },

    // ─── Occasional Instruments ─────────────────────────────────
    'violin': { label: 'Violin', transposition: 0, description: 'Concert pitch' },
    'eb_alto_sax': { label: 'Eb Alto Sax', transposition: -3, description: 'Sounds a major 6th lower' },
    'bb_tenor_sax': { label: 'Bb Tenor Sax', transposition: 2, description: 'Sounds a major 9th lower' },
    'bb_soprano_sax': { label: 'Bb Soprano Sax', transposition: 2, description: 'Sounds a whole step lower' },
    'bb_clarinet': { label: 'Bb Clarinet', transposition: 2, description: 'Sounds a whole step lower' },
    'bb_trumpet': { label: 'Bb Trumpet', transposition: 2, description: 'Sounds a whole step lower' },
    'f_horn': { label: 'French Horn (F)', transposition: 7, description: 'Sounds a 5th lower' },
    'trombone': { label: 'Trombone', transposition: 0, description: 'Concert pitch' },

    // ─── Other ──────────────────────────────────────────────────
    'piano': { label: 'Piano / Keys', transposition: 0, description: 'Concert pitch' },
    'ukulele': { label: 'Ukulele', transposition: 0, description: 'Concert pitch' },
    'other': { label: 'Other', transposition: 0, description: 'Set custom transposition' },
}

/**
 * Subscribe to all users who have musician profiles set up.
 * Used by the "Print for..." feature in the gig packet generator.
 */
export function subscribeToAllMusicianProfiles(
    callback: (profiles: { uid: string; displayName: string; profile: MusicianProfile }[]) => void
): () => void {
    if (!db || Object.keys(db).length === 0) return () => { }

    const q = collection(db, "users")
    return onSnapshot(q, (snap) => {
        const musicians = snap.docs
            .map(d => {
                const data = d.data()
                return {
                    uid: d.id,
                    displayName: data.displayName || 'Unknown',
                    profile: data.musicianProfile as MusicianProfile | undefined,
                }
            })
            .filter((m): m is { uid: string; displayName: string; profile: MusicianProfile } => 
                !!m.profile && !!m.profile.instrument
            )
        callback(musicians)
    })
}
