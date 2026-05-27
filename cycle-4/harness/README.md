# Stress harness (`cycle-4/harness/`)

One re-runnable iPad/web stress matrix that drives the **existing** Playwright
`e2e/*.spec.ts` suite against the deployed app and emits a single
**cowork-shape `REPORT-stress-<run-id>.md`** — so a `npm run stress` run and
any residual cowork-driver run are triage-identical for the supervisor.

> **This is the documented, one-command path for iPad-critical coverage.**
> Per the harness-rework DESIGN (`.coord/audits/stress-harness-rework-DESIGN.md`),
> CFC (Claude-for-Chrome) does NOT replicate the iPad viewport / offline /
> long-press / role-gate; the Playwright `ipad-webkit` project (820×1180
> WebKit) does. Reach for `npm run stress` for those categories — not CFC.

## Quick start

```bash
# one-time: install Playwright + browsers (idempotent)
bash cycle-4/harness/install-harness.sh

# full web matrix against prod (no auth → authed specs self-skip)
npm run stress

# just the launch-critical categories, with an admin bearer for authed specs
npm run stress -- --categories=B,C,H --bearer="$CRL_MCP_TOKEN"

# see the plan without running anything (CI-safe)
npm run stress -- --dry-run

# full flag reference
npm run stress -- --help
```

The report lands in `cycle-4/harness/out/REPORT-stress-<run-id>.md` (gitignored).

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--surface=web\|mcp\|both` | `web` | which surface(s) to stress. **v1 = web**; `mcp`/`both` no-op until probe modules land under `probes/` (Lane C). |
| `--categories=A,B,…` | all | comma list of cowork category letters (see table below). |
| `--base-url=<url>` | `https://www.centralreform.live` | deployed target (`PLAYWRIGHT_USE_REMOTE=1` is set automatically). |
| `--bearer=<token>` | `$MCP_BEARER` | admin/leader MCP bearer; authed specs read it as `MCP_BEARER`. Without it they skip/degrade. |
| `--projects=p1,p2` | `ipad-webkit,ipad-webkit-landscape` | Playwright projects to run. |
| `--out=<dir>` | `cycle-4/harness/out` | report + raw-artifact destination. |
| `--run-id=<id>` | `<YYYYMMDD-HHMMSS>` UTC | run identifier embedded in the filename + report header. |
| `--fail-on=<severity>` | (never) | exit non-zero if any finding ≥ this severity. Use in CI gates. |
| `--dry-run` | off | print the plan, run nothing. |

## Category → spec routing

The orchestrator maps the cowork PROMPT categories to the existing specs
(disjoint — each spec lives in exactly one category):

| Letter | Category | Specs |
|--------|----------|-------|
| A | Cold-start performance | `perform-ipad.spec.ts` |
| B | Perform mode + bonded-chart render sweep | `perform-ipad-deep`, `perform-ipad-real-setlists`, `perform-flow`, `ipad-stuck-spinner-probe` |
| C | Live Director gesture | `live-director-gesture.spec.ts` |
| D | Library workflow + chart search | `library-ipad`, `library-review-flow` |
| E | Setlist editing + chart-bind picker | `chart-bind-ipad`, `chart-bind-picker`, `gig-packet-print`, `f023-live-rename` |
| H | Offline behavior | `perform-ipad-offline`, `r1-offline-decisive`, `perform-ipad-pwa-fresh-install` |
| K | Onboarding (QR / fresh device) | `onboarding-qr-ipad.spec.ts` |
| L | Large-setlist stress | `stress-ipad.spec.ts` |
| S | Smoke (fast public sanity) | `smoke.spec.ts` |

**Documented coverage gaps (Lane C fast-follow — surfaced by `--help`, not faked):**

| Letter | Gap |
|--------|-----|
| F | Authoring flow (Scraper / UploadDialog) — no spec yet |
| G | iPad touch-target ergonomics audit — woven into B today; no dedicated spec |
| I | Monitor surface UI-shape / role-gate — no spec yet |
| J | Accessibility (axe-core) — `runAxe.mjs` exists; not yet wired into stress-run |
| M | MCP tool surface — probe modules under `probes/` are Lane C |

