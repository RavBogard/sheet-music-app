/**
 * Stress-harness rework — DESIGN D2: cowork-REPORT-shape emitter.
 *
 * Consumes a Playwright JSON-reporter result file (+ optionally the MCP
 * probe JSONL emitted by `scripts/probe-batch.mjs`) and writes a
 * `REPORT-stress-<run-id>.md` whose shape matches the cowork stress-test
 * report schema (`.paul/research/cowork-stress-test-2026-05-26/PROMPT-web-stress-test.md`
 * § "Report format"). The whole point: a `npm run stress` Playwright run
 * and any residual cowork-driver run produce triage-IDENTICAL markdown so
 * the supervisor reviews both through one pipeline.
 *
 * The cowork report schema this mirrors:
 *   # …-stress-test report — <id>
 *   **Run date / Harness / Authed-as (UI) / Authed-as (MCP) / Viewport /
 *     Master SHA / Cleanup state** header block
 *   ## Summary  — probes executed, findings (BLOCKER/HIGH/MED/LOW/INFO), …
 *   ## Setlists/library entries created + deleted  — cleanup table
 *   ## Findings — per-category sections, each finding:
 *       **SUT / Severity / Repro / Expected / Actual / Hypothesis**
 *
 * Mapping Playwright → cowork findings:
 *   - A FAILED (or timedOut/interrupted) test  → a finding (source:'failure').
 *   - A test carrying a `FINDING`-type annotation → a finding
 *     (source:'annotation') — fires even on a PASSING test, matching the
 *     existing `testInfo.annotations.push({ type:'FINDING', … })` convention
 *     already used in e2e/chart-bind-ipad.spec.ts etc.
 *   - A PASSING test with no FINDING annotation is counted in
 *     "probes executed" but is NOT a finding.
 *
 * Severity / category resolution (override → default):
 *   - severity: a `severity`-type annotation wins; else the per-category
 *     default from `severityDefaults`; else MED.
 *   - category: a `category`-type annotation wins; else `categoryMap[<spec
 *     basename>]`; else the 'Z — Uncategorized' bucket.
 *
 * The core (`extractFindings`, `extractMcpFindings`, `buildReport`) is pure
 * (no I/O) so it unit-tests without a browser. `emitReport` is the thin
 * fs wrapper the orchestrator calls.
 *
 * This module lives under `cycle-4/harness/` — cowork instrumentation, NOT
 * shipped production code (Tier-1 test-infra; zero `src/` runtime surface).
 */

import { promises as fs } from "node:fs"
import path from "node:path"

/** Canonical severity ordering (high → low) for sorting + summary counts. */
export const SEVERITY_ORDER = ["BLOCKER", "HIGH", "MED", "LOW", "INFO"]

// ANSI SGR matcher: ESC (0x1B) '[' params 'm'. Built from fromCharCode so the
// source carries no raw control byte and trips no `no-control-regex` lint.
const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g")

const SEVERITY_RANK = Object.fromEntries(
    SEVERITY_ORDER.map((s, i) => [s, i]),
)

/** The 'unknown spec' bucket so an unmapped spec still reports cleanly. */
const UNCATEGORIZED = { category: "Z", label: "Uncategorized" }

/**
 * Strip ANSI escape sequences (Playwright error messages are colorized)
 * and trim, so the markdown stays readable.
 * @param {unknown} s
 * @returns {string}
 */
export function cleanText(s) {
    if (s == null) return ""
    return String(s).replace(ANSI_SGR_RE, "").trim()
}

/** Basename of a spec file path, normalizing Windows + POSIX separators. */
function specBasename(file) {
    if (!file) return ""
    return String(file).replace(/\\/g, "/").split("/").pop()
}

/**
 * Recursively flatten a Playwright JSON report's nested suites into a flat
 * list of spec objects. Each Playwright `spec` carries `.title`, `.file`,
 * `.ok`, and `.tests[]` (one per project).
 * @param {object} report — parsed Playwright JSON reporter output
 * @returns {Array<object>} flat spec list
 */
