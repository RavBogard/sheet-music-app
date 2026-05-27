import { describe, it, expect } from "vitest"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
    cleanText,
    flattenSpecs,
    extractFindings,
    extractMcpFindings,
    countMcpProbes,
    buildReport,
    emitReport,
    SEVERITY_ORDER,
} from "../report-emit.mjs"

/**
 * Stress-harness rework D2 — report-emitter contract tests.
 *
 * Drives a synthetic Playwright-JSON-reporter fixture (one passing test,
 * one failing test, one passing test carrying a FINDING annotation, one
 * skipped) through extractFindings + buildReport + emitReport, asserting:
 *   - failures and FINDING-annotations both become findings; clean passes
 *     do not; skips/passes still count toward "probes executed".
 *   - severity/category annotation overrides win over the category default.
 *   - the emitted markdown carries every cowork-schema header line, the
 *     Summary stats, the cleanup table, and per-finding SUT/Severity/Repro/
 *     Expected/Actual/Hypothesis blocks grouped by category.
 */

const CATEGORY_MAP = {
    "perform-ipad-deep.spec.ts": { category: "B", label: "Perform render sweep" },
    "r1-offline-decisive.spec.ts": { category: "H", label: "Offline behavior" },
    "library-ipad.spec.ts": { category: "D", label: "Library workflow + search" },
}
const SEVERITY_DEFAULTS = { B: "HIGH", H: "HIGH", D: "MED" }

/** Build a minimal-but-realistic Playwright JSON reporter result object. */
function makeFixture() {
    const mkTest = (project, status, { annotations = [], errorMsg } = {}) => ({
        projectName: project,
        status, // 'expected' | 'unexpected' | 'skipped' | 'flaky'
        annotations,
        results: [
            {
                status:
                    status === "unexpected"
                        ? "failed"
                        : status === "skipped"
                          ? "skipped"
                          : "passed",
                duration: 1200,
                ...(errorMsg
                    ? { errors: [{ message: errorMsg, stack: "at foo()" }] }
                    : {}),
            },
        ],
    })

    return {
        config: {},
        stats: {
            startTime: "2026-05-27T22:00:00.000Z",
            duration: 8400,
            expected: 2,
            skipped: 1,
            unexpected: 1,
            flaky: 0,
        },
        suites: [
            {
                title: "perform-ipad-deep.spec.ts",
                file: "perform-ipad-deep.spec.ts",
                specs: [
                    {
                        title: "renders all charts clean",
                        file: "perform-ipad-deep.spec.ts",
                        tests: [mkTest("ipad-webkit", "expected")], // clean pass → NOT a finding
                    },
                    {
                        title: "transpose keeps layout stable",
                        file: "perform-ipad-deep.spec.ts",
                        tests: [
                            mkTest("ipad-webkit", "unexpected", {
                                errorMsg:
                                    `${String.fromCharCode(27)}[31mExpected${String.fromCharCode(27)}[0m layout shift to be 0 but got 14px`,
                            }),
                        ], // failure → finding, severity defaults to B=HIGH
                    },
                ],
                suites: [
                    {
                        title: "nested describe",
                        specs: [
                            {
                                title: "wake-lock toggle reflects state",
                                file: "perform-ipad-deep.spec.ts",
                                tests: [
                                    mkTest("ipad-webkit-landscape", "expected", {
                                        annotations: [
                                            {
                                                type: "FINDING",
                                                description:
                                                    "KeepAwakeToggle visually lags the sentinel by ~1 frame on rotate",
                                            },
                                            { type: "severity", description: "LOW" },
                                        ],
                                    }),
                                ], // passing test w/ FINDING annotation → finding @ LOW
                            },
                        ],
                    },
                ],
            },
            {
                title: "r1-offline-decisive.spec.ts",
                file: "r1-offline-decisive.spec.ts",
                specs: [
                    {
                        title: "reload while offline survives",
                        file: "r1-offline-decisive.spec.ts",
                        tests: [mkTest("ipad-webkit", "skipped")], // skipped → counts, not a finding
                    },
                ],
            },
        ],
    }
}

describe("report-emit — cleanText", () => {
    const ESC = String.fromCharCode(27) // real ANSI escape
    it("strips real ANSI SGR sequences and trims", () => {
        expect(cleanText(`${ESC}[31mhi${ESC}[0m  `)).toBe("hi")
        expect(cleanText(`${ESC}[1;33mwarn${ESC}[39m`)).toBe("warn")
        expect(cleanText(null)).toBe("")
        expect(cleanText(42)).toBe("42")
    })
})

describe("report-emit — flattenSpecs", () => {
    it("walks nested suites and collects every spec", () => {
        const specs = flattenSpecs(makeFixture())
        const titles = specs.map((s) => s.title).sort()
        expect(titles).toEqual(
            [
                "renders all charts clean",
                "transpose keeps layout stable",
                "wake-lock toggle reflects state",
                "reload while offline survives",
            ].sort(),
        )
    })
    it("tolerates a malformed report", () => {
        expect(flattenSpecs(null)).toEqual([])
        expect(flattenSpecs({})).toEqual([])
        expect(flattenSpecs({ suites: "nope" })).toEqual([])
    })
})

