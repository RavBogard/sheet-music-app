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
            "liturgyRef", // rendered as the cover page's right-aligned `p. <n>` folio column
            "honors", // carried on PrintTrack; the cover table draws no honors cell (the rabbi's service sheet owns that lens)
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
        },
    },
    // ── The four projections BETWEEN a SetlistTrack and PrintTrack ───────────
    //
    // PrintTrack (above) is the pipeline's INPUT type. Nothing reaches it
    // except through one of the four hand-built maps below, so a field
    // censused against PrintTrack alone can still be dropped one layer
    // earlier and print as a blank cell with the suite green. That is exactly
    // how `liturgyRef` was inert on every print surface from the day it was
    // added, and how `pageNumber` was inert for months.
    //
    // They are NOT one shape: the public route omits `tune`, `fileName` and
    // `mimeType`; the personal route omits `tune`; PrintModal and
    // PrintTrackPayload carry all three. Each therefore gets its own entry,
    // derived by reading the source, not by assuming they match.
    {
        // src/lib/print-generation.ts:4-32 — the PrintTrackPayload interface
        // members. The wire shape of POST /api/setlist/print, whose zod schema
        // is `.passthrough()`, so this interface is the only thing standing
        // between the in-app modal and the pipeline.
        name: "PrintTrackPayload (src/lib/print-generation.ts)",
        forwarded: [
            "title",
            "key",
            "tune", // carried on the wire; PrintTrack has no `tune`, so the pipeline discards it
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
            "liturgyRef", // becomes the cover page's right-aligned `p. <n>` folio
            "honors",
        ],
        intentionallyDropped: {
            id: "Internal Firestore document id; the wire payload addresses tracks by array position and the pipeline by fileId.",
            orgId: "Tenant scope lives at the top of the request (PrintRequest.org, resolved once per job from the host header), never per track.",
            audioFileId: "Print renders paper charts only; the linked audio file has no printed representation.",
            audioFileName: "Print renders paper charts only; the linked audio file has no printed representation.",
            referenceLink: "External YouTube/Spotify reference link; a paper packet cannot follow a link and the cover table has no cell for one.",
            duration: "Free-text song-length string ('3:30'); the cover table prints estimatedMinutes for flow rows and nothing for songs.",
            bpm: "PrintTrack has no bpm field and print-pipeline draws no tempo cell on the cover table.",
            pageNumber: "Chart-internal page target for the PDF viewer; print-pipeline merges whole chart PDFs and never reads it.",
            unmatched: "Template-expansion UI badge only; meaningless once the track is being printed.",
        },
    },
    {
        // src/components/setlist/PrintModal.tsx — generateForMusician's
        // `tracks: tracks.map(t => ({ … }))` object literal. Assignable to
        // PrintTrackPayload, but every field there is optional, so TypeScript
        // would NOT complain if this map quietly stopped forwarding one.
        name: "PrintModal payload builder (src/components/setlist/PrintModal.tsx)",
        forwarded: [
            "title",
            "key",
            "tune",
            "notes",
            "leadMusician",
            "fileId",
            "fileName",
            "mimeType",
            // Read at state-init (`trackTranspositions[t.id] = { transposition:
            // t.transposition || 0, … }`) and emitted from that map, or from the
            // musician-profile default in the non-"just-me" print modes.
            "transposition",
            "type",
            "performer",
            "estimatedMinutes",
            "description",
            "liturgyRef",
            "honors",
        ],
        intentionallyDropped: {
            id: "Read, but only as the lookup key into trackTranspositions / trackIncludedIds; PrintTrackPayload has no id field so it is not sent.",
            orgId: "Tenant scope is resolved server-side from the x-org-id header by POST /api/setlist/print; a client-sent value is overwritten.",
            audioFileId: "Print renders paper charts only; the linked audio file has no printed representation.",
            audioFileName: "Print renders paper charts only; the linked audio file has no printed representation.",
            referenceLink: "External YouTube/Spotify reference link; nothing on the printed page can follow it.",
            duration: "Free-text song-length string; PrintTrackPayload has no field for it and the cover table prints no song duration.",
            bpm: "PrintTrackPayload has no bpm field; tempo is a screen affordance (SetlistRow), not a printed one.",
            pageNumber: "Chart-internal page target for the PDF viewer; the packet merges whole chart PDFs.",
            unmatched: "Template-expansion UI badge only; not part of the printed packet.",
        },
    },
    {
        // src/app/api/setlist/print/personal/route.ts — the
        // `tracks: tracks.map(t => ({ … }))` PrintRequest builder.
        name: "print/personal route map (src/app/api/setlist/print/personal/route.ts)",
        forwarded: [
            "title",
            "key",
            "notes",
            "leadMusician",
            "fileId",
            "fileName",
            "mimeType",
            "type",
            "performer",
            "estimatedMinutes",
            "description",
            "liturgyRef",
            "honors",
            // Summed with the caller's musicianProfile.defaultTransposition.
            "transposition",
        ],
        intentionallyDropped: {
            id: "Internal Firestore document id; PrintTrack addresses tracks by fileId.",
            orgId: "Resolved once per request from the SETLIST's orgId into PrintRequest.org (per-org print footer); a per-track copy would be redundant.",
            audioFileId: "Print renders paper charts only; the linked audio file has no printed representation.",
            audioFileName: "Print renders paper charts only; the linked audio file has no printed representation.",
            tune: "PrintTrack has no `tune` field, so forwarding it would be discarded one layer down; the cover table draws no tune cell.",
            referenceLink: "External YouTube/Spotify reference link; nothing on the printed page can follow it.",
            duration: "Free-text song-length string; PrintTrack has no field for it.",
            bpm: "PrintTrack has no bpm field and the cover table draws no tempo cell.",
            pageNumber: "Chart-internal page target for the PDF viewer; the packet merges whole chart PDFs.",
            unmatched: "Template-expansion UI badge only; irrelevant to a packet being printed from a saved setlist.",
        },
    },
    {
        // src/app/api/setlist/print/public/route.ts — the
        // `tracks: tracks.map(t => ({ … }))` PrintRequest builder. The emailed
        // / public-link packet; concert pitch, no musician profile.
        name: "print/public route map (src/app/api/setlist/print/public/route.ts)",
        forwarded: [
            "title",
            "key",
            "notes",
            "leadMusician",
            "fileId",
            "type",
            "performer",
            "estimatedMinutes",
            "description",
            "liturgyRef",
            "honors",
            "transposition", // the track's own value only; no musician profile on this surface
        ],
        intentionallyDropped: {
            id: "Internal Firestore document id; PrintTrack addresses tracks by fileId.",
            orgId: "Resolved once per request from the SETLIST's orgId into PrintRequest.org (per-org print footer); a per-track copy would be redundant.",
            fileName:
                "Not sent by this map. The pipeline's library_index.mimeType backstop (print-pipeline Step 2.5) resolves the type server-side for any track that arrives without one, so image-typed tracks still route to embedImageTrack rather than falling through the PDF-parse path.",
            mimeType:
                "Not sent by this map. Same backstop as fileName: print-pipeline Step 2.5 batch-reads library_index.{fileId}.mimeType for every track missing one before per-track type routing.",
            audioFileId: "Print renders paper charts only; the linked audio file has no printed representation.",
            audioFileName: "Print renders paper charts only; the linked audio file has no printed representation.",
            tune: "PrintTrack has no `tune` field, so forwarding it would be discarded one layer down; the cover table draws no tune cell.",
            referenceLink: "External YouTube/Spotify reference link; nothing on the printed page can follow it.",
            duration: "Free-text song-length string; PrintTrack has no field for it.",
            bpm: "PrintTrack has no bpm field and the cover table draws no tempo cell.",
            pageNumber: "Chart-internal page target for the PDF viewer; the packet merges whole chart PDFs.",
            unmatched: "Template-expansion UI badge only; irrelevant to a packet being printed from a saved setlist.",
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