export function flattenSpecs(report) {
    const out = []
    const walk = (suite) => {
        if (!suite || typeof suite !== "object") return
        if (Array.isArray(suite.specs)) {
            for (const spec of suite.specs) out.push(spec)
        }
        if (Array.isArray(suite.suites)) {
            for (const child of suite.suites) walk(child)
        }
    }
    if (report && Array.isArray(report.suites)) {
        for (const suite of report.suites) walk(suite)
    }
    return out
}

/** Collect annotations from a test object (test-level + result-level). */
function collectAnnotations(test) {
    const anns = []
    if (Array.isArray(test?.annotations)) anns.push(...test.annotations)
    if (Array.isArray(test?.results)) {
        for (const r of test.results) {
            if (Array.isArray(r?.annotations)) anns.push(...r.annotations)
        }
    }
    return anns
}

/** First annotation whose `type` matches (case-insensitive). */
function findAnnotation(anns, type) {
    const lc = type.toLowerCase()
    return anns.find((a) => String(a?.type ?? "").toLowerCase() === lc)
}

/** Is this test result a hard failure? */
function isFailingTest(test) {
    if (test?.status === "unexpected") return true
    const results = Array.isArray(test?.results) ? test.results : []
    const last = results[results.length - 1]
    return ["failed", "timedOut", "interrupted"].includes(last?.status)
}

/** Last result's first error message + the failing status, cleaned. */
function failureActual(test) {
    const results = Array.isArray(test?.results) ? test.results : []
    const last = results[results.length - 1] ?? {}
    const errs = Array.isArray(last.errors)
        ? last.errors
        : last.error
          ? [last.error]
          : []
    const msg = cleanText(errs[0]?.message) || "(no error message captured)"
    const status = last.status ?? test?.status ?? "failed"
    // Keep the actual concise — first ~6 lines of the error message.
    const concise = msg.split("\n").slice(0, 6).join("\n")
    return `[${status}] ${concise}`
}

function normalizeSeverity(raw, fallback) {
    const up = String(raw ?? "").trim().toUpperCase()
    return SEVERITY_ORDER.includes(up) ? up : fallback
}

/**
 * Extract findings from a Playwright JSON report.
 *
 * @param {object} report — parsed Playwright JSON reporter output
 * @param {object} [opts]
 * @param {Record<string,{category:string,label:string}>} [opts.categoryMap]
 *        spec-basename → { category, label }
 * @param {Record<string,string>} [opts.severityDefaults]
 *        category-letter → default severity for FAILURES
 * @returns {{ findings: Array<object>, stats: object }}
 */
export function extractFindings(report, opts = {}) {
    const categoryMap = opts.categoryMap ?? {}
    const severityDefaults = opts.severityDefaults ?? {}

    const specs = flattenSpecs(report)
    const raw = []

    let testCount = 0
    let passed = 0
    let failed = 0
    let skipped = 0
    let flaky = 0

    for (const spec of specs) {
        const base = specBasename(spec.file)
        const mapped = categoryMap[base] ?? UNCATEGORIZED
        const tests = Array.isArray(spec.tests) ? spec.tests : []
        for (const test of tests) {
            testCount++
            const project = test.projectName ?? test.projectId ?? "default"
            const status = test.status
            if (status === "skipped") skipped++
            else if (status === "flaky") flaky++
            else if (isFailingTest(test)) failed++
            else passed++

            const anns = collectAnnotations(test)
            const catOverride = findAnnotation(anns, "category")
            const category = catOverride?.description?.trim() || mapped.category
            const label = catOverride?.description?.trim()
                ? mapped.label // override only changes the letter bucket grouping
                : mapped.label
            const sevAnn = findAnnotation(anns, "severity")
            const hypoAnn = findAnnotation(anns, "hypothesis")
            const reproAnn = findAnnotation(anns, "repro")
            const sut = `${base} › ${project}`

            // Source 1: a hard failure becomes a finding.
            if (isFailingTest(test)) {
                raw.push({
                    category,
                    categoryLabel: label,
                    title: cleanText(spec.title) || "(untitled test)",
                    sut,
                    severity: normalizeSeverity(
                        sevAnn?.description,
                        severityDefaults[category] ?? "MED",
                    ),
                    repro:
                        cleanText(reproAnn?.description) ||
                        `viewport ${project}; spec ${base}; test "${cleanText(spec.title)}"`,
                    expected: `Test passes: "${cleanText(spec.title)}"`,
                    actual: failureActual(test),
                    hypothesis:
                        cleanText(hypoAnn?.description) ||
                        "See stack trace in the saved Playwright results JSON.",
                    source: "failure",
                })
            }

            // Source 2: explicit FINDING annotations (fire even when passing).
            for (const a of anns) {
                if (String(a?.type ?? "").toLowerCase() !== "finding") continue
                raw.push({
                    category,
                    categoryLabel: label,
                    title: cleanText(spec.title) || "(untitled test)",
                    sut,
                    severity: normalizeSeverity(
                        sevAnn?.description,
                        "MED",
                    ),
                    repro:
                        cleanText(reproAnn?.description) ||
                        `viewport ${project}; spec ${base}; test "${cleanText(spec.title)}"`,
                    expected: `Test passes: "${cleanText(spec.title)}"`,
                    actual: cleanText(a.description) || "(finding annotation had no description)",
                    hypothesis:
                        cleanText(hypoAnn?.description) ||
                        "Soft finding raised by the spec via a FINDING annotation; test itself may have passed.",
                    source: "annotation",
                })
            }
        }
    }

    // Deterministic order: category letter, then severity, then SUT, then title.
    raw.sort((a, b) => {
        if (a.category !== b.category) return a.category < b.category ? -1 : 1
        const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (sr !== 0) return sr
        if (a.sut !== b.sut) return a.sut < b.sut ? -1 : 1
        return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    })

    const findings = raw.map((f, i) => ({
        id: `F-${String(i + 1).padStart(3, "0")}`,
        ...f,
    }))

    return {
        findings,
        stats: { testCount, passed, failed, skipped, flaky },
    }
}