describe("report-emit — extractFindings", () => {
    const { findings, stats } = extractFindings(makeFixture(), {
        categoryMap: CATEGORY_MAP,
        severityDefaults: SEVERITY_DEFAULTS,
    })

    it("counts every test as a probe regardless of finding-status", () => {
        expect(stats.testCount).toBe(4)
        expect(stats.passed).toBe(2) // the clean pass + the FINDING-annotated pass
        expect(stats.failed).toBe(1)
        expect(stats.skipped).toBe(1)
    })

    it("turns failures AND FINDING-annotations into findings; clean passes/skips are not findings", () => {
        expect(findings.length).toBe(2)
        const titles = findings.map((f) => f.title)
        expect(titles).toContain("transpose keeps layout stable")
        expect(titles).toContain("wake-lock toggle reflects state")
        expect(titles).not.toContain("renders all charts clean")
        expect(titles).not.toContain("reload while offline survives")
    })

    it("assigns the category-default severity to failures", () => {
        const fail = findings.find((f) => f.source === "failure")
        expect(fail.category).toBe("B")
        expect(fail.severity).toBe("HIGH") // B default
        expect(fail.actual).toContain("layout shift") // ANSI stripped
        expect(fail.actual).not.toContain(String.fromCharCode(27)) // no stray ESC byte
        expect(fail.actual).toContain("[failed]")
    })

    it("honors a severity annotation override on a FINDING annotation", () => {
        const ann = findings.find((f) => f.source === "annotation")
        expect(ann.severity).toBe("LOW") // overridden, not the category default
        expect(ann.actual).toContain("KeepAwakeToggle")
    })

    it("numbers findings F-001.. in deterministic (category,severity) order", () => {
        expect(findings.map((f) => f.id)).toEqual(["F-001", "F-002"])
        // category B sorts before nothing else here; both are B → severity order
        expect(findings[0].severity).toBe("HIGH")
        expect(findings[1].severity).toBe("LOW")
    })
})

describe("report-emit — extractMcpFindings", () => {
    it("turns failed probe rows into findings, skips ok rows + envelopes", () => {
        const rows = [
            { kind: "batch:start" },
            { kind: "probe:result", probe: "probes/perform.mjs", ok: true },
            {
                kind: "probe:result",
                probe: "probes/library.mjs",
                ok: false,
                error: { name: "TypeError", message: "boom" },
            },
            { kind: "batch:end" },
        ]
        const f = extractMcpFindings(rows)
        expect(f.length).toBe(1)
        expect(f[0].category).toBe("M")
        expect(f[0].actual).toContain("TypeError: boom")
    })
})

describe("report-emit — countMcpProbes", () => {
    it("counts probe:result rows and splits pass/fail", () => {
        const rows = [
            { kind: "batch:start" }, // ignored
            { kind: "probe:result", ok: true, probe: "a" },
            { kind: "probe:result", ok: true, probe: "b" },
            { kind: "probe:result", ok: false, probe: "c", error: { message: "x" } },
            { kind: "batch:end" }, // ignored
        ]
        expect(countMcpProbes(rows)).toEqual({ probeCount: 3, passed: 2, failed: 1 })
    })
    it("returns zero counts for an empty/undefined input", () => {
        expect(countMcpProbes([])).toEqual({ probeCount: 0, passed: 0, failed: 0 })
        expect(countMcpProbes(undefined)).toEqual({ probeCount: 0, passed: 0, failed: 0 })
    })
})

