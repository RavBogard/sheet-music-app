# Lane: pgr03-alerting (coder-2) — Tier 1

## Context
PGR-03 + PGR-11 from `.paul/research/product-gap-robustness-FINDINGS.md`: CRC is a
solo-maintainer service and **alerts reach nobody**. Sentry is now **confirmed live
in prod** (PGR-02 resolved — DSN inlined into the deployed build), so wiring
`captureException` is the cheap, correct path to "alerting reaches Daniel."

Verified at origin/master (`cbf5cd704`):
- `chart_bond_alerts` is **write-only with no reader** — written once at
  `src/app/api/cron/verify-chart-bond-health/route.ts:193` (`db.collection("chart_bond_alerts").add(...)`),
  on write-failure only a `logger`. Nobody is ever notified.
- `src/app/perform/error.tsx` **swallows the band's hot-route errors** — prop is
  `_error` (unused underscore), no `captureException`. A chart-render crash on an
  iPad mid-service never reaches Sentry.
- Crons with **no** Sentry: `verify-chart-bond-health`, `scheduling-reminder`,
  `admin-consistency`, (and `backup` — coder-5's new lane owns that one, do NOT touch).
  Crons that already capture: aggregate-corrections, ai-enrich-retry, drive-sync,
  enrich, sync (use these as the pattern reference).

## Scope — EDIT (all disjoint from the in-flight lanes)
1. **`src/app/perform/error.tsx`** (PGR-11) — rename `_error`→`error`, add a
   `useEffect` that `Sentry.captureException(error)` on mount so the band's
   chart-render failures surface. Keep the existing UI verbatim.
2. **`src/app/api/cron/verify-chart-bond-health/route.ts`** (PGR-03 core) — when an
   alert is written to `chart_bond_alerts`, ALSO `captureException` (or a Sentry
   message with the alert payload) so the unread queue reaches Daniel via live Sentry.
   Also capture on the cron's own catch/error path.
3. **`src/app/api/cron/scheduling-reminder/route.ts` +
   `src/app/api/cron/admin-consistency/route.ts`** — add `captureException` on their
   catch paths (mirror the already-instrumented crons). These currently fail silently.

## Seam (note, don't implement)
PGR-01 (coder-5) writes a `backups/{date}` audit doc — a future backup-staleness
alert reads that. Out of scope here; record the seam in your SHIP-NOTICE so it can be
layered once PGR-01 lands.

## Acceptance
- `perform/error.tsx` captures to Sentry on render error (test or code-review proof;
  state the deployed limit — needs a forced render error to see it live).
- `chart_bond_alerts` write path + the 3 crons all route failures through
  `captureException` (code review + the existing-cron pattern match).
- `next build --webpack` clean; touched-area tests green.
- **Deployed probe:** the crons still 401 without `CRON_SECRET` (auth unchanged).

## Hard rules
Use the EXISTING Sentry import pattern (don't re-init Sentry — it's already wired).
Do NOT touch `backup/route.ts` (coder-5), `vercel.json`, `firestore.rules`,
`index.ts` (no overlap needed → no claims). `bridge/**`, `errors.ts` read-only. Keep
each cron's auth + behavior otherwise unchanged. Tier 1.