/**
 * Extract findings from MCP probe JSONL rows (probe-batch.mjs output).
 * A probe row with `ok:false` becomes a finding. v1 is web-first so this is
 * usually empty, but the pipeline supports `--surface=mcp|both`.
 *
 * @param {Array<object>} rows — parsed JSONL rows
 * @param {object} [opts]
 * @returns {Array<object>} findings (un-numbered; merged + numbered by caller)
 */
export function extractMcpFindings(rows, opts = {}) {
    const severity = opts.severity ?? "MED"
    const out = []
    for (const row of rows ?? []) {
        if (row?.kind !== "probe:result") continue
        if (row.ok) continue
        const err = row.error ?? {}
        out.push({
            category: "M",
            categoryLabel: "MCP tool surface",
            title: `MCP probe failed: ${row.probe}`,
            sut: `${row.probe} (MCP)`,
            severity,
            repro: `node cycle-4/harness/scripts/probe-batch.mjs ${row.probe}`,
            expected: "Probe resolves ok:true",
            actual: cleanText(`${err.name ?? "Error"}: ${err.message ?? "(no message)"}`),
            hypothesis: "See probe error stack in the saved MCP JSONL.",
            source: "mcp",
        })
    }
    return out
}

/**
 * Count MCP probe rows toward the report's `Probes executed` summary so a
 * `--surface=mcp` run that passes clean doesn't say "0 probes executed" —
 * the cowork report schema's `Probes executed` is the TOTAL probe count,
 * not the Playwright-test count. (Lane A blind spot Lane C surfaces.)
 *
 * @param {Array<object>} rows
 * @returns {{ probeCount:number, passed:number, failed:number }}
 */
export function countMcpProbes(rows) {
    let probeCount = 0
    let passed = 0
    let failed = 0
    for (const row of rows ?? []) {
        if (row?.kind !== "probe:result") continue
        probeCount++
        if (row.ok) passed++
        else failed++
    }
    return { probeCount, passed, failed }
}

/** Count findings by severity. */
function severityCounts(findings) {
    const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]))
    for (const f of findings) {
        if (f.severity in counts) counts[f.severity]++
    }
    return counts
}

/** Group findings by category letter, preserving sort order. */
function groupByCategory(findings) {
    const groups = new Map()
    for (const f of findings) {
        if (!groups.has(f.category)) {
            groups.set(f.category, { label: f.categoryLabel, items: [] })
        }
        groups.get(f.category).items.push(f)
    }
    return groups
}

