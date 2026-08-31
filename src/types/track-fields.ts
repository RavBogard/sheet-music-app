import type { SetlistTrack } from "@/types/models"

/**
 * Runtime census of every field on `SetlistTrack`.
 *
 * WHY THIS EXISTS: several modules project a SetlistTrack into a narrower
 * shape by hand-listing fields — queue-utils' `toQueueItem`, print-pipeline's
 * `PrintTrack`, print-generation's `PrintTrackPayload`, PrintModal's payload
 * builder, the two `/api/setlist/print/{personal,public}` route maps, and the
 * MCP read/write allowlists.
 * Each is a place where adding a field to SetlistTrack silently does nothing.
 * That failure mode has shipped repeatedly — `pageNumber` was inert for months,
 * and the gig-packet path dropped `liturgyRef` from the day it was added.
 *
 * The assertion below turns "field added, projection not updated" from a
 * silent runtime drop into a compile error that names the missing field.
 *
 * WHEN YOU ADD A FIELD TO SetlistTrack: add its name here, then run the
 * projection test — it will tell you which projections must decide whether
 * to forward the field or declare it intentionally dropped.
 */
export const TRACK_FIELDS = [
    "id",
    "orgId",
    "title",
    "fileId",
    "fileName",
    "mimeType",
    "audioFileId",
    "audioFileName",
    "key",
    "tune",
    "notes",
    "referenceLink",
    "type",
    "duration",
    "bpm",
    "leadMusician",
    "transposition",
    "description",
    "performer",
    "estimatedMinutes",
    "pageNumber",
    "unmatched",
    "liturgyRef",
    "honors",
] as const

export type TrackFieldName = (typeof TRACK_FIELDS)[number]

/**
 * Compile-time exhaustiveness. If a key of SetlistTrack is missing from
 * TRACK_FIELDS, `Unregistered` is not `never` and this assignment fails —
 * and the TypeScript error text names the missing keys.
 */
type Unregistered = Exclude<keyof SetlistTrack, TrackFieldName>
const _exhaustive: [Unregistered] extends [never]
    ? true
    : { ERROR: "Unregistered SetlistTrack fields"; missing: Unregistered } = true
void _exhaustive
