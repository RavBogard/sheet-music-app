import { z } from "zod"
import { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore"
import { Setlist, SetlistTrack, UserProfile, UserRole } from "./models"

// Reusable date schema (Firebase Timestamps can be complex, so we accept 'any' and parse later, or define strictly)
// In Firebase, Timestamps have { seconds, nanoseconds }
const firestoreTimestampSchema = z.custom<any>((val: any) => {
    if (!val) return false
    if (val instanceof Date) return true
    if (typeof val?.seconds === 'number' && typeof val?.nanoseconds === 'number') return true
    if (typeof val === 'string') return true // Sometimes cast to string in app
    return false
}, "Invalid Firestore Timestamp")

// --- User Profile Schema ---

const userRoleSchema = z.enum(['admin', 'band_leader', 'musician', 'member', 'pending', 'denied'])

export const musicianProfileSchema = z.object({
    instrument: z.string().optional(),
    defaultTransposition: z.number().optional(),
    preferCapo: z.boolean().optional(),
    preferredCapoFret: z.number().optional(),
    preferFlats: z.boolean().optional(),
}).passthrough() // Allow other fields for future-proofing

export const userProfileSchema = z.object({
    uid: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    photoURL: z.string().optional(),
    viewedWelcomeModal: z.boolean().optional(),
    role: userRoleSchema,
    soundEngineer: z.boolean().optional(),
    createdAt: firestoreTimestampSchema.optional(),
    lastLoginAt: firestoreTimestampSchema.optional(),
    claimsUpdatedAt: firestoreTimestampSchema.optional(),
    musicianProfile: musicianProfileSchema.optional(),
}).passthrough()

// --- Setlist Schema ---

export const trackTypeSchema = z.enum(['song', 'header', 'reading', 'prayer', 'transition', 'note'])

export const setlistTrackSchema = z.object({
    id: z.string(),
    title: z.string(),
    fileId: z.string().optional(),
    fileName: z.string().optional(),
    audioFileId: z.string().optional(),
    audioFileName: z.string().optional(),
    key: z.string().optional(),
    notes: z.string().optional(),
    referenceLink: z.string().optional(),
    type: trackTypeSchema.optional(),
    duration: z.string().optional(),
    bpm: z.number().optional(),
    leadMusician: z.string().optional(),
    transposition: z.number().optional(),
    description: z.string().optional(),
    performer: z.string().optional(),
    estimatedMinutes: z.number().optional(),
}).passthrough()

export const setlistMusicianSchema = z.object({
    uid: z.string().optional(),
    name: z.string(),
    email: z.string().email().or(z.string().length(0)), // Sometimes empty string
    instrument: z.string().optional(),
}).passthrough()

export const setlistSchema = z.object({
    id: z.string(),
    name: z.string(),
    date: firestoreTimestampSchema,
    eventDate: firestoreTimestampSchema.optional(),
    updatedAt: firestoreTimestampSchema.optional(),
    tracks: z.array(setlistTrackSchema).default([]),
    trackCount: z.number().default(0),
    isPublic: z.boolean().optional(),
    ownerId: z.string().optional(),
    ownerName: z.string().optional(),
    rabbi: z.string().optional(),
    serviceNotes: z.string().optional(),
    musicians: z.array(setlistMusicianSchema).optional(),
    isTemplate: z.boolean().optional(),
    templateType: z.enum(['shabbat_morning', 'friday_night', 'rosh_hashanah', 'yom_kippur', 'festival', 'other']).optional(),
    transferredAt: z.string().optional(),
    previousOwnerId: z.string().optional(),
}).passthrough()

// --- Data Converters ---

/**
 * Creates a robust Firestore data converter using Zod for boundary validation.
 * If data in Firestore is missing critical fields or improperly formatted,
 * Zod will strip it or throw an error (which we catch and log, returning a safe default).
 */
export const createZodConverter = <T extends z.ZodTypeAny>(schema: T) => ({
    toFirestore: (data: z.infer<T>): DocumentData => {
        // We typically don't want to validate strictly on write if we are doing partial updates
        // but for full document sets, it's good practice.
        return data as DocumentData
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): z.infer<T> | null => {
        const data = snapshot.data(options)
        try {
            // Include the document ID in the parsed data (app expects this)
            const parsed = schema.parse({ id: snapshot.id, ...data })
            return parsed
        } catch (error) {
            console.error(`[Zod] Validation failed for document ${snapshot.id}:`, error)
            // Depending on strictness, we could return null or partial data.
            // For now, return null to signify a corrupted document.
            return null
        }
    }
})

// Export ready-to-use converters
export const setlistConverter = createZodConverter(setlistSchema)
export const userProfileConverter = createZodConverter(userProfileSchema)
