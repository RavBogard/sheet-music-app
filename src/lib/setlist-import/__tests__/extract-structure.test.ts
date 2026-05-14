import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @/lib/gemini ──────────────────────────────────────────────
// extractSetlistStructure calls geminiFlash() from @/lib/gemini and then
// model.generateContent(...). We mock the whole module so each test controls:
//   - responseText:   what response.text() returns
//   - generateError:  if set, generateContent rejects (Gemini API failure)
//   - flashError:     if set, geminiFlash() itself throws (e.g. missing API key)
// vi.hoisted lets the mock factory (hoisted above imports) share mutable state
// the tests reset in beforeEach — mirrors the hoisted-state pattern in the
// sibling extract-document.test.ts.
const geminiState = vi.hoisted(() => ({
    responseText: '' as string,
    generateError: null as Error | null,
    flashError: null as Error | null,
}))

vi.mock('@/lib/gemini', () => ({
    geminiFlash: () => {
        if (geminiState.flashError) throw geminiState.flashError
        return {
            generateContent: async () => {
                if (geminiState.generateError) throw geminiState.generateError
                return {
                    response: { text: () => geminiState.responseText },
                }
            },
        }
    },
}))

import { extractSetlistStructure } from '../extract-structure'

beforeEach(() => {
    geminiState.responseText = ''
    geminiState.generateError = null
    geminiState.flashError = null
})

// A well-formed structure Gemini might return.
const WELL_FORMED = {
    sections: [
        { name: 'Pre-Service', order: 0 },
        { name: 'Awakening', order: 1 },
    ],
    tracks: [
        {
            title: 'Adon Olam',
            key: 'D',
            vocalLead: 'Randy',
            sectionName: 'Pre-Service',
            order: 0,
        },
        { title: 'Hineh Mah Tov', sectionName: 'Awakening', order: 1 },
    ],
}

describe('extractSetlistStructure', () => {
    it('AC-1: parses a well-formed Gemini JSON response', async () => {
        geminiState.responseText = JSON.stringify(WELL_FORMED)

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.sections).toHaveLength(2)
        expect(result.sections[0]).toEqual({ name: 'Pre-Service', order: 0 })
        expect(result.tracks).toHaveLength(2)
        // Optional fields map through.
        expect(result.tracks[0]).toEqual({
            title: 'Adon Olam',
            key: 'D',
            vocalLead: 'Randy',
            sectionName: 'Pre-Service',
            order: 0,
        })
        // A track without optional fields stays minimal.
        expect(result.tracks[1]).toEqual({
            title: 'Hineh Mah Tov',
            sectionName: 'Awakening',
            order: 1,
        })
    })

    it('AC-1: strips markdown ```json fences before parsing', async () => {
        geminiState.responseText =
            '```json\n' + JSON.stringify(WELL_FORMED) + '\n```'

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.tracks).toHaveLength(2)
    })

    it('AC-1: normalizes null optional fields to undefined', async () => {
        geminiState.responseText = JSON.stringify({
            sections: [],
            tracks: [
                {
                    title: 'Mi Chamocha',
                    key: null,
                    vocalLead: null,
                    sectionName: null,
                    referenceLink: null,
                    notes: null,
                    order: 0,
                },
            ],
        })

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.sections).toEqual([])
        // null fields are dropped, not carried through as null.
        expect(result.tracks[0]).toEqual({ title: 'Mi Chamocha', order: 0 })
        expect('key' in result.tracks[0]).toBe(false)
        expect('vocalLead' in result.tracks[0]).toBe(false)
    })

    it('AC-2: returns malformed (with raw) for non-JSON output', async () => {
        geminiState.responseText = "I'm sorry, I can't parse that document."

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected failure')
        expect(result.reason).toBe('malformed')
        expect(result.raw).toBe("I'm sorry, I can't parse that document.")
        expect(result.message).toBeTruthy()
    })

    it('AC-2: returns malformed (with raw) for JSON that fails the schema', async () => {
        // tracks[0] is missing the required `title` field.
        geminiState.responseText = JSON.stringify({
            sections: [],
            tracks: [{ key: 'C', order: 0 }],
        })

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected failure')
        expect(result.reason).toBe('malformed')
        expect(result.raw).toBe(geminiState.responseText)
    })

    it('AC-2: returns empty for blank input text and never calls Gemini', async () => {
        // If Gemini were called, this would throw and surface as gemini_error.
        geminiState.flashError = new Error('Gemini should not have been called')

        const result = await extractSetlistStructure('   \n  ')

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected failure')
        expect(result.reason).toBe('empty')
    })

    it('AC-3: returns gemini_error when generateContent rejects', async () => {
        geminiState.generateError = new Error('Gemini API 503')

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected failure')
        expect(result.reason).toBe('gemini_error')
        expect(result.message).toContain('Gemini API 503')
    })

    it('AC-3: returns gemini_error when geminiFlash() throws (missing API key)', async () => {
        geminiState.flashError = new Error(
            'GOOGLE_GENERATIVE_AI_API_KEY is not set.',
        )

        const result = await extractSetlistStructure('some document text')

        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected failure')
        expect(result.reason).toBe('gemini_error')
        expect(result.message).toContain('GOOGLE_GENERATIVE_AI_API_KEY')
    })

    it('never throws — all failure modes resolve to a typed result', async () => {
        // Exercise each failure path and assert the promise resolved.
        geminiState.responseText = 'not json'
        await expect(
            extractSetlistStructure('text'),
        ).resolves.toMatchObject({ ok: false })

        geminiState.generateError = new Error('boom')
        await expect(
            extractSetlistStructure('text'),
        ).resolves.toMatchObject({ ok: false, reason: 'gemini_error' })
    })
})
