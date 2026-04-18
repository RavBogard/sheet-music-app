/**
 * Write-boundary zod schemas for POST /api/setlist/flush.
 *
 * Next.js route files may only export HTTP method handlers, so these
 * strict schemas live here and are imported by the route. They are also
 * exported for regression testing (see v4.3 D02).
 *
 * Read-path schemas in src/types/schemas.ts intentionally keep
 * .passthrough() so converters tolerate legacy / evolving Firestore
 * docs. These are DIFFERENT — they run on untrusted client input.
 */
import { z } from "zod"

/** Clients may only submit these fields on a musician. */
export const flushMusicianSchema = z.object({
    uid: z.string().optional(),
    name: z.string(),
    email: z.string().optional(),
    instrument: z.string().nullable().optional(),
}).strict()

/** Clients may only submit these fields on a track. Mirrors SetlistTrack. */
export const flushTrackSchema = z.object({
    id: z.string(),
    title: z.string(),
    fileId: z.string().nullable().optional(),
    fileName: z.string().nullable().optional(),
    audioFileId: z.string().nullable().optional(),
    audioFileName: z.string().nullable().optional(),
    key: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    referenceLink: z.string().nullable().optional(),
    type: z.enum(['song', 'header', 'reading', 'prayer', 'transition', 'note']).optional(),
    duration: z.string().nullable().optional(),
    bpm: z.number().nullable().optional(),
    leadMusician: z.string().nullable().optional(),
    transposition: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    performer: z.string().nullable().optional(),
    estimatedMinutes: z.number().nullable().optional(),
    tune: z.string().nullable().optional(),
    pageNumber: z.number().nullable().optional(),
}).strict()
