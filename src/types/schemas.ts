import { z } from "zod"
import { DocumentData, QueryDocumentSnapshot, SnapshotOptions } from "firebase/firestore"
import { logger } from "@/lib/logger"
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

const userRoleSchema = z.enum(['admin', 'band_leader', 'musician', 'member', 'pending', 'denied']).catch('member')

export const schedulingTierSchema = z.enum(['core', 'regular', 'guest']).catch('regular')
export const assignmentStatusSchema = z.enum(['pending', 'confirmed', 'declined', 'cancelled']).catch('pending')

export const notificationPreferencesSchema = z.object({
    email: z.boolean().catch(true),
    sms: z.boolean().catch(false),
    push: z.boolean().catch(true),
}).passthrough()

export const musicianProfileSchema = z.object({
    instrument: z.string().nullish().catch(undefined).transform(v => v || undefined),
    defaultTransposition: z.number().nullish().catch(undefined).transform(v => v ?? undefined),
    preferCapo: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    preferredCapoFret: z.number().nullish().catch(undefined).transform(v => v ?? undefined),
    preferFlats: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    // Scheduling fields
    phone: z.string().nullish().catch(undefined).transform(v => v || undefined),
    schedulingTier: schedulingTierSchema.nullish().catch(undefined).transform(v => v || undefined),
    calendarFeedToken: z.string().nullish().catch(undefined).transform(v => v || undefined),
    notificationPreferences: notificationPreferencesSchema.nullish().catch(undefined).transform(v => v || undefined),
}).passthrough() // Allow other fields for future-proofing

export const userProfileSchema = z.object({
    uid: z.string().catch(""),
    email: z.string().email().catch(""),
    displayName: z.string().catch("Unknown User"),
    photoURL: z.string().nullish().catch(undefined).transform(v => v || undefined),
    viewedWelcomeModal: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    role: userRoleSchema,
    soundEngineer: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    canLiveSwap: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    createdAt: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    lastLoginAt: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    claimsUpdatedAt: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    musicianProfile: musicianProfileSchema.nullish().catch(undefined).transform(v => v || undefined),
}).passthrough()

// --- Setlist Schema ---

export const trackTypeSchema = z.enum(['song', 'header', 'reading', 'prayer', 'transition', 'note']).catch('song')

export const setlistTrackSchema = z.preprocess(
    (val: any) => {
        if (typeof val === 'object' && val !== null) {
            // Map legacy 'name' to 'title' if title is missing
            if (!val.title && val.name) val.title = val.name;
            if (!val.id) val.id = `legacy-${crypto.randomUUID().slice(0, 9)}`;
        }
        return val;
    },
    z.object({
        id: z.string().catch(() => `legacy-${crypto.randomUUID().slice(0, 9)}`),
        title: z.string().catch("Untitled Track"),
        fileId: z.string().nullish().catch(undefined).transform(v => v || undefined),
        fileName: z.string().nullish().catch(undefined).transform(v => v || undefined),
        audioFileId: z.string().nullish().catch(undefined).transform(v => v || undefined),
        audioFileName: z.string().nullish().catch(undefined).transform(v => v || undefined),
        key: z.string().nullish().catch(undefined).transform(v => v || undefined),
        notes: z.string().nullish().catch(undefined).transform(v => v || undefined),
        referenceLink: z.string().nullish().catch(undefined).transform(v => v || undefined),
        type: trackTypeSchema,
        duration: z.string().nullish().catch(undefined).transform(v => v || undefined),
        bpm: z.number().nullish().catch(undefined).transform(v => v ?? undefined),
        leadMusician: z.string().nullish().catch(undefined).transform(v => v || undefined),
        transposition: z.number().nullish().catch(undefined).transform(v => v ?? undefined),
        description: z.string().nullish().catch(undefined).transform(v => v || undefined),
        performer: z.string().nullish().catch(undefined).transform(v => v || undefined),
        estimatedMinutes: z.number().nullish().catch(undefined).transform(v => v ?? undefined),
        liturgicalSlot: z.string().nullish().catch(undefined).transform(v => v || undefined),
    }).passthrough()
)

