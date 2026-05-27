import { describe, it, expect } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
    CATEGORIES,
    COVERAGE_GAPS,
    parseArgs,
    buildPlan,
    deriveCategoryMap,
    deriveSeverityDefaults,
    DEFAULT_PROJECTS,
} from "../stress-run.mjs"

/**
 * Stress-harness rework D1 — orchestrator plan-logic tests (no browser).
 * Asserts the cowork-category → spec routing, --categories filtering,
 * spec dedup, the emitter's categoryMap/severityDefaults derivation, and
 * — critically — that EVERY spec the plan references actually exists in
 * e2e/ (so `npm run stress` never points Playwright at a missing file).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..")

describe("stress-run — parseArgs", () => {
    it("parses --flag and --flag=value", () => {
        const f = parseArgs(["--dry-run", "--categories=A,B", "--base-url=https://x"])
        expect(f["dry-run"]).toBe(true)
        expect(f.categories).toBe("A,B")
        expect(f["base-url"]).toBe("https://x")
    })
})

describe("stress-run — buildPlan", () => {
    it("defaults to all categories with deduped e2e/ spec paths", () => {
        const plan = buildPlan({})
        expect(plan.categories).toEqual(Object.keys(CATEGORIES))
        // every spec path is e2e/-prefixed and unique
        expect(plan.specs.every((s) => s.startsWith("e2e/"))).toBe(true)
        expect(new Set(plan.specs).size).toBe(plan.specs.length)
        expect(plan.projects).toEqual(DEFAULT_PROJECTS)
    })

    it("filters by --categories and reports unknown letters", () => {
        const plan = buildPlan({ categories: "B,h,ZZ" })
        expect(plan.categories).toEqual(["B", "H"]) // case-insensitive
        expect(plan.unknown).toEqual(["ZZ"])
        // B + H specs only
        const expected = [...CATEGORIES.B.specs, ...CATEGORIES.H.specs].map((s) => `e2e/${s}`)
        expect(plan.specs.sort()).toEqual(expected.sort())
    })

    it("honors a custom --projects list", () => {
        const plan = buildPlan({ categories: "S", projects: ["ipad-webkit"] })
        expect(plan.projects).toEqual(["ipad-webkit"])
    })
})

describe("stress-run — emitter derivations", () => {
    it("derives a categoryMap covering every spec", () => {
        const map = deriveCategoryMap()
        const allSpecs = Object.values(CATEGORIES).flatMap((d) => d.specs)
        for (const spec of allSpecs) {
            expect(map[spec]).toBeDefined()
            expect(typeof map[spec].category).toBe("string")
            expect(typeof map[spec].label).toBe("string")
        }
    })
    it("derives severity defaults per category letter", () => {
        const sev = deriveSeverityDefaults()
        for (const letter of Object.keys(CATEGORIES)) {
            expect(sev[letter]).toBe(CATEGORIES[letter].severity)
        }
    })
})

describe("stress-run — category specs exist on disk", () => {
    it("every referenced e2e spec is a real file (no dangling routes)", async () => {
        const missing = []
        for (const def of Object.values(CATEGORIES)) {
            for (const spec of def.specs) {
                const p = path.join(REPO_ROOT, "e2e", spec)
                try {
                    await fs.access(p)
                } catch {
                    missing.push(spec)
                }
            }
        }
        expect(missing, `specs missing from e2e/: ${missing.join(", ")}`).toEqual([])
    })

    it("each spec is assigned to exactly one category (disjoint)", () => {
        const counts = {}
        for (const def of Object.values(CATEGORIES)) {
            for (const spec of def.specs) counts[spec] = (counts[spec] ?? 0) + 1
        }
        const dupes = Object.entries(counts).filter(([, n]) => n > 1).map(([s]) => s)
        expect(dupes, `specs in >1 category: ${dupes.join(", ")}`).toEqual([])
    })

    it("documents coverage gaps without faking specs for them", () => {
        // gap letters must NOT collide with a real runnable category
        for (const gapLetter of Object.keys(COVERAGE_GAPS)) {
            expect(CATEGORIES[gapLetter]).toBeUndefined()
        }
    })
})
