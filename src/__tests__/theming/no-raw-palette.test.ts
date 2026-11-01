import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard for the 2026-10-31 theming audit: colours in src/app and
 * src/components come from the tokens in globals.css (primary, brand,
 * destructive, success, caution, muted, card, popover, scrim, shell, the
 * section hues…), so both themes and both tenants re-skin through them. A raw
 * Tailwind palette class (`bg-blue-600`, `text-zinc-400`, `bg-black/70`…)
 * shows CRC blue on Brothers Lazaroff and dark-era values on light surfaces.
 *
 * Out of scope: the chart viewers in src/components/music (and the PDF/OSMD
 * canvas inside them), and test files.
 *
 * Every remaining raw class is listed below with its reason. Add to this list
 * only with a reason a token cannot serve.
 */
const EXCEPTIONS: Record<string, { classes: string[]; why: string }> = {
    // Translucent white washes on the --shell top bar. They tint whatever the
    // shell is (CRC book-cloth, BL teal), so they re-skin correctly.
    "src/components/nav/DesktopHeader.tsx": {
        classes: ["bg-white/10", "bg-white/20", "border-white/15", "border-white/25", "border-white/30", "border-white/40"],
        why: "white wash on the shell bar",
    },
    "src/components/nav/MobileHeader.tsx": {
        classes: ["bg-white/10", "bg-white/15", "border-white/40"],
        why: "white wash on the shell bar",
    },
    "src/components/nav/NotificationBell.tsx": {
        classes: ["bg-white/10"],
        why: "white wash on the shell bar",
    },
    // A QR code must be dark on pure white to scan, in every theme.
    "src/components/auth/QRSignIn.tsx": { classes: ["bg-white"], why: "QR code quiet zone" },
    "src/components/performance/PublicSetlistListing.tsx": { classes: ["bg-white"], why: "QR code quiet zone" },
    // Chart page thumbnails are paper: a transparent PDF/score page needs a
    // white sheet behind it in dark mode too.
    "src/components/setlist/grid/ChartThumb.tsx": { classes: ["bg-white"], why: "chart paper behind a page image" },
    // Switch knobs. The Settings toggles belong to the a11y/touch slice
    // (builder A, audit/a11y-touch), which replaces them with the shared Switch.
    "src/components/settings/MusicianProfileSettings.tsx": { classes: ["bg-white"], why: "switch knob (being replaced)" },
}

const ROOTS = ["src/app", "src/components"]
const SKIP_DIR = /[\\/](__tests__|__snapshots__)$|[\\/]src[\\/]components[\\/]music$/
const PALETTE =
    /(?<![\w-])(?:[\w[\]=&*:>-]+:)*((?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|to|via|fill|stroke|outline|divide|placeholder|shadow|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d+)?(?:\/\d+)?)(?![\w-])/g

function walk(dir: string, out: string[]) {
    for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name)
        if (statSync(abs).isDirectory()) {
            if (!SKIP_DIR.test(abs)) walk(abs, out)
        } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
            out.push(abs)
        }
    }
}

describe("theming: no raw Tailwind palette classes outside the exception list", () => {
    it("every palette class in src/app and src/components is a listed exception", () => {
        const files: string[] = []
        for (const r of ROOTS) walk(path.join(process.cwd(), r), files)
        const offenders: string[] = []
        for (const abs of files) {
            const rel = path.relative(process.cwd(), abs).split(path.sep).join("/")
            const allowed = new Set(EXCEPTIONS[rel]?.classes ?? [])
            readFileSync(abs, "utf8")
                .split(/\r?\n/)
                .forEach((line, i) => {
                    for (const m of line.matchAll(PALETTE)) {
                        if (!allowed.has(m[1])) offenders.push(`${rel}:${i + 1} ${m[1]}`)
                    }
                })
        }
        expect(offenders).toEqual([])
    })
})