export const setlistMusicianSchema = z.object({
    uid: z.string().nullish().catch(undefined).transform(v => v || undefined),
    name: z.string().catch("Unknown"),
    email: z.string().catch(""), // Accept invalid emails seamlessly
    instrument: z.string().nullish().catch(undefined).transform(v => v || undefined),
}).passthrough()

export const setlistSchema = z.object({
    id: z.string().catch(""),
    name: z.string().catch("Unnamed Setlist"),
    date: firestoreTimestampSchema.catch(() => new Date()),
    eventDate: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    updatedAt: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    tracks: z.array(setlistTrackSchema).catch([]).default([]),
    trackCount: z.number().catch(0).default(0),
    isPublic: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    ownerId: z.string().nullish().catch(undefined).transform(v => v || undefined),
    ownerName: z.string().nullish().catch(undefined).transform(v => v || undefined),
    rabbi: z.string().nullish().catch(undefined).transform(v => v || undefined),
    serviceNotes: z.string().nullish().catch(undefined).transform(v => v || undefined),
    musicians: z.array(setlistMusicianSchema).nullish().catch(undefined).transform(v => v || undefined),
    isTemplate: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    templateType: z.enum(['shabbat_morning', 'friday_night', 'rosh_hashanah', 'yom_kippur', 'festival', 'other']).nullish().catch(undefined).transform(v => v || undefined),
    transferredAt: z.string().nullish().catch(undefined).transform(v => v || undefined),
    previousOwnerId: z.string().nullish().catch(undefined).transform(v => v || undefined),
}).passthrough()

// --- Scheduling Schemas ---

export const schedulingAssignmentSchema = z.object({
    id: z.string().catch(""),
    setlistId: z.string(),
    setlistName: z.string().catch("Unknown Service"),
    eventDate: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || null),
    serviceType: z.string().nullish().catch(undefined).transform(v => v || undefined),
    musicianUid: z.string(),
    musicianName: z.string().catch("Unknown"),
    musicianEmail: z.string().catch(""),
    musicianPhone: z.string().nullish().catch(undefined).transform(v => v || undefined),
    instrument: z.string().nullish().catch(undefined).transform(v => v || undefined),
    status: assignmentStatusSchema,
    autoConfirmed: z.boolean().catch(false),
    respondedAt: firestoreTimestampSchema.nullish().catch(undefined).transform(v => v || undefined),
    declineReason: z.string().nullish().catch(undefined).transform(v => v || undefined),
    assignedBy: z.string().catch(""),
    assignedByName: z.string().catch("Unknown"),
    assignedAt: firestoreTimestampSchema.catch(() => new Date()),
    notifiedVia: z.array(z.enum(['email', 'sms', 'push', 'in_app'])).nullish().catch(undefined).transform(v => v || undefined),
}).passthrough()

export const musicianBlockoutSchema = z.object({
    id: z.string().catch(""),
    musicianUid: z.string(),
    startDate: z.string(), // 'YYYY-MM-DD'
    endDate: z.string(),   // 'YYYY-MM-DD'
    reason: z.string().nullish().catch(undefined).transform(v => v || undefined),
    recurring: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
    createdAt: firestoreTimestampSchema.catch(() => new Date()),
}).passthrough()

export const rabbiProfileSchema = z.object({
    name: z.string(),
    musicalRole: z.enum(['band_leader', 'strummer', 'non_musical']).catch('non_musical'),
    instruments: z.array(z.string()).nullish().catch(undefined).transform(v => v || undefined),
    bandSizeGuidance: z.string().catch(""),
    notes: z.string().nullish().catch(undefined).transform(v => v || undefined),
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
            // Include both id and uid (for User Profiles) natively from the document key
            const parsed = schema.parse({ id: snapshot.id, uid: snapshot.id, ...data })
            return parsed
        } catch (error) {
            logger.error(`[Zod] Validation failed for document ${snapshot.id}:`, error)
            // Return null to signify a corrupted document.
            return null
        }
    }
})

// Export ready-to-use converters
export const setlistConverter = createZodConverter(setlistSchema)
export const userProfileConverter = createZodConverter(userProfileSchema)
