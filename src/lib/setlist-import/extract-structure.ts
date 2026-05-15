// v70-05: Gemini structured extraction for v7.0 doc-driven setlist creation.
// Takes the raw text produced by v70-04's extractDocumentText and asks Gemini
// to return a structured setlist shape { sections[], tracks[] }, validated with
// Zod. This is the AI structure pass — it does NOT resolve tracks against the
// library or recordings (v70-06) and does NOT persist anything (v70-07).
//
// Like extract-document.ts, this never throws — every failure mode (empty
// input, malformed model output, Gemini/API error) returns a typed
// discriminated result. Malformed/empty results carry the raw Gemini output so
// a human can review what the model actually produced.

import { z } from 'zod'

import { geminiFlash } from '@/lib/gemini'

// ─── Schema ──────────────────────────────────────────────────────────
// Optional fields use .nullish() defensively — Gemini commonly emits null for
// unknown fields even when instructed to omit them. Nulls are normalized to
// undefined after a successful parse (see normalizeTrack / normalizeSection).

export const SectionSchema = z.object({
    name: z.string(),
    order: z.number(),
})

export const TrackSchema = z.object({
    title: z.string(),
    key: z.string().nullish(),
    vocalLead: z.string().nullish(),
    sectionName: z.string().nullish(),
    referenceLink: z.string().nullish(),
    notes: z.string().nullish(),
    order: z.number(),
})

export const SetlistStructureSchema = z.object({
    sections: z.array(SectionSchema),
    tracks: z.array(TrackSchema),
})

export interface SetlistSection {
    name: string
    order: number
}

export interface SetlistTrack {
    title: string
    key?: string
    vocalLead?: string
    sectionName?: string
    referenceLink?: string
    notes?: string
    order: number
}

export interface SetlistStructure {
    sections: SetlistSection[]
    tracks: SetlistTrack[]
}

// ─── Result type ─────────────────────────────────────────────────────

export type StructureResult =
    | { ok: true; sections: SetlistSection[]; tracks: SetlistTrack[] }
    | {
          ok: false
          reason: 'malformed' | 'empty' | 'gemini_error'
          message: string
          raw?: string
      }

// ─── Normalization (null → undefined) ────────────────────────────────

function normalizeSection(s: z.infer<typeof SectionSchema>): SetlistSection {
    return { name: s.name, order: s.order }
}

function normalizeTrack(t: z.infer<typeof TrackSchema>): SetlistTrack {
    const out: SetlistTrack = { title: t.title, order: t.order }
    if (t.key != null) out.key = t.key
    if (t.vocalLead != null) out.vocalLead = t.vocalLead
    if (t.sectionName != null) out.sectionName = t.sectionName
    if (t.referenceLink != null) out.referenceLink = t.referenceLink
    if (t.notes != null) out.notes = t.notes
    return out
}

// ─── Prompt ──────────────────────────────────────────────────────────

function buildPrompt(documentText: string): string {
    return `You are an expert worship-service setlist parser. You are given the raw text of a service-outline document. Extract its structure as JSON.

Return ONLY a JSON object with exactly two root keys: "sections" and "tracks".

"sections" — an array of the structural headings/parts of the service, in document order.
Each section object:
- "name": the heading text (e.g. "Pre-Service", "Awakening", "Torah Service").
- "order": a 0-based integer giving the section's position in the document.

"tracks" — an array of the songs/tunes/prayers, in document order.
Each track object:
- "title": the primary name of the song/prayer. REQUIRED.
- "key": the musical key if stated (e.g. "Dm", "E", "F"). Omit if unknown.
- "vocalLead": the Vocal Lead (lead vocalist / song leader) if indicated. Omit if unknown.
- "sectionName": the exact "name" of the section this track belongs under, if the document groups songs beneath headings. Omit if there are no sections.
- "referenceLink": any YouTube/Spotify/recording URL associated with the track. Omit if none.
- "notes": any short extra annotation about the track. Omit if none.
- "order": a 0-based integer giving the track's position across the whole document.

Rules:
- Omit any field you cannot determine — do NOT emit empty strings. (If your format requires a value for an unknown field, use null.)
- Preserve the document's ordering via the integer "order" fields.
- Do not invent songs, sections, keys, or Vocal Leads that are not in the document.
- If the document has no structural headings, return "sections": [] and still populate "tracks".

Document text:
${documentText}`
}

// ─── Main extraction ─────────────────────────────────────────────────

/**
 * Send raw document text to Gemini and return a Zod-validated
 * { sections, tracks } structure. Never throws — empty input, malformed model
 * output, and Gemini/API errors all return a typed { ok: false } result.
 */
export async function extractSetlistStructure(
    text: string,
): Promise<StructureResult> {
    if (!text || text.trim().length === 0) {
        return {
            ok: false,
            reason: 'empty',
            message: 'No document text provided to extract.',
        }
    }

    let rawOutput: string
    try {
        // Reuses the chord-detection Gemini model setup (gemini-3-flash-preview).
        // geminiFlash() itself throws if GOOGLE_GENERATIVE_AI_API_KEY is unset —
        // that throw is caught here too.
        const model = geminiFlash()
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: buildPrompt(text) }] }],
            generationConfig: { temperature: 0.1 },
        })
        rawOutput = result.response.text()
    } catch (err) {
        return {
            ok: false,
            reason: 'gemini_error',
            message:
                err instanceof Error
                    ? err.message
                    : 'Gemini structured extraction failed.',
        }
    }

    if (!rawOutput || rawOutput.trim().length === 0) {
        return {
            ok: false,
            reason: 'empty',
            message: 'Gemini returned an empty response.',
            raw: rawOutput ?? '',
        }
    }

    // Gemini sometimes wraps JSON in markdown code fences — strip them
    // (mirrors the existing import/parse route).
    const cleaned = rawOutput
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch {
        return {
            ok: false,
            reason: 'malformed',
            message: 'Gemini returned output that is not valid JSON.',
            raw: rawOutput,
        }
    }

    const validation = SetlistStructureSchema.safeParse(parsed)
    if (!validation.success) {
        const detail = validation.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ')
        return {
            ok: false,
            reason: 'malformed',
            message: `Gemini output did not match the expected setlist structure: ${detail}`,
            raw: rawOutput,
        }
    }

    return {
        ok: true,
        sections: validation.data.sections.map(normalizeSection),
        tracks: validation.data.tracks.map(normalizeTrack),
    }
}
