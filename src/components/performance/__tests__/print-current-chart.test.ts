import { describe, it, expect } from "vitest"
import { currentDisplayedPreferFlats } from "../print-current-chart"
import type { MusicState } from "@/lib/store"

/** Minimal aiState fixture builder — only `pageData` matters here. */
const aiState = (
    pageData: MusicState["aiState"]["pageData"] = {},
): MusicState["aiState"] => ({
    isEnabled: true,
    scanningPages: [],
    pageData,
    error: null,
})

describe("currentDisplayedPreferFlats", () => {
    it("AC-1: an AI-scanned flat key (Bb) at +0 prefers flats — matches the on-screen chord overlay", () => {
        const state = aiState({
            0: { strips: [], chords: [{ text: "Bb", x: 0, y: 0, w: 0, h: 0 } as never] },
        })
        expect(currentDisplayedPreferFlats(state, null, 0)).toBe(true)
    })

    it("AC-2: a sharp key (D) at +0 prefers sharps", () => {
        const state = aiState({
            0: { strips: [], chords: [{ text: "D", x: 0, y: 0, w: 0, h: 0 } as never] },
        })
        expect(currentDisplayedPreferFlats(state, null, 0)).toBe(false)
    })

    it("AC-3: transposing a flat key up crosses into sharp spelling — the TARGET key drives preferFlats, not the original", () => {
        // Bb + 1 semitone = B, a sharp-side key — preferFlats must flip to
        // false, not stay pinned to the untransposed chart's flat spelling.
        const state = aiState({
            0: { strips: [], chords: [{ text: "Bb", x: 0, y: 0, w: 0, h: 0 } as never] },
        })
        expect(currentDisplayedPreferFlats(state, null, 1)).toBe(false)
    })

    it("AC-4: no AI chord data falls back to the MusicXML-detected key", () => {
        expect(currentDisplayedPreferFlats(aiState(), "Eb", 0)).toBe(true)
    })

    it("AC-5: no key signal at all (no AI chords, no MusicXML key) defaults to C — no strong preference", () => {
        expect(currentDisplayedPreferFlats(aiState(), null, 0)).toBeUndefined()
    })
})
