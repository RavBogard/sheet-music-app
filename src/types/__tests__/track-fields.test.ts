import { describe, it, expect } from "vitest"
import { TRACK_FIELDS, type TrackFieldName } from "@/types/track-fields"

/**
 * Each entry describes one hand-maintained projection of SetlistTrack.
 * `forwarded` = fields the projection carries through.
 * `intentionallyDropped` = fields it deliberately omits, each with a reason.
 *
 * The assertion is coverage, not correctness of intent: every censused field
 * must appear in exactly one of the two lists. When SetlistTrack grows a
 * field, this test fails until someone makes a decision about it here.
 */
interface Projection {
    name: string
    forwarded: readonly TrackFieldName[]
    intentionallyDropped: Readonly<Record<string, string>>
}

const PROJECTIONS: Projection[] = [
    {
        // src/lib/queue-utils.ts:46-59 — toQueueItem's returned object literal.
        name: "toQueueItem",
        forwarded: [
            "title", // renamed to QueueItem.name
            "fileId", // or synthesized `flow-${index}` for non-song rows
            "audioFileId",
            "transposition",
            "key",
            "tune",
            "bpm",
            "type", // renamed to QueueItem.trackType
            "performer",
            "description",
            "estimatedMinutes",
        ],
        intentionallyDropped: {
            id: "Internal Firestore document id; QueueItem addresses tracks by array position and fileId, not the source doc id.",
            orgId: "Tenant-scope identifier for Firestore rules; irrelevant to the client-side performance queue.",
            fileName:
                "Consumed only inside toQueueItem's file-type detection closure as an extension-fallback signal; the raw string is not stored on QueueItem, which has no fileName field.",
            mimeType:
                "Consumed only inside toQueueItem's file-type detection closure to pick QueueItem.type; the raw string is not stored on QueueItem, which has no mimeType field.",
            audioFileName:
                "Cached display name for the audio file; QueueItem carries audioFileId only, no display name is rendered for the audio track.",
            notes: "QueueItem drives the PDF chart-navigation overlay, which renders no outline metadata",
            referenceLink:
                "External YouTube/Spotify reference link; not relevant to on-stage chart/queue navigation.",
            duration:
                "Free-text song-length string ('3:30'); QueueItem has no field for it and playback progress comes from the audio element, not this string.",
            leadMusician: "QueueItem drives the PDF chart-navigation overlay, which renders no outline metadata",
            pageNumber:
                "toQueueItem never reads track.pageNumber; QueueItem has no field for it and multi-page navigation is handled by the PDF viewer directly from the track record.",
            unmatched:
                "Template-expansion UI badge only; not needed once a track has settled into the performance queue.",
            liturgyRef: "QueueItem drives the PDF chart-navigation overlay, which renders no outline metadata",
            honors: "QueueItem drives the PDF chart-navigation overlay, which renders no outline metadata",
        },
    },
    {
        // src/lib/print-pipeline.ts:26-48 — the PrintTrack interface members.
        name: "PrintTrack",
        forwarded: [
            "title",
            "key",
            "notes",
            "leadMusician",
            "fileId",
            "fileName",
            "mimeType",
            "transposition",
            "type",
            "performer",
            "estimatedMinutes",
            "description",
        ],
        intentionallyDropped: {
            id: "Internal Firestore document id; the print pipeline addresses tracks by fileId, not the source doc id.",
            orgId: "Tenant-scope identifier for Firestore rules; irrelevant to PDF rendering.",
            audioFileId: "Print pipeline renders paper charts only; it has no notion of the linked audio file.",
            audioFileName: "Print pipeline renders paper charts only; it has no notion of the linked audio file.",
            tune: "PrintTrack has no field for it and print-pipeline.ts never reads track.tune.",
            referenceLink: "External YouTube/Spotify reference link; not printed on the chart page.",
            duration: "Free-text song-length string; not printed on the chart page and PrintTrack has no field for it.",
            bpm: "PrintTrack has no field for it and print-pipeline.ts never reads track.bpm; tempo is not printed on the chart.",
            pageNumber:
                "PrintTrack has no field for it; print-pipeline.ts never reads track.pageNumber, so multi-page targeting is not applied when printing.",
            unmatched: "Template-expansion UI badge only; irrelevant to a track that has an actual chart to print.",
            liturgyRef: "not yet plumbed; Task 3 of this plan forwards them",
            honors: "not yet plumbed; Task 3 of this plan forwards them",
        },
    },
]

describe("SetlistTrack projections", () => {
    it("censuses at least the outline fields", () => {
        for (const f of ["liturgyRef", "honors", "performer", "description", "estimatedMinutes"]) {
            expect(TRACK_FIELDS).toContain(f)
        }
    })

    it.each(PROJECTIONS)("$name accounts for every censused field", (p) => {
        const dropped = Object.keys(p.intentionallyDropped)
        const accounted = new Set<string>([...p.forwarded, ...dropped])

        const unaccounted = TRACK_FIELDS.filter((f) => !accounted.has(f))
        expect(unaccounted, `${p.name} neither forwards nor declares-dropped these fields`).toEqual([])

        const overlap = p.forwarded.filter((f) => dropped.includes(f))
        expect(overlap, `${p.name} lists these as both forwarded and dropped`).toEqual([])

        for (const [field, reason] of Object.entries(p.intentionallyDropped)) {
            expect(reason.length, `${p.name}.${field} needs a real reason`).toBeGreaterThan(10)
        }
    })
})
