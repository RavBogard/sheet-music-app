#!/usr/bin/env node
/**
 * Stress-harness rework — DESIGN D1: one re-runnable stress orchestrator.
 *
 *   npm run stress                       # web surface, all categories, prod
 *   npm run stress -- --categories=B,H   # just Perform-render + Offline
 *   npm run stress -- --surface=both --bearer=$CRL_MCP_TOKEN
 *   npm run stress -- --dry-run          # print the plan, run nothing (CI-safe)
 *
 * What it does (v1 = WEB surface):
 *   1. Resolves the cowork stress CATEGORIES (A,B,C,…) → existing `e2e/*.spec.ts`
 *      via the disjoint map below. `--categories=` filters; default = all.
 *   2. Runs the selected specs through Playwright projects `ipad-webkit`
 *      (820×1180 portrait) + `ipad-webkit-landscape` against the deployed
 *      target (`PLAYWRIGHT_USE_REMOTE=1`), emitting JSON to a results file.
 *   3. (`--surface=mcp|both`) runs any `cycle-4/harness/probes/*.mjs` through
 *      probe-batch.mjs → JSONL. v1 ships ZERO probe modules (Lane C
 *      fast-follow), so this no-ops with a clear note unless probes exist.
 *   4. Feeds both into `lib/report-emit.mjs` → one cowork-shape
 *      `REPORT-stress-<run-id>.md` in the (gitignored) `out/` dir.
 *
 * Reuses existing primitives per the DESIGN — it does NOT rebuild iPad
 * viewport / auth / offline / long-press; those already live in
 * `playwright.config.ts` + the `e2e/` specs + `cycle-4/harness/lib/`.
 *
 * Tier-1 test-infra: zero `src/` runtime surface. Pure plan-building helpers
 * (buildPlan / deriveCategoryMap / deriveSeverityDefaults / parseArgs) are
 * exported for unit testing without spawning a browser.
 */

import { spawnSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { emitReport, SEVERITY_ORDER } from "../lib/report-emit.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// scripts → harness → cycle-4 → <repo>. The repo root holds
// playwright.config.ts (its `ipad-webkit` projects) + the e2e/ specs, so
// Playwright + probe-batch MUST be spawned from there. HARNESS_DIR is only
// used for the harness-local `out/` dir + the local-SHA probe.
const HARNESS_DIR = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(HARNESS_DIR, "..", "..")

/**
 * Cowork stress categories → the existing e2e specs that cover them.
 * DISJOINT (each spec lives in exactly one category) so `--categories`
 * selection + the per-finding category label are unambiguous. The cowork
 * PROMPT letters are preserved; gaps (F authoring, G dedicated-ergonomics,
 * I monitor, J a11y-axe) are documented as Lane-C fast-follow, not faked.
 */
export const CATEGORIES = {
    A: {
        label: "Cold-start performance",
        severity: "MED",
        specs: ["perform-ipad.spec.ts"],
    },
    B: {
        label: "Perform mode + bonded-chart render sweep",
        severity: "HIGH",
        specs: [
            "perform-ipad-deep.spec.ts",
            "perform-ipad-real-setlists.spec.ts",
            "perform-flow.spec.ts",
            "ipad-stuck-spinner-probe.spec.ts",
        ],
    },
    C: {
        label: "Live Director gesture",
        severity: "HIGH",
        specs: ["live-director-gesture.spec.ts"],
    },
    D: {
        label: "Library workflow + chart search",
        severity: "MED",
        specs: ["library-ipad.spec.ts", "library-review-flow.spec.ts"],
    },
    E: {
        label: "Setlist editing + chart-bind picker",
        severity: "MED",
        specs: [
            "chart-bind-ipad.spec.ts",
            "chart-bind-picker.spec.ts",
            "gig-packet-print.spec.ts",
            "f023-live-rename.spec.ts",
        ],
    },
    F: {
        label: "Authoring (Scraper / UploadDialog)",
        severity: "MED",
        specs: ["authoring-stress.spec.ts"],
    },
    H: {
        label: "Offline behavior",
        severity: "HIGH",
        specs: [
            "perform-ipad-offline.spec.ts",
            "r1-offline-decisive.spec.ts",
            "perform-ipad-pwa-fresh-install.spec.ts",
        ],
    },
    I: {
        label: "Role-gate matrix (3-of-4 roles)",
        severity: "HIGH",
        specs: ["role-gate.spec.ts", "role-gate-matrix.spec.ts"],
    },
    J: {
        label: "Accessibility (axe-core sweep)",
        severity: "MED",
        specs: ["axe-stress.spec.ts"],
    },
    K: {
        label: "Onboarding (QR / fresh device)",
        severity: "MED",
        specs: ["onboarding-qr-ipad.spec.ts"],
    },
    L: {
        label: "Large-setlist stress",
        severity: "MED",
        specs: ["stress-ipad.spec.ts"],
    },
    S: {
        label: "Smoke (fast public sanity)",
        severity: "MED",
        specs: ["smoke.spec.ts"],
    },
}

/**
 * Documented coverage gaps the cowork PROMPT has but no dedicated spec yet.
 * Lane C (`7d0af39e91` follow-on) CLOSED F/I/J/M; G + Monitor-UI-shape remain
 * residual gaps. Surfaced in --dry-run / --help so the gap is visible, not
 * silently dropped.
 */
export const COVERAGE_GAPS = {
    G: "iPad touch-target ergonomics audit — woven into B today; no dedicated spec (future lane)",
    N: "Monitor surface UI-shape (panel render / fader affordance) — covered by CFC cowork runs, no Playwright spec yet (future lane)",
}

export const DEFAULT_BASE_URL = "https://www.centralreform.live"
export const DEFAULT_PROJECTS = ["ipad-webkit", "ipad-webkit-landscape"]

/** Minimal `--flag` / `--flag=value` parser. */
export function parseArgs(argv) {
    const flags = {}
    for (const arg of argv) {
        const m = arg.match(/^--([^=]+)(?:=(.*))?$/)
        if (m) flags[m[1]] = m[2] === undefined ? true : m[2]
    }
    return flags
}

/** spec-basename → { category, label } for the emitter (inverse of CATEGORIES). */
export function deriveCategoryMap() {
    const map = {}
    for (const [letter, def] of Object.entries(CATEGORIES)) {
        for (const spec of def.specs) {
            map[spec] = { category: letter, label: def.label }
        }
    }
    return map
}

/** category-letter → default failure severity. */
export function deriveSeverityDefaults() {
    const out = {}
    for (const [letter, def] of Object.entries(CATEGORIES)) out[letter] = def.severity
    return out
}

/**
 * Build the run plan: which categories, which deduped spec files (as
 * `e2e/<spec>` paths), and the projects to run.
 * @param {object} opts
 * @param {string} [opts.categories] — comma list of letters, or undefined = all
 * @param {string[]} [opts.projects]
 * @returns {{ categories:string[], specs:string[], projects:string[], unknown:string[] }}
 */
export function buildPlan({ categories, projects = DEFAULT_PROJECTS } = {}) {
    const all = Object.keys(CATEGORIES)
    let selected = all
    const unknown = []
    if (categories) {
        selected = []
        for (const raw of String(categories).split(",")) {
            const letter = raw.trim().toUpperCase()
            if (!letter) continue
            if (CATEGORIES[letter]) selected.push(letter)
            else unknown.push(letter)
        }
    }
    // Dedupe specs across categories (disjoint today, but stay robust).
    const seen = new Set()
    const specs = []
    for (const letter of selected) {
        for (const spec of CATEGORIES[letter].specs) {
            if (seen.has(spec)) continue
            seen.add(spec)
            specs.push(`e2e/${spec}`)
        }
    }
    return { categories: selected, specs, projects, unknown }
}

function helpText() {
    const cats = Object.entries(CATEGORIES)
        .map(([l, d]) => `    ${l}  ${d.label} (${d.specs.length} spec${d.specs.length === 1 ? "" : "s"}, default ${d.severity})`)
        .join("\n")
    const gaps = Object.entries(COVERAGE_GAPS)
        .map(([l, d]) => `    ${l}  ${d}`)
        .join("\n")
    return `stress-run — one re-runnable iPad/web stress matrix → cowork-shape REPORT.

Usage:
  npm run stress [-- <flags>]

Flags:
  --surface=web|mcp|both   default: web (mcp = Lane C fast-follow; no-ops in v1)
  --categories=A,B,…       default: all web categories
  --base-url=<url>         default: ${DEFAULT_BASE_URL}
  --bearer=<token>         MCP_BEARER for authed specs (admin token at fire time)
  --projects=p1,p2         default: ${DEFAULT_PROJECTS.join(",")}
  --out=<dir>              default: cycle-4/harness/out
  --run-id=<id>            default: <YYYYMMDD-HHMMSS>
  --fail-on=<severity>     exit non-zero if any finding >= severity (default: never)
  --dry-run                print the plan and exit; run nothing
  --help                   this text

Categories:
${cats}

Documented coverage gaps (Lane C fast-follow):
${gaps}
`
}

function tsRunId() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, "0")
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

