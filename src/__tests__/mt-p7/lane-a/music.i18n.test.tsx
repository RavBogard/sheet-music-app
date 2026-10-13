import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"

import { expectNoUntranslatedText, renderPseudo } from "@/test-utils/i18n"

/**
 * Phase 7 lane A (sub-lane A3) — chart viewers + transposer under the
 * pseudo-locales. Chord symbols / key names are music, never translated:
 * they are allowed by CHORD below.
 */

// Chord symbol or key name (G, Am, F#m, Bb, C#m7, D/F#), or a capo fret number.
const CHORD = /^\s*[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add|\d)*(\/[A-G][#b♯♭]?)?\s*$/

const { storeValues } = vi.hoisted(() => ({
    storeValues: {
        transposition: 2,
        setTransposition: () => {},
        aiState: {
            isEnabled: true,
            scanningPages: [] as number[],
            pageData: {
                0: { strips: [], chords: [{ text: "D" }, { text: "A" }, { text: "G" }, { text: "D" }] },
                1: { strips: [], chords: [{ text: "G" }, { text: "D" }] },
            } as Record<number, { strips: unknown[]; chords: { originalText?: string; text: string }[] }>,
            error: null as string | null,
        },
        setCapoFret: () => {},
        capoFret: null as number | null,
        capoSemitones: 3,
        setCapoSemitones: () => {},
        playbackQueue: [{ fileId: "file-1", key: "F" }] as Array<{ fileId?: string; key?: string }>,
        queueIndex: 0,
        setEditingChords: () => {},
        fileUrl: null as string | null,
        musicXmlKey: null as string | null,
        // ChordEditBar
        isEditingChords: true,
        pendingEditCount: 2,
        resetPendingEdits: () => {},
        // TextScoreViewer
        zoom: 1,
        setZoom: () => {},
    },
}))

vi.mock("@/lib/store", () => {
    const useMusicStore = (sel?: (s: typeof storeValues) => unknown) => (sel ? sel(storeValues) : { ...storeValues })
    return { useMusicStore }
})

vi.mock("@/hooks/use-musician-transposition", () => ({
    useMusicianTransposition: () => ({ isAutoTransposed: true, instrumentLabel: "Test Instrument", saving: false }),
}))

vi.mock("@/lib/chord-cache", () => ({
    loadLibraryMeta: () => Promise.resolve(null),
    saveVerification: () => {},
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }))

vi.mock("@/hooks/use-smart-transposer", () => ({
    useSmartTransposer: () => ({
        aiState: { isEnabled: true },
        pageData: { strips: [], chords: [{ text: "Am", originalText: "Am", x: 10, y: 10, w: 3, h: 2 }] },
        editPopover: null,
        setEditPopover: () => {},
        isEditingChords: true,
        transposition: 0,
        preferFlats: undefined,
        detectedKey: "C",
        addingChordAt: { x: 50, y: 50 },
        handleChordClick: () => {},
        handleBgDoubleClick: () => {},
        handleChordCorrection: () => {},
        handleChordDelete: () => {},
        handleChordResize: () => {},
        getSuggestions: () => [],
    }),
}))

import { TransposerMenu } from "@/components/music/TransposerMenu"
import { ChordEditBar } from "@/components/music/ChordEditBar"
import { ChordEditPopover } from "@/components/music/ChordEditPopover"
import { SmartTransposer } from "@/components/music/SmartTransposer"
import { TextScoreViewer } from "@/components/music/TextScoreViewer"
import { AudioPlayer } from "@/components/audio/AudioPlayer"
import { AudioViewer } from "@/components/music/AudioViewer"

describe("music — pseudo-locale (no untranslated UI text)", () => {
    it("TransposerMenu", () => {
        const r = renderPseudo(<TransposerMenu />)
        // Sanity: the menu actually rendered its key/capo sections.
        expect(r.container.textContent).toContain("⟦")
        expectNoUntranslatedText(r.container, { allow: [CHORD, "Test Instrument"] })
    })

    it("TransposerMenu (rtl): the key preview keeps ltr", () => {
        const r = renderPseudo(<TransposerMenu />, { rtl: true })
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expect(r.container.querySelector(".text-2xl")!.getAttribute("dir")).toBe("ltr")
        expectNoUntranslatedText(r.container, { allow: [CHORD, "Test Instrument"] })
    })

    it("ChordEditBar", () => {
        const r = renderPseudo(<ChordEditBar />)
        expect(r.container.textContent).toContain("⟦")
        expectNoUntranslatedText(r.container)
    })

    it("ChordEditPopover (portal): chord previews keep ltr on rtl", () => {
        const anchor = document.createElement("div")
        document.body.appendChild(anchor)
        const r = renderPseudo(
            <ChordEditPopover
                chord={{ text: "Am", originalText: "Am", x: 1, y: 1, w: 3, h: 2 } as never}
                chordIndex={0}
                anchorEl={anchor}
                suggestions={["Am", "C"]}
                transposition={0}
                preferFlats={undefined}
                onCorrect={() => {}}
                onDelete={() => {}}
                onResize={() => {}}
                onClose={() => {}}
            />,
            { rtl: true },
        )
        expectNoUntranslatedText(r.baseElement, { allow: [CHORD] })
        const input = r.baseElement.querySelector("input")!
        expect(input.getAttribute("dir")).toBe("ltr")
        anchor.remove()
    })

    it("SmartTransposer overlay", () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        )
        const pageRef = { current: document.createElement("div") }
        const r = renderPseudo(<SmartTransposer pageRef={pageRef} pageNumber={1} isRendered />)
        expectNoUntranslatedText(r.container, { allow: [CHORD] })
        vi.unstubAllGlobals()
    })

    it("AudioPlayer + AudioViewer", () => {
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
        const a = renderPseudo(<AudioPlayer src={null} />)
        expectNoUntranslatedText(a.container)
        a.unmount()
        const b = renderPseudo(<AudioPlayer src="https://example.test/a.mp3" title="Test Song A" />)
        expectNoUntranslatedText(b.container, { allow: ["Test Song A"] })
        b.unmount()
        const c = renderPseudo(<AudioViewer fileId="" />)
        expectNoUntranslatedText(c.container)
    })
})

describe("TextScoreViewer under qps-rtl", () => {
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 })
        vi.doMock("@/lib/offline-idb", () => ({ getFile: () => Promise.resolve(null) }))
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("G     D\nTest lyric line\n") } as Response),
        )
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.doUnmock("@/lib/offline-idb")
    })

    it("root is rtl, the chord/lyric block stays ltr, chrome is translated", async () => {
        const r = renderPseudo(<TextScoreViewer fileId="test-text-chart" />, { rtl: true })
        await waitFor(() => expect(r.container.querySelector(".font-mono")).not.toBeNull())
        expect(r.container.firstElementChild!.getAttribute("dir")).toBe("rtl")
        expect(r.container.querySelector(".font-mono")!.getAttribute("dir")).toBe("ltr")
        expectNoUntranslatedText(r.container, { ignoreSelector: ".font-mono" })
    })
})
