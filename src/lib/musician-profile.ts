import { getDb, auth, subscribeWithDb } from "./firebase"
import { doc, updateDoc, onSnapshot } from "firebase/firestore"
import { MusicianProfile } from "@/types/models"
import { logger } from "@/lib/logger"

/**
 * Save the current user's musician profile to Firestore.
 * Stored as a `musicianProfile` field on the user document.
 */
export async function saveMusicianProfile(profile: MusicianProfile): Promise<void> {
    const user = auth.currentUser
    if (!user) throw new Error("Not authenticated")
    const db = await getDb()
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
    return subscribeWithDb((db) => {
        if (!db || Object.keys(db).length === 0) return () => { }

        const ref = doc(db, "users", uid)
        return onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                const data = snap.data()
                callback(data.musicianProfile || null)
            } else {
                callback(null)
            }
        }, (err) => {
            logger.error("[MusicianProfile] Listener error:", err)
        })
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
 * Slug keys surfaced in onboarding / quick-setup flows.
 * Subset of INSTRUMENT_PRESETS — Settings shows the full registry.
 * Stored value at `musicianProfile.instrument` must be a slug key; the
 * dropdown shows the preset's `label`.
 */
export const ONBOARDING_INSTRUMENT_KEYS = [
    'acoustic_guitar',
    'electric_bass',
    'hand_drums',
    'piano',
    'voice',
    'electric_guitar',
    'bb_trumpet',
    'eb_alto_sax',
    'bb_clarinet',
    'violin',
    'other',
] as const

const PRINT_ROSTER_ROLES = new Set(["musician", "band_leader", "admin"])

/**
 * The host tenant's musicians who have a musician profile set up.
 * Used by the "Print for..." feature in the gig packet generator.
 *
 * Multi-tenant phase 2: read through GET /api/tenant/people (band leaders and
 * up). Anyone below that gets an empty list, exactly as the old `users`
 * listener was refused for them; the modal already handles an empty roster.
 */
export async function fetchTenantMusicianProfiles(): Promise<
    { uid: string; displayName: string; profile: MusicianProfile }[]
> {
    try {
        const { fetchTenantPeople } = await import("@/lib/users-firebase")
        const { people } = await fetchTenantPeople()
        return people
            .filter((p) => PRINT_ROSTER_ROLES.has(p.role))
            .map((p) => ({
                uid: p.uid,
                displayName: p.displayName || "Unknown",
                profile: p.musicianProfile as unknown as MusicianProfile | undefined,
            }))
            .filter((m): m is { uid: string; displayName: string; profile: MusicianProfile } =>
                !!m.profile && !!m.profile.instrument
            )
    } catch (err) {
        logger.warn("[MusicianProfile] Roster read failed:", err)
        return []
    }
}