/** Best-effort local tree SHA (labeled — may differ from deployed). */
function localSha() {
    try {
        const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
            cwd: HARNESS_DIR,
            encoding: "utf8",
        })
        const sha = (r.stdout ?? "").trim()
        return sha ? `${sha} (harness tree; deployed SHA may differ)` : "unknown"
    } catch {
        return "unknown"
    }
}

async function main() {
    const flags = parseArgs(process.argv.slice(2))
    if (flags.help) {
        process.stdout.write(helpText())
        return 0
    }

    const surface = String(flags.surface ?? "web").toLowerCase()
    if (!["web", "mcp", "both"].includes(surface)) {
        console.error(`stress-run: --surface must be web|mcp|both (got "${surface}")`)
        return 2
    }
    const baseUrl = flags["base-url"] ?? DEFAULT_BASE_URL
    const bearer = flags.bearer ?? process.env.MCP_BEARER
    const projects = flags.projects
        ? String(flags.projects).split(",").map((s) => s.trim()).filter(Boolean)
        : DEFAULT_PROJECTS
    const runId = flags["run-id"] ?? tsRunId()
    const outDir = path.resolve(
        HARNESS_DIR,
        flags.out ? String(flags.out) : "out",
    )

    const plan = buildPlan({ categories: flags.categories, projects })
    if (plan.unknown.length) {
        console.error(
            `stress-run: ignoring unknown categories: ${plan.unknown.join(", ")} (known: ${Object.keys(CATEGORIES).join(",")})`,
        )
    }

    const runWeb = surface === "web" || surface === "both"
    const runMcp = surface === "mcp" || surface === "both"

    // Enumerate MCP probes up-front so `--surface=mcp --dry-run` honestly
    // surfaces what WOULD run — Lane A returned early before this enum, which
    // made the gate ("resolves the full plan") incomplete for the MCP surface.
    const probesDir = path.join(HARNESS_DIR, "probes")
    let probeFiles = []
    if (runMcp) {
        try {
            probeFiles = (await fs.readdir(probesDir))
                .filter((f) => f.endsWith(".mjs"))
                .map((f) => `cycle-4/harness/probes/${f}`)
        } catch {
            // no probes/ dir
        }
    }

    console.log("── stress-run plan ──────────────────────────────")
    console.log(`  surface     : ${surface}`)
    console.log(`  base-url    : ${baseUrl}`)
    console.log(`  bearer      : ${bearer ? "provided (authed specs enabled)" : "ABSENT (authed specs will skip/degrade)"}`)
    if (runWeb) {
        console.log(`  categories  : ${plan.categories.join(", ") || "(none)"}`)
        console.log(`  projects    : ${projects.join(", ")}`)
        console.log(`  web specs   : ${plan.specs.length}`)
        plan.specs.forEach((s) => console.log(`      • ${s}`))
    }
    if (runMcp) {
        console.log(`  mcp probes  : ${probeFiles.length}`)
        probeFiles.forEach((p) => console.log(`      • ${p}`))
    }
    console.log(`  run-id      : ${runId}`)
    console.log(`  out         : ${path.relative(HARNESS_DIR, outDir) || "."}/REPORT-stress-${runId}.md`)
    console.log("─────────────────────────────────────────────────")

    if (flags["dry-run"]) {
        console.log("[dry-run] no specs executed, no report written.")
        return 0
    }

    await fs.mkdir(outDir, { recursive: true })
    const startedAt = Date.now()

    // ── WEB surface (Playwright) ──────────────────────────────────
    let resultsPath
    if (runWeb && plan.specs.length > 0) {
        resultsPath = path.join(outDir, `playwright-results-${runId}.json`)
        const projectArgs = projects.flatMap((p) => ["--project", p])
        const args = ["playwright", "test", ...plan.specs, ...projectArgs, "--reporter=json"]
        const env = {
            ...process.env,
            PLAYWRIGHT_USE_REMOTE: "1",
            PLAYWRIGHT_BASE_URL: baseUrl,
            PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath,
        }
        if (bearer) env.MCP_BEARER = bearer
        console.log(`\n[web] npx ${args.join(" ")}`)
        const res = spawnSync("npx", args, {
            cwd: REPO_ROOT,
            env,
            stdio: "inherit",
            shell: process.platform === "win32",
        })
        // A non-zero exit just means specs failed — that is the PRODUCT
        // (findings), not a harness error. We still emit the report.
        console.log(`[web] playwright exit code: ${res.status}`)
    } else if (runWeb) {
        console.log("[web] no specs selected — skipping Playwright run.")
    }

    // ── MCP surface (probe-batch) ─────────────────────────────────
    // probeFiles was enumerated up-front (so --dry-run can honestly list them).
    let mcpJsonlPath
    if (runMcp) {
        if (probeFiles.length === 0) {
            console.log(
                "[mcp] no probe modules under cycle-4/harness/probes/ — MCP stress is a Lane-C fast-follow; skipping (v1 web-first).",
            )
        } else {
            mcpJsonlPath = path.join(outDir, `mcp-findings-${runId}.jsonl`)
            const args = [
                "cycle-4/harness/scripts/probe-batch.mjs",
                `--base-url=${baseUrl}`,
                ...(bearer ? [`--bearer=${bearer}`] : []),
                ...probeFiles,
            ]
            console.log(`\n[mcp] node ${args.join(" ")}`)
            const res = spawnSync("node", args, {
                cwd: REPO_ROOT,
                encoding: "utf8",
            })
            await fs.writeFile(mcpJsonlPath, res.stdout ?? "", "utf8")
            console.log(`[mcp] probe-batch exit code: ${res.status} → ${path.relative(HARNESS_DIR, mcpJsonlPath)}`)
        }
    }

    // ── Emit the cowork-shape report ──────────────────────────────
    const { path: reportPath, findings, stats } = await emitReport({
        resultsPath,
        mcpJsonlPath,
        outDir,
        runId,
        meta: {
            runDate: new Date().toISOString(),
            baseUrl,
            sha: localSha(),
            surface,
            categories: plan.categories.join(",") || "(none)",
            authedUi: bearer
                ? "admin/leader session via MCP_BEARER (mintSession in-spec)"
                : "public / unauthenticated (no bearer supplied)",
            authedMcp: runMcp ? "test counterparties via probe-batch (if probes present)" : "n/a (web surface only)",
            durationMs: Date.now() - startedAt,
        },
        categoryMap: deriveCategoryMap(),
        severityDefaults: deriveSeverityDefaults(),
        cleanup: [],
    })

    console.log(`\n✓ report: ${path.relative(HARNESS_DIR, reportPath)}`)
    console.log(
        `  ${stats.testCount ?? 0} probes · ${findings.length} findings · ${stats.failed ?? 0} failed / ${stats.skipped ?? 0} skipped`,
    )

    // ── Optional --fail-on gate ───────────────────────────────────
    if (flags["fail-on"]) {
        const threshold = String(flags["fail-on"]).toUpperCase()
        const rank = SEVERITY_ORDER.indexOf(threshold)
        if (rank === -1) {
            console.error(`stress-run: --fail-on must be one of ${SEVERITY_ORDER.join("|")}`)
            return 2
        }
        const tripped = findings.filter(
            (f) => SEVERITY_ORDER.indexOf(f.severity) <= rank,
        )
        if (tripped.length) {
            console.error(
                `[fail-on] ${tripped.length} finding(s) at or above ${threshold} → exit 1`,
            )
            return 1
        }
    }

    return 0
}

// Only run when invoked as a CLI (`node stress-run.mjs` / `npm run stress`),
// NOT when imported for its exported plan helpers (unit tests).
const invokedDirectly =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
    main()
        .then((code) => process.exit(code))
        .catch((err) => {
            console.error("stress-run: fatal:", err)
            process.exit(2)
        })
}

export { main }
