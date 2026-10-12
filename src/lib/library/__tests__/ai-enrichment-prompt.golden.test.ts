import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Multi-tenant phase 1 golden (lane 3, surface 3): the Gemini system
 * instruction, byte-for-byte as ai-enrichment.ts sent it at e0ad18b4
 * (SYSTEM_INSTRUCTION = lead + "\n\n" + LIBRARY_CONVENTIONS).
 */
const generateContent = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = { generateContent }
    },
    ThinkingLevel: { LOW: 'LOW' },
    Type: new Proxy({}, { get: (_t, k) => String(k) }),
}))
vi.mock('@/lib/firebase-admin', () => ({ initAdmin: vi.fn(), getFirestore: vi.fn() }))
vi.mock('@/lib/firebase-storage', () => ({ downloadFromStoragePath: vi.fn() }))

import { clearPrimedOrgConfigs } from '@/lib/org/config-cache'
import { callGeminiForEnrichment, __resetGeminiClientForTesting } from '../ai-enrichment'
import type { LibraryRowCreatedEvent } from '../library-events'

const CRC_SYSTEM_INSTRUCTION = `You are an enrichment assistant for the Central Reform Congregation music library. You inspect a chart file plus its current library_index metadata and emit a structured enrichment report. You NEVER refuse — you always emit the JSON object. If you're uncertain, return low confidence, populate \`concerns\`, and set \`review_required: true\`. Do NOT fabricate fields you can't determine from the input.

Library naming conventions (CRC music library):

- Reform Jewish liturgical music + supplemental.
- Common naming: "Title (Composer)" or "Title (Arrangement)" — e.g.
  "Shalom Rav (Frankel)", "Mi Chamocha (Klepper)".
- Hebrew-Latin transliteration is the canonical form (NOT Hebrew script
  on chart titles, even if the chart itself is in Hebrew).
- Collections:
    - core: high-frequency liturgical music (Shabbat liturgy, Hatzi
      Kaddish, etc.) — used every week.
    - supplemental: niggunim, holiday-specific, occasional repertoire.
    - uploads: provisional landing zone; everything starts here unless
      David routed it explicitly via Drive subfolder.
- Tags are short, kebab-case, optional. Examples:
  "friday-evening", "shabbat-morning", "high-holy-days", "frankel",
  "klepper", "shireinu", "kavanah".

If you're not sure of a field, return null / [] — do NOT guess.`

function makeEvent(extra: Record<string, unknown> = {}): LibraryRowCreatedEvent {
    return {
        rowId: 'r1',
        fileId: 'r1',
        source: 'upload',
        nameLower: 'shalom rav',
        title: 'Shalom Rav',
        mimeType: 'text/plain',
        sizeBytes: 3,
        collection: 'uploads',
        storagePath: 'library/r1.txt',
        contentHash: 'abc',
        uploaderUid: 'u1',
        ...extra,
    } as LibraryRowCreatedEvent
}

async function systemInstructionFor(event: LibraryRowCreatedEvent): Promise<string> {
    generateContent.mockReset()
    generateContent.mockResolvedValue({ text: '{}', usageMetadata: {} })
    await callGeminiForEnrichment({ event, fileBytes: null, neighborTitles: [] })
    return generateContent.mock.calls[0][0].config.systemInstruction
}

describe('P1 golden: Gemini system instruction', () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        __resetGeminiClientForTesting()
    })

    it('a crc chart (no orgId on the event) gets the exact CRC prompt', async () => {
        expect(await systemInstructionFor(makeEvent())).toBe(CRC_SYSTEM_INSTRUCTION)
    })

    it('a crc chart (orgId crc) gets the exact CRC prompt', async () => {
        expect(await systemInstructionFor(makeEvent({ orgId: 'crc' }))).toBe(CRC_SYSTEM_INSTRUCTION)
    })

    it('a brotherslazaroff chart gets the same CRC prompt it gets today', async () => {
        expect(await systemInstructionFor(makeEvent({ orgId: 'brotherslazaroff' }))).toBe(CRC_SYSTEM_INSTRUCTION)
    })
})
