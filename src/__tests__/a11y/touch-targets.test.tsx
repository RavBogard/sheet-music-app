/**
 * U01 regression guard — WCAG 2.5.5 44px touch-target floor.
 *
 * Guards the specific surfaces called out by v4.3 audit finding U01:
 *   - SetlistRow (play/swap/header tap targets on /perform)
 *   - Perform-view page header (back Link, print/edit buttons)
 *   - MetronomeControl (on-stage BPM toggle)
 *
 * Strategy: a mix of rendered DOM assertions (SetlistRow — easy to render)
 * and source-level className checks (page.tsx + MetronomeControl — render
 * would pull in Firestore/zustand — not worth the mock surface for a sizing
 * check). Both approaches fail loudly if someone reintroduces h-8/h-9/h-10
 * sizing on the guarded elements.
 */
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { readFileSync } from "fs"
import { resolve } from "path"
import { SetlistRow } from "@/components/performance/SetlistRow"
import type { SetlistTrack } from "@/types/models"

vi.mock("@/lib/music-math", () => ({
    getTransposedKeyName: (key: string) => key,
}))

// Matches any explicit ≥44px sizing token (h-11+, size-11+, min-h-11+, h-[44px+], h-full).
const COMPLIANT = [
    /\bh-(1[1-9]|[2-9]\d|full|screen)\b/,
    /\bsize-(1[1-9]|[2-9]\d)\b/,
    /\bmin-h-(11|12|14|16|20|full)\b/,
    /\bmin-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]/,
    /\bh-\[(4[4-9]|[5-9]\d|\d{3,})px\]/,
]

function assertCompliant(className: string | null, label: string) {
    expect(className, `${label}: missing className`).not.toBeNull()
    const cls = className!
    const hit = COMPLIANT.some((re) => re.test(cls))
    expect(
        hit,
        `${label}: className="${cls}" has no ≥44px sizing token (need h-11+, size-11+, min-h-11+, or h-[44px+])`
    ).toBe(true)
}

const song: SetlistTrack = {
    id: "song-1",
    title: "Amazing Grace",
    key: "C",
    bpm: 120,
    type: "song",
    fileId: "file-abc",
}
const header: SetlistTrack = { id: "h-1", title: "SET 1", type: "header" }

const baseProps = {
    index: 0,
    isCurrentPosition: false,
    defaultTransposition: 0,
    isPublicView: false,
    onSongTap: vi.fn(),
    onLeaderSetPosition: vi.fn(),
    onSwapTap: vi.fn(),
}

describe("U01: touch-target floor (44px) — SetlistRow", () => {
    it("leader song row: swap icon button is ≥44px", () => {
        const { container } = render(
            <SetlistRow track={song} isLeader={true} {...baseProps} />
        )
        const swap = container.querySelector("button[aria-label^='Swap']")
        assertCompliant(swap?.getAttribute("class") ?? null, "SetlistRow swap button")
    })

    it("leader header row: full-width button hit box is ≥44px", () => {
        const { container } = render(
            <SetlistRow track={header} isLeader={true} {...baseProps} />
        )
        const btn = container.querySelector("button")
        assertCompliant(btn?.getAttribute("class") ?? null, "SetlistRow header (leader) button")
    })

    it("musician song row with file: swap button is ≥44px", () => {
        const { container } = render(
            <SetlistRow track={song} isLeader={false} {...baseProps} />
        )
        const swap = container.querySelector("button[aria-label^='Swap']")
        assertCompliant(swap?.getAttribute("class") ?? null, "SetlistRow musician swap button")
    })
})

describe("U01: touch-target floor (44px) — source-level class assertions", () => {
    const repoRoot = resolve(__dirname, "../../..")

    it("perform-view page header: back Link and toolbar buttons are ≥44px", () => {
        const src = readFileSync(
            resolve(repoRoot, "src/app/perform/setlist/[id]/page.tsx"),
            "utf8"
        )
        // Back Link
        expect(
            src,
            "perform page: back Link must use h-11 w-11 (WCAG 44px)"
        ).toMatch(/href=\{backHref\}[\s\S]{0,200}?className="h-11 w-11/)
        // Scan <Button>/<Link>/<button>/<a> open tags for sub-44px sizing.
        // Exclude decorative icon classNames (Loader2/spinners and lucide icons
        // typically render inside a button with their own h-*/w-* sizing).
        const interactiveTag = /<(Button|Link|button|a)\b[\s\S]{0,600}?className="([^"]+)"/g
        const offenders: string[] = []
        for (const m of src.matchAll(interactiveTag)) {
            const cls = m[2]
            if (/\banimate-spin\b/.test(cls)) continue
            if (/\b(h-[89]|h-10)\b/.test(cls)) offenders.push(`<${m[1]}> class="${cls}"`)
        }
        expect(
            offenders,
            `perform page: reintroduced sub-44px sizing → ${offenders.join(" | ")}`
        ).toEqual([])
    })

    it("MetronomeControl: tap-tempo Button is ≥44px", () => {
        const src = readFileSync(
            resolve(repoRoot, "src/components/performance/MetronomeControl.tsx"),
            "utf8"
        )
        const offenders = src.match(/className={?\s*cn?\(?\s*["`][^"`]*\b(h-[89]|h-10)\b/g) ?? []
        expect(
            offenders,
            `MetronomeControl: sub-44px sizing reintroduced → ${offenders.join(", ")}`
        ).toEqual([])
        expect(src, "MetronomeControl: togglePlay button must use h-11").toMatch(
            /h-11 min-w-11 px-3 sm:px-4 rounded-lg/
        )
    })

    it("MobileTabBar: outer tab <button> uses h-full inside h-16 sm:h-20 container (≥44px)", () => {
        const src = readFileSync(
            resolve(repoRoot, "src/components/nav/MobileTabBar.tsx"),
            "utf8"
        )
        expect(src, "MobileTabBar: container must be ≥44px tall").toMatch(/h-16 sm:h-20/)
        // Inner pills are visual-only (w-14 h-10) but outer button is h-full — that's OK.
        // Regression guard: no tab <button> should have explicit h-8/h-9/h-10 directly on the button itself.
        const outerTabs = src.match(
            /<button[\s\S]{0,400}?className=\{?cn?\(?[^)]*?\b(h-[89]|h-10)\b[^)]*?\)/g
        ) ?? []
        // Exclude the inner visual pill divs (not <button>) — regex above only matches <button>.
        expect(
            outerTabs.filter((m) => !m.includes("w-14")),
            "MobileTabBar: outer tab <button> must not shrink below 44px"
        ).toEqual([])
    })
})