## How a Playwright run becomes cowork findings

`lib/report-emit.mjs` consumes the Playwright JSON reporter output and maps it
to the cowork finding model:

- A **failed / timed-out** test → a finding (`source: failure`).
- A test carrying a **`FINDING`-type annotation** → a finding
  (`source: annotation`) — fires even on a *passing* test, matching the
  existing `testInfo.annotations.push({ type: 'FINDING', … })` convention in
  `e2e/chart-bind-ipad.spec.ts` etc.
- A **clean pass** counts toward "Probes executed" but is **not** a finding.
- **Skipped** tests count as probes, not findings.

**Annotation overrides** a spec can push to enrich a finding (all optional):

| Annotation `type` | Effect |
|-------------------|--------|
| `FINDING` | raises a soft finding; `description` becomes the **Actual** text |
| `severity` | overrides severity (`BLOCKER\|HIGH\|MED\|LOW\|INFO`); else the per-category default |
| `category` | overrides the category letter bucket |
| `repro` | overrides the **Repro** line |
| `hypothesis` | overrides the **Hypothesis** line |

Severity for a bare failure defaults to the category's default (B/C/H = `HIGH`,
others = `MED`); override per-test with a `severity` annotation.

## Report schema (`REPORT-stress-<run-id>.md`)

Mirrors `.paul/research/cowork-stress-test-2026-05-26/PROMPT-web-stress-test.md`
§ "Report format":

```markdown
# Stress-test report — <run-id>

**Run date:** <iso>
**Harness:** Playwright ipad-webkit (+landscape) — `npm run stress`
**Surface(s):** web
**Authed-as (UI):** …
**Authed-as (MCP, test counterparties):** …
**Viewport observed:** 820×1180 portrait (ipad-webkit) + 1180×820 landscape …
**Base URL:** …
**Master SHA at run:** …
**Categories run:** …
**Cleanup state:** …

## Summary
- Probes executed: <n>
- Findings: <n> (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Pass/fail: <p> passed / <f> failed / <s> skipped / <fl> flaky
- Findings by category: …
- Duration: <s>s

## Setlists/library entries created + deleted
| Kind | id / title | Created | Deleted | Notes |
| … (empty-state row when read-only) |

## Findings
### Category B — Perform mode + bonded-chart render sweep
#### F-001 — <title>
- **SUT:** <spec › project>
- **Severity:** HIGH
- **Repro:** <viewport; spec; test>
- **Expected:** Test passes: "<title>"
- **Actual:** [failed] <error message, ANSI-stripped>
- **Hypothesis:** …
- **Detected via:** failure | annotation | mcp

## Manual cleanup needed   ← only if a cleanup row was created-but-not-deleted
```

Findings are numbered `F-001..` in deterministic `(category, severity, SUT,
title)` order and grouped into per-category sections.

## Files

| File | Role |
|------|------|
| `scripts/stress-run.mjs` | **D1** orchestrator (`npm run stress`). Pure plan helpers (`buildPlan`, `deriveCategoryMap`, …) are exported + unit-tested. |
| `lib/report-emit.mjs` | **D2** cowork-shape report emitter. Pure core (`extractFindings`, `buildReport`) + `emitReport` fs wrapper. |
| `lib/probe.mjs` | `mintSession` auth bootstrap (Web-SDK signin) — reused by MCP probes. |
| `lib/runAxe.mjs` | inline axe-core injection (CSP-safe) for a11y sweeps. |
| `scripts/probe-batch.mjs` | sequential MCP probe runner → JSONL (consumed by the emitter for `--surface=mcp`). |
| `scripts/aggregate.py` | legacy JSONL→markdown summarizer (pre-rework; kept for raw probe triage). |
| `out/` | gitignored run artifacts (report + raw Playwright JSON + MCP JSONL). |

## Tier

Tier-1 **test-infra only** — zero `src/` runtime surface. Unit tests
(`lib/__tests__/report-emit.test.mjs`, `scripts/__tests__/stress-run.test.mjs`)
run in the default `vitest` suite (no browser).
