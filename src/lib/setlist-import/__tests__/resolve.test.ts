import { describe, it, expect } from 'vitest'

import type { LibraryFile } from '@/lib/server-library'

import type { SetlistStructure } from '../extract-structure'
import { resolveSetlistStructure } from '../resolve'

// ── Fixture library ────────────────────────────────────────────────
// Injected via opts.library so no Firestore / network is touched.
function libFile(
    id: string,
    name: string,
    mimeType: string,
): LibraryFile {
    return { id, name, mimeType, parents: [] }
}

const FIXTURE_LIBRARY: LibraryFile[] = [
    // Chart entries.
    libFile('pdf-adon', 'Adon Olam', 'application/pdf'),
    libFile('img-hineh', 'Hineh Mah Tov', 'image/png'),
    libFile('pdf-other', 'Completely Unrelated Tune', 'application/pdf'),
    // Audio entries (recording candidates).
    libFile('aud-adon-1', 'Adon Olam', 'audio/mpeg'),
    libFile('aud-adon-2', 'Adon Olom', 'audio/mpeg'), // 1-char off → ~0.875
    libFile('aud-unrelated', 'Some Other Recording', 'audio/mpeg'),
]

function structure(
    tracks: SetlistStructure['tracks'],
    sections: SetlistStructure['sections'] = [],
): SetlistStructure {
    return { sections, tracks }
}

describe('resolveSetlistStructure', () => {
    it('AC-1: a title matching a PDF entry gets a libraryMatch + missingChart false', async () => {
        const result = await resolveSetlistStructure(
            structure([{ title: 'Adon Olam', order: 0 }]),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        const track = result.tracks[0]
        expect(track.missingChart).toBe(false)
        expect(track.libraryMatch).toEqual({
            fileId: 'pdf-adon',
            name: 'Adon Olam',
            confidence: 1,
        })
    })

    it('AC-1: an image/* entry also counts as a chart match', async () => {
        const result = await resolveSetlistStructure(
            structure([{ title: 'Hineh Mah Tov', order: 0 }]),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.tracks[0].missingChart).toBe(false)
        expect(result.tracks[0].libraryMatch?.fileId).toBe('img-hineh')
    })

    it('AC-2: a title with no chart entry above threshold is flagged missingChart', async () => {
        const result = await resolveSetlistStructure(
            structure([
                { title: 'Zzzz Nonexistent Service Song', order: 0 },
            ]),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.tracks[0].missingChart).toBe(true)
        expect(result.tracks[0].libraryMatch).toBeUndefined()
        // Track is otherwise unchanged.
        expect(result.tracks[0].title).toBe('Zzzz Nonexistent Service Song')
        expect(result.tracks[0].order).toBe(0)
    })

    it('AC-3: audio entries become recordingCandidates, sorted best-first', async () => {
        const result = await resolveSetlistStructure(
            structure([{ title: 'Adon Olam', order: 0 }]),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        const candidates = result.tracks[0].recordingCandidates
        expect(candidates).toHaveLength(2)
        // Exact audio match first (confidence 1), then the 1-char-off one.
        expect(candidates[0].fileId).toBe('aud-adon-1')
        expect(candidates[0].confidence).toBe(1)
        expect(candidates[1].fileId).toBe('aud-adon-2')
        expect(candidates[0].confidence).toBeGreaterThanOrEqual(
            candidates[1].confidence,
        )
    })

    it('AC-3: a title with no audio match gets an empty recordingCandidates array', async () => {
        const result = await resolveSetlistStructure(
            structure([{ title: 'Hineh Mah Tov', order: 0 }]),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.tracks[0].recordingCandidates).toEqual([])
    })

    it('AC-4: sections pass through unchanged and every track is preserved in order', async () => {
        const sections = [
            { name: 'Pre-Service', order: 0 },
            { name: 'Awakening', order: 1 },
        ]
        const result = await resolveSetlistStructure(
            structure(
                [
                    { title: 'Adon Olam', order: 0, sectionName: 'Pre-Service' },
                    { title: 'Hineh Mah Tov', order: 1, key: 'D' },
                    { title: 'Zzzz Nonexistent', order: 2 },
                ],
                sections,
            ),
            { library: FIXTURE_LIBRARY },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.sections).toEqual(sections)
        expect(result.tracks).toHaveLength(3)
        expect(result.tracks.map((t) => t.order)).toEqual([0, 1, 2])
        // Original track fields survive the annotation.
        expect(result.tracks[0].sectionName).toBe('Pre-Service')
        expect(result.tracks[1].key).toBe('D')
    })

    it('AC-4: an empty library resolves cleanly — every track missingChart, no candidates', async () => {
        const result = await resolveSetlistStructure(
            structure([
                { title: 'Adon Olam', order: 0 },
                { title: 'Hineh Mah Tov', order: 1 },
            ]),
            { library: [] },
        )

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.tracks.every((t) => t.missingChart)).toBe(true)
        expect(
            result.tracks.every((t) => t.recordingCandidates.length === 0),
        ).toBe(true)
    })

    it('matches short (<3 normalized char) titles by exact match only', async () => {
        const lib: LibraryFile[] = [
            libFile('pdf-hi', 'Hi', 'application/pdf'),
            libFile('pdf-long', 'Hineh Mah Tov', 'application/pdf'),
        ]
        // "Hi" exact-matches the short library entry...
        const exact = await resolveSetlistStructure(
            structure([{ title: 'Hi', order: 0 }]),
            { library: lib },
        )
        expect(exact.ok).toBe(true)
        if (!exact.ok) throw new Error('expected ok')
        expect(exact.tracks[0].libraryMatch?.fileId).toBe('pdf-hi')

        // ...but a different short title fuzzy-matches nothing (no false
        // positive against the long entry).
        const noMatch = await resolveSetlistStructure(
            structure([{ title: 'Yo', order: 0 }]),
            { library: lib },
        )
        expect(noMatch.ok).toBe(true)
        if (!noMatch.ok) throw new Error('expected ok')
        expect(noMatch.tracks[0].missingChart).toBe(true)
    })
})
