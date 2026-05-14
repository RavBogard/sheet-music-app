// v70-06: resolve a v70-05-extracted setlist structure against the library.
// Takes the { sections, tracks } shape from extractSetlistStructure and
// annotates each track with a fuzzy chart match (libraryMatch), a missingChart
// flag, and recording-match candidates (audio-typed library entries).
//
// This is a PURE COMPUTE PASS — it performs ZERO Firestore writes. It returns
// annotated proposals; v70-07's commit step does all persistence. The match
// algorithm mirrors the proven approach in src/app/api/setlists/import/parse/
// route.ts (levenshtein similarity, 0.82 threshold) — that route is not
// refactored; the logic is intentionally duplicated here.

import { getServerLibrary, type LibraryFile } from '@/lib/server-library'
import { levenshteinDistance } from '@/lib/string-utils'

import type {
    SetlistSection,
    SetlistStructure,
    SetlistTrack,
} from './extract-structure'

// ─── Types ───────────────────────────────────────────────────────────

export interface LibraryMatch {
    fileId: string
    name: string
    /** Normalized similarity score in (0.82, 1]. */
    confidence: number
}

export interface ResolvedTrack extends SetlistTrack {
    /** Best chart match (PDF / image library entry) above threshold, if any. */
    libraryMatch?: LibraryMatch
    /** True when no confident chart match — v70-07 routes these to upload. */
    missingChart: boolean
    /** Audio-typed library entries matching the title, best-first (may be []). */
    recordingCandidates: LibraryMatch[]
}

export interface ResolvedStructure {
    sections: SetlistSection[]
    tracks: ResolvedTrack[]
}

export type ResolveResult =
    | ({ ok: true } & ResolvedStructure)
    | { ok: false; reason: 'library_unavailable'; message: string }

// ─── Matching ────────────────────────────────────────────────────────
// Mirrors import/parse/route.ts: normalize, levenshtein similarity,
// 0.82 confidence threshold, exact-match-only for <3-char normalized strings.

const CONFIDENCE_THRESHOLD = 0.82

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface Candidate {
    fileId: string
    name: string
    normalizedName: string
}

/** Similarity of an already-normalized title against a candidate, or null if
 *  not a match (below threshold, or a failed short-string exact check). */
function score(normTitle: string, c: Candidate): number | null {
    if (normTitle.length < 3 || c.normalizedName.length < 3) {
        return normTitle === c.normalizedName ? 1 : null
    }
    const distance = levenshteinDistance(normTitle, c.normalizedName)
    const maxLength = Math.max(normTitle.length, c.normalizedName.length)
    const similarity = 1 - distance / maxLength
    return similarity > CONFIDENCE_THRESHOLD ? similarity : null
}

/** Best single match above threshold, or undefined. */
function bestMatch(title: string, candidates: Candidate[]): LibraryMatch | undefined {
    const norm = normalize(title)
    if (norm.length === 0) return undefined
    let best: LibraryMatch | undefined
    for (const c of candidates) {
        const s = score(norm, c)
        if (s !== null && (!best || s > best.confidence)) {
            best = { fileId: c.fileId, name: c.name, confidence: s }
        }
    }
    return best
}

/** All matches above threshold, sorted best-first. */
function allMatches(title: string, candidates: Candidate[]): LibraryMatch[] {
    const norm = normalize(title)
    if (norm.length === 0) return []
    const matches: LibraryMatch[] = []
    for (const c of candidates) {
        const s = score(norm, c)
        if (s !== null) {
            matches.push({ fileId: c.fileId, name: c.name, confidence: s })
        }
    }
    return matches.sort((a, b) => b.confidence - a.confidence)
}

// ─── Library partitioning ────────────────────────────────────────────
// Chart entries = PDF + image (v70-01 image charts). Recording candidates =
// audio/* entries. Partition on mime prefixes rather than an exhaustive list.

function isChartMime(mimeType: string): boolean {
    return mimeType === 'application/pdf' || mimeType.startsWith('image/')
}

function isAudioMime(mimeType: string): boolean {
    return mimeType.startsWith('audio/')
}

// ─── Main resolve ────────────────────────────────────────────────────

/**
 * Resolve an extracted setlist structure against the library. Never throws —
 * a library-fetch failure returns a typed `{ ok: false }` result. Performs no
 * Firestore writes.
 *
 * @param structure  the { sections, tracks } output of extractSetlistStructure
 * @param opts.library  inject a fixed library list (tests); when absent the
 *                      library is fetched via getServerLibrary()
 */
export async function resolveSetlistStructure(
    structure: SetlistStructure,
    opts?: { library?: LibraryFile[] },
): Promise<ResolveResult> {
    let library: LibraryFile[]
    if (opts?.library) {
        library = opts.library
    } else {
        try {
            // getServerLibrary already swallows internal errors and returns
            // { files: [] } — an empty library is usable, not a failure. The
            // try/catch only guards a thrown error (e.g. initAdmin throwing).
            const result = await getServerLibrary()
            library = result.files
        } catch (err) {
            return {
                ok: false,
                reason: 'library_unavailable',
                message:
                    err instanceof Error
                        ? err.message
                        : 'Failed to fetch the library index.',
            }
        }
    }

    const chartCandidates: Candidate[] = []
    const audioCandidates: Candidate[] = []
    for (const f of library) {
        const candidate: Candidate = {
            fileId: f.id,
            name: f.name,
            normalizedName: normalize(f.name),
        }
        if (isAudioMime(f.mimeType)) {
            audioCandidates.push(candidate)
        } else if (isChartMime(f.mimeType)) {
            chartCandidates.push(candidate)
        }
    }

    const tracks: ResolvedTrack[] = structure.tracks.map((track) => {
        const libraryMatch = bestMatch(track.title, chartCandidates)
        const resolved: ResolvedTrack = {
            ...track,
            missingChart: !libraryMatch,
            recordingCandidates: allMatches(track.title, audioCandidates),
        }
        if (libraryMatch) resolved.libraryMatch = libraryMatch
        return resolved
    })

    return { ok: true, sections: structure.sections, tracks }
}