/**
 * Build the cowork-shape markdown report string.
 *
 * @param {object} args
 * @param {Array<object>} args.findings — numbered findings from extractFindings
 * @param {object} args.stats — { testCount, passed, failed, skipped, flaky }
 * @param {object} args.meta — header fields
 * @param {Array<object>} [args.cleanup] — rows for the created+deleted table
 * @returns {string} markdown
 */
export function buildReport({ findings = [], stats = {}, meta = {}, cleanup = [] } = {}) {
    const L = []
    const runId = meta.runId ?? "unknown-run"
    L.push(`# Stress-test report — ${runId}`)
    L.push("")
    L.push(`**Run date:** ${meta.runDate ?? new Date().toISOString()}`)
    L.push(
        `**Harness:** Playwright ${meta.projects ?? "ipad-webkit (+landscape)"} — \`npm run stress\``,
    )
    L.push(`**Surface(s):** ${meta.surface ?? "web"}`)
    L.push(
        `**Authed-as (UI):** ${meta.authedUi ?? "public / unauthenticated (no bearer supplied)"}`,
    )
    L.push(
        `**Authed-as (MCP, test counterparties):** ${meta.authedMcp ?? "n/a (web surface only)"}`,
    )
    L.push(
        `**Viewport observed:** ${meta.viewport ?? "820×1180 portrait (ipad-webkit) + 1180×820 landscape (ipad-webkit-landscape)"}`,
    )
    L.push(`**Base URL:** ${meta.baseUrl ?? "(not recorded)"}`)
    L.push(`**Master SHA at run:** ${meta.sha ?? "unknown"}`)
    L.push(`**Categories run:** ${meta.categories ?? "(all)"}`)
    L.push(
        `**Cleanup state:** ${meta.cleanupState ?? "n/a — web specs are read-only / fixture-scoped"}`,
    )
    L.push("")

    const counts = severityCounts(findings)
    const countStr = SEVERITY_ORDER.map((s) => `${s}:${counts[s]}`).join(" / ")
    const catCounts = [...groupByCategory(findings).entries()]
        .map(([letter, g]) => `${letter}:${g.items.length}`)
        .join(" ")

    L.push("## Summary")
    L.push("")
    L.push(`- Probes executed: ${stats.testCount ?? 0}`)
    L.push(`- Findings: ${findings.length} (${countStr})`)
    L.push(
        `- Pass/fail: ${stats.passed ?? 0} passed / ${stats.failed ?? 0} failed / ${stats.skipped ?? 0} skipped / ${stats.flaky ?? 0} flaky`,
    )
    L.push(`- Findings by category: ${catCounts || "(none)"}`)
    if (meta.durationMs != null) {
        L.push(`- Duration: ${Math.round(meta.durationMs / 1000)}s`)
    }
    L.push("")

    L.push("## Setlists/library entries created + deleted")
    L.push("")
    L.push("| Kind | id / title | Created | Deleted | Notes |")
    L.push("|------|------------|---------|---------|-------|")
    if (cleanup.length === 0) {
        L.push(
            "| _none_ | _web specs are read-only / fixture-scoped; no Daniel-owned scratch data created_ | | | |",
        )
    } else {
        for (const row of cleanup) {
            L.push(
                `| ${row.kind ?? ""} | ${row.id ?? ""} | ${row.created ?? ""} | ${row.deleted ?? ""} | ${row.notes ?? ""} |`,
            )
        }
    }
    L.push("")

    L.push("## Findings")
    L.push("")
    if (findings.length === 0) {
        L.push("_No findings — all probes passed clean._")
        L.push("")
    } else {
        for (const [letter, group] of groupByCategory(findings)) {
            L.push(`### Category ${letter} — ${group.label}`)
            L.push("")
            for (const f of group.items) {
                L.push(`#### ${f.id} — ${f.title}`)
                L.push(`- **SUT:** ${f.sut}`)
                L.push(`- **Severity:** ${f.severity}`)
                L.push(`- **Repro:** ${f.repro}`)
                L.push(`- **Expected:** ${f.expected}`)
                L.push(`- **Actual:** ${f.actual}`)
                L.push(`- **Hypothesis:** ${f.hypothesis}`)
                L.push(`- **Detected via:** ${f.source}`)
                L.push("")
            }
        }
    }

    // Mirror any created-but-not-deleted rows under a manual-cleanup block.
    const orphans = cleanup.filter((r) => r.created && !r.deleted)
    if (orphans.length > 0) {
        L.push("## Manual cleanup needed")
        L.push("")
        for (const o of orphans) {
            L.push(`- ${o.kind ?? "item"} \`${o.id ?? "?"}\` — ${o.notes ?? "created but not deleted at end of run"}`)
        }
        L.push("")
    }

    return L.join("\n")
}