describe("report-emit — buildReport", () => {
    const { findings, stats } = extractFindings(makeFixture(), {
        categoryMap: CATEGORY_MAP,
        severityDefaults: SEVERITY_DEFAULTS,
    })
    const md = buildReport({
        findings,
        stats,
        meta: {
            runId: "20260527-2200",
            runDate: "2026-05-27T22:00:00Z",
            baseUrl: "https://www.centralreform.live",
            sha: "1b2d5e0556",
            surface: "web",
            categories: "B,H,D",
        },
        cleanup: [],
    })

    it("includes every cowork-schema header line", () => {
        expect(md).toContain("# Stress-test report — 20260527-2200")
        expect(md).toContain("**Run date:** 2026-05-27T22:00:00Z")
        expect(md).toContain("**Authed-as (UI):**")
        expect(md).toContain("**Authed-as (MCP, test counterparties):**")
        expect(md).toContain("**Viewport observed:**")
        expect(md).toContain("**Master SHA at run:** 1b2d5e0556")
        expect(md).toContain("**Cleanup state:**")
    })

    it("includes the Summary stats line with correct counts", () => {
        expect(md).toContain("- Probes executed: 4")
        expect(md).toContain("Findings: 2 (BLOCKER:0 / HIGH:1 / MED:0 / LOW:1 / INFO:0)")
        expect(md).toContain("2 passed / 1 failed / 1 skipped / 0 flaky")
    })

    it("includes the cleanup table with the empty-state row", () => {
        expect(md).toContain("## Setlists/library entries created + deleted")
        expect(md).toContain("| Kind | id / title | Created | Deleted | Notes |")
        expect(md).toContain("_web specs are read-only")
    })

    it("renders per-category finding blocks with all six fields", () => {
        expect(md).toContain("### Category B — Perform render sweep")
        expect(md).toContain("#### F-001 —")
        expect(md).toContain("- **SUT:**")
        expect(md).toContain("- **Severity:** HIGH")
        expect(md).toContain("- **Repro:**")
        expect(md).toContain("- **Expected:**")
        expect(md).toContain("- **Actual:**")
        expect(md).toContain("- **Hypothesis:**")
    })

    it("renders the clean-run message when there are no findings", () => {
        const clean = buildReport({ findings: [], stats: { testCount: 3, passed: 3 }, meta: {} })
        expect(clean).toContain("_No findings — all probes passed clean._")
    })

    it("renders a Manual cleanup needed block for created-but-undeleted rows", () => {
        const withOrphan = buildReport({
            findings: [],
            stats: {},
            meta: {},
            cleanup: [{ kind: "setlist", id: "STRESS-x (abc)", created: "t1", deleted: "" }],
        })
        expect(withOrphan).toContain("## Manual cleanup needed")
        expect(withOrphan).toContain("STRESS-x (abc)")
    })
})

describe("report-emit — emitReport (fs)", () => {
    it("writes REPORT-stress-<run-id>.md and merges web + mcp findings", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stress-emit-"))
        const resultsPath = path.join(dir, "pw.json")
        const mcpPath = path.join(dir, "mcp.jsonl")
        await fs.writeFile(resultsPath, JSON.stringify(makeFixture()), "utf8")
        await fs.writeFile(
            mcpPath,
            [
                JSON.stringify({ kind: "batch:start" }),
                JSON.stringify({
                    kind: "probe:result",
                    probe: "probes/dedup.mjs",
                    ok: false,
                    error: { name: "Error", message: "refused" },
                }),
            ].join("\n"),
            "utf8",
        )

        const res = await emitReport({
            resultsPath,
            mcpJsonlPath: mcpPath,
            outDir: path.join(dir, "out"),
            runId: "testrun",
            meta: { baseUrl: "https://www.centralreform.live", surface: "both" },
            categoryMap: CATEGORY_MAP,
            severityDefaults: SEVERITY_DEFAULTS,
        })

        expect(res.path.endsWith("REPORT-stress-testrun.md")).toBe(true)
        const onDisk = await fs.readFile(res.path, "utf8")
        expect(onDisk).toBe(res.report)
        // 2 web findings + 1 mcp finding, renumbered F-001..F-003
        expect(res.findings.length).toBe(3)
        expect(res.findings.map((f) => f.id)).toEqual(["F-001", "F-002", "F-003"])
        expect(onDisk).toContain("### Category M — MCP tool surface")
    })

    it("rolls MCP probe counts into stats so 'Probes executed' is the total surface count", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stress-emit-"))
        const mcpPath = path.join(dir, "mcp.jsonl")
        await fs.writeFile(
            mcpPath,
            [
                JSON.stringify({ kind: "batch:start" }),
                JSON.stringify({ kind: "probe:result", probe: "a", ok: true }),
                JSON.stringify({ kind: "probe:result", probe: "b", ok: true }),
                JSON.stringify({ kind: "probe:result", probe: "c", ok: true }),
                JSON.stringify({ kind: "batch:end" }),
            ].join("\n"),
            "utf8",
        )
        const res = await emitReport({
            // resultsPath omitted — surface=mcp scenario, no Playwright JSON.
            mcpJsonlPath: mcpPath,
            outDir: path.join(dir, "out"),
            runId: "mcp-only",
            meta: { surface: "mcp" },
        })
        expect(res.stats.testCount).toBe(3)
        expect(res.stats.passed).toBe(3)
        expect(res.stats.failed).toBe(0)
        expect(res.findings.length).toBe(0)
        expect(res.report).toContain("- Probes executed: 3")
        expect(res.report).toContain("3 passed / 0 failed")
    })

    it("produces a valid report even when the results file is missing", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stress-emit-"))
        const res = await emitReport({
            resultsPath: path.join(dir, "does-not-exist.json"),
            outDir: path.join(dir, "out"),
            runId: "empty",
            meta: {},
        })
        expect(res.findings.length).toBe(0)
        expect(res.report).toContain("results file unreadable")
        expect(res.report).toContain("_No findings")
    })
})

describe("report-emit — SEVERITY_ORDER export", () => {
    it("is the canonical 5-level scale", () => {
        expect(SEVERITY_ORDER).toEqual(["BLOCKER", "HIGH", "MED", "LOW", "INFO"])
    })
})
