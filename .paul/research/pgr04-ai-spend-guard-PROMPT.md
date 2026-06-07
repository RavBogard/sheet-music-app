# Lane: pgr04-ai-spend-guard (coder-4) — Tier 1

## Context
PGR-04 from `.paul/research/product-gap-robustness-FINDINGS.md`. Gemini enrichment
discards token usage (no cost visibility) and PDF input is uncapped.

Verified at origin/master (`5dd02b555`), `src/lib/library/ai-enrichment.ts`:
- `ai.models.generateContent({...})` at :502, with `maxOutputTokens: MAX_OUTPUT_TOKENS`
  at :509 → **output is already capped**.
- **`response.usageMetadata` is discarded** (never captured) → no spend visibility.
- **Input is uncapped** — PDF/image sent via `inlineData` at :577 / :593 with no
  byte guard. A pathological upload can balloon cost.

Daniel's standing rule: **AI cost is REPORT, not CEILING** ([[project_ai_cost_baseline]],
decisions.md 2026-05-19). Default behavior must stay report-only — no new hard block.

## Scope — EDIT (`src/lib/library/ai-enrichment.ts` + small Firestore collection)
1. **Capture usage** — after `generateContent`, read `response.usageMetadata`
   (`promptTokenCount` / `candidatesTokenCount` / `totalTokenCount`); compute est.
   USD from Gemini 3.1 Pro pricing constants; write per-enrichment to a new
   `aiSpend/{auto}` doc (rowId, model, tokens, costUsd, ts). Server-only-write,
   admin-read (mirror `webVitalsObservations`/`aiCorrectionSignals`).
2. **Input byte cap** — before sending `inlineData` (:577/:593), enforce a byte cap
   (e.g. ~N MB). Over-cap → **skip-with-signal** (log + enqueue review), NOT an
   unbounded send. Enrichment stays fail-open + advisory.
3. **Spend report surface** — minimal: an `aiSpend` rollup readable as trailing
   7/30-day total. Reuse the `get_web_vitals_summary` shape → a small
   `get_ai_spend_summary` MCP tool (admin-only), OR just the collection + a tiny
   reader. Keep it lean.
4. *(Optional, default-OFF)* a rolling soft ceiling in `aiConfig` (default
   effectively-off per "report not ceiling"); if exceeded, pause auto-enrich +
   surface. **Default must NOT block.**

## Acceptance
- `usageMetadata` captured + `aiSpend` doc written per enrichment (emulator test).
- Input byte cap: oversized input → skipped-with-signal, **no** `generateContent`
  call; under-cap → normal (test).
- Default = report-only, no new blocking (proven).
- `firestore.rules` `aiSpend` block (admin-read/server-write). **CLAIM
  `firestore.rules`** — coder-5 (PGR-01) also adds a `backups/` block; disjoint,
  coordinate via claims.
- 7/30-day spend readable; build + emulator green.

## Hard rules
Never overwrite human-set fields; David's-subfolder authority on `collection`
preserved; enrichment stays fail-open + advisory; provider is `@google/genai`
(NOT Anthropic); `bridge/**`, `errors.ts` read-only. `index.ts` only if you add the
MCP tool (append-point; claim it).

## Tier 1
Tests + build. No deployed-probe needed (advisory path), but state the spend number
shape so Daniel can snapshot the baseline ([[project_ai_cost_baseline]]).
