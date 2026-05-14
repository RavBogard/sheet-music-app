// v70-07-03: commit a doc-import resolved structure into a real setlist.
// Flattens the v70-06 resolved { sections, tracks } shape + interview metadata
// into createSetlistServerSide's input — section headers interleaved before
// their songs, matched library charts bound, recording candidates ignored
// (recording binding is deferred for v70-07) — and persists it. The
// doc-import-specific flattening lives here, not in setlist-write.ts (that
// module is the generic server-side write path).

import {
    createSetlistServerSide,
    type CreateSetlistResult,
    type ServerSetlistTrackInput,
} from '@/lib/setlist-write'
import type { Setlist } from '@/types/models'

import type { SetlistSection } from './extract-structure'
import type { ResolvedTrack } from './resolve'

export interface CommitDocumentInput {
    name: string
    ownerId: string
    ownerName: string
    eventDate?: Date | string
    serviceType?: Setlist['templateType']
    rabbi?: string
    sections: SetlistSection[]
    tracks: ResolvedTrack[]
}

/** Map a resolved track to a song-type ServerSetlistTrackInput, binding the
 *  matched library chart when one was found. recordingCandidates are ignored —
 *  recording binding is deferred for v70-07. */
function toSongInput(track: ResolvedTrack): ServerSetlistTrackInput {
    const song: ServerSetlistTrackInput = {
        type: 'song',
        title: track.title,
    }
    if (track.key !== undefined) song.key = track.key
    // The model stores "Vocal Lead" as `leadMusician`.
    if (track.vocalLead !== undefined) song.leadMusician = track.vocalLead
    if (track.referenceLink !== undefined) {
        song.referenceLink = track.referenceLink
    }
    if (track.libraryMatch) {
        song.fileId = track.libraryMatch.fileId
        song.fileName = track.libraryMatch.name
    }
    return song
}

/**
 * Flatten a resolved { sections, tracks } structure into a flat
 * ServerSetlistTrackInput list: each section emitted as a 'header' track
 * followed by its 'song' tracks in document order; tracks with no sectionName
 * (or a sectionName matching no known section) are appended last.
 */
export function flattenResolvedStructure(
    sections: SetlistSection[],
    tracks: ResolvedTrack[],
): ServerSetlistTrackInput[] {
    const orderedSections = [...sections].sort((a, b) => a.order - b.order)
    const sectionNames = new Set(orderedSections.map((s) => s.name))
    const flat: ServerSetlistTrackInput[] = []

    for (const section of orderedSections) {
        flat.push({ type: 'header', title: section.name })
        const sectionTracks = tracks
            .filter((t) => t.sectionName === section.name)
            .sort((a, b) => a.order - b.order)
        for (const track of sectionTracks) flat.push(toSongInput(track))
    }

    const ungrouped = tracks
        .filter((t) => !t.sectionName || !sectionNames.has(t.sectionName))
        .sort((a, b) => a.order - b.order)
    for (const track of ungrouped) flat.push(toSongInput(track))

    return flat
}

/**
 * Commit a doc-import resolved structure as a real setlist — flattens the
 * structure and persists via createSetlistServerSide. Does NOT auth or
 * validate; that is the calling route's responsibility.
 */
export async function commitDocumentSetlist(
    input: CommitDocumentInput,
): Promise<CreateSetlistResult> {
    const tracks = flattenResolvedStructure(input.sections, input.tracks)
    return createSetlistServerSide({
        name: input.name,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        eventDate: input.eventDate,
        serviceType: input.serviceType,
        rabbi: input.rabbi,
        tracks,
    })
}
