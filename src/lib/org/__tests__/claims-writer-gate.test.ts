import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Multi-tenant P2 grep gate (design §3.5 mitigation 1): custom claims are
 * written ONLY by src/lib/org/claims.ts (rebuildClaims / restoreClaimsVerbatim).
 * Any other `setCustomUserClaims(` call could write a `role` claim without `m`,
 * which the transition rule would read as that role in crc.
 *
 * Exempt: tests (they seed emulator fixtures), scripts/.archive and the dated
 * one-off migrations under scripts/migrations (historical, never re-run).
 */
const ROOT = join(__dirname, "..", "..", "..", "..")
const ALLOWED = new Set([
    "src/lib/org/claims.ts",
    // Throwaway probe accounts (uid test-mtprobe-*) get pre-phase-2 claims on
    // purpose, so the probe can capture what each role saw before a rules change.
    "scripts/dev/rules-persona-probe.mjs",
])
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".archive", "dist", "coverage"])
const CALL = /\.setCustomUserClaims\s*\(/

function walk(dir: string, out: string[]) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p, out)
        else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(p)
    }
}

function isExempt(rel: string): boolean {
    return (
        ALLOWED.has(rel) ||
        /(^|\/)__tests__\//.test(rel) ||
        /\.test\.[cm]?[jt]sx?$/.test(rel) ||
        rel.startsWith("scripts/migrations/") ||
        rel.startsWith("src/test/") ||
        rel.startsWith("src/test-stubs/")
    )
}

describe("claims writer grep gate", () => {
    it("setCustomUserClaims is called only from src/lib/org/claims.ts", () => {
        const files: string[] = []
        walk(join(ROOT, "src"), files)
        walk(join(ROOT, "scripts"), files)
        const offenders = files
            .map((f) => relative(ROOT, f).split(sep).join("/"))
            .filter((rel) => !isExempt(rel))
            .filter((rel) => CALL.test(readFileSync(join(ROOT, rel), "utf8")))
        expect(offenders).toEqual([])
    })

    it("claims.ts itself still contains the writer (the gate is not vacuous)", () => {
        expect(CALL.test(readFileSync(join(ROOT, "src/lib/org/claims.ts"), "utf8"))).toBe(true)
    })
})