/**
 * Read a Playwright JSON results file + optional MCP JSONL, build findings,
 * and write the `REPORT-stress-<run-id>.md`.
 *
 * @param {object} args
 * @param {string} args.resultsPath — Playwright JSON results file (may be absent)
 * @param {string} [args.mcpJsonlPath] — probe-batch JSONL (optional)
 * @param {string} args.outDir — directory to write the report into
 * @param {string} args.runId
 * @param {object} args.meta — header fields (baseUrl, sha, surface, …)
 * @param {object} [args.categoryMap]
 * @param {object} [args.severityDefaults]
 * @param {Array<object>} [args.cleanup]
 * @returns {Promise<{ path:string, report:string, findings:Array<object>, stats:object }>}
 */
export async function emitReport(args) {
    const {
        resultsPath,
        mcpJsonlPath,
        outDir,
        runId,
        meta = {},
        categoryMap = {},
        severityDefaults = {},
        cleanup = [],
    } = args

    let report = { suites: [], stats: {} }
    if (resultsPath) {
        try {
            const txt = await fs.readFile(resultsPath, "utf8")
            report = JSON.parse(txt)
        } catch (err) {
            // Surface a synthetic finding so an empty/missing results file
            // is visible in the report rather than silently producing "0 findings".
            report = { suites: [], stats: {}, __readError: String(err?.message ?? err) }
        }
    }

    const { findings: webFindings, stats } = extractFindings(report, {
        categoryMap,
        severityDefaults,
    })

    let mcpFindings = []
    let mcpStats = { probeCount: 0, passed: 0, failed: 0 }
    if (mcpJsonlPath) {
        try {
            const txt = await fs.readFile(mcpJsonlPath, "utf8")
            const rows = txt
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => JSON.parse(l))
            mcpFindings = extractMcpFindings(rows)
            mcpStats = countMcpProbes(rows)
        } catch {
            // No MCP JSONL → web-only run; that's the v1 default. Stay quiet.
        }
    }
    // Roll MCP probe counts into the unified stats so the report's
    // "Probes executed" reflects the total surface count, not just Playwright.
    stats.testCount = (stats.testCount ?? 0) + mcpStats.probeCount
    stats.passed = (stats.passed ?? 0) + mcpStats.passed
    stats.failed = (stats.failed ?? 0) + mcpStats.failed

    // Merge web + mcp, re-number deterministically (web first by sort, then mcp).
    const merged = [
        ...webFindings.map((f) => {
            const { id: _id, ...rest } = f
            return rest
        }),
        ...mcpFindings,
    ]
    merged.sort((a, b) => {
        if (a.category !== b.category) return a.category < b.category ? -1 : 1
        const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (sr !== 0) return sr
        if (a.sut !== b.sut) return a.sut < b.sut ? -1 : 1
        return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    })
    const numbered = merged.map((f, i) => ({
        id: `F-${String(i + 1).padStart(3, "0")}`,
        ...f,
    }))

    const finalMeta = { runId, ...meta }
    if (report.__readError) {
        finalMeta.cleanupState =
            `⚠️ results file unreadable (${report.__readError}) — report reflects an empty run`
    }

    const markdown = buildReport({
        findings: numbered,
        stats,
        meta: finalMeta,
        cleanup,
    })

    await fs.mkdir(outDir, { recursive: true })
    const outPath = path.join(outDir, `REPORT-stress-${runId}.md`)
    await fs.writeFile(outPath, markdown, "utf8")

    return { path: outPath, report: markdown, findings: numbered, stats }
}
