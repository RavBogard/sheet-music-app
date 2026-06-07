# Cycle-8-fixes — Lane 1 (config-regression fixes + chart-bond sanity)

**You are coder-1.** Single-lane wave. Sign messages `from coder-1`.
**Anchor:** branch off `origin/master` @ `edb24a47c` (NOT the canonical
checkout — it's parked on a stale branch). Use a fresh `git worktree`.
**Bearer:** read `~/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers`
row `ASSIGNMENT=cycle-8-fixes-lane-1` (8h TTL, expires 2026-05-20T07:14:59Z).
Mark it `ASSIGNMENT=burned` on SHIP. Curl shape + SSE-strip + Accept-header
gotcha are in that file's header.
**Source of truth:** `.paul/research/cycle-8-TRIAGE.md` (this lane = §1 + the
C8I2-004 ride-along from §2).
**Verification tier:** Tier-1 (real config + src + deploy; no credential
surface). Deployed-surface REPROs required on SHIP.

---

## Mission

Two HIGH regression-of-shipped-fixes from cycle-8 probing, plus one cheap
logically-coupled ride-along. All facts below were verified by supervisor
against `git show origin/master:<file>` @ `edb24a47c` — trust the line refs.

### Task 1 — C8I2-001 (HIGH): register the chart-bond cron in vercel.json

The route `src/app/api/cron/verify-chart-bond-health/route.ts` is deployed
(prod returns 401 + `x-matched-path`) but has NO entry in `vercel.json:crons[]`,
so Vercel never schedules it. The route docstring + `CRON_SECRET` Bearer auth
(line ~30) confirm the intended schedule is `0 15 * * 4` (Thursday 15:00 UTC).
Other crons use the same CRON_SECRET pattern; Vercel injects it automatically —
so the vercel.json entry alone is sufficient, no env work.

**Patch:** add to `vercel.json:crons[]`:
```json
{ "path": "/api/cron/verify-chart-bond-health", "schedule": "0 15 * * 4" }
```
Materializes on push (Vercel auto-deploys master per project convention).

### Task 2 — C8I2-002 (HIGH): fix suggest_band index direction

`src/lib/mcp/tools/roster.ts:749` queries `.orderBy("assignedAt", "desc")`,
but `firestore.indexes.json` ships `scheduling_assignments(status ASCENDING,
assignedAt ASCENDING)` — `assignedAt` must be `DESCENDING`. Result:
`suggest_band` returns `500 / 9 FAILED_PRECONDITION` at prod (the original
C7I1-004 bug, regressed). The operator hint at `roster.ts:847` also wrongly
reads "(status ASC, assignedAt ASC)".

**Patch (all three):**
1. In `firestore.indexes.json`, flip the `scheduling_assignments` composite's
   `assignedAt` field from `ASCENDING` → `DESCENDING`. (Leave `status` ASC.)
2. In `roster.ts:847`, correct the hint string to `(status ASC, assignedAt DESC)`.
3. **Deploy the index** — `firebase deploy --only firestore:indexes --project
   crcmusiccharts` (automatable per `[[feedback_firebase_cli]]`; NOT a human
   checkpoint). c8i2 flagged Lane-4 may never have run this deploy, so the JSON
   edit alone won't materialize the index — you MUST run the deploy and confirm
   the new composite shows in `firebase firestore:indexes`.

### Task 3 — C8I2-004 (MED, RIDE-ALONG): chart-bond breach formula

In the SAME route file as Task 1, the per-setlist breach test at
`route.ts:176` is `s.trackCount > 0 && s.okCount / s.trackCount < 0.7`
(`PER_SETLIST_OK_THRESHOLD`), and the aggregate (lines ~148-149, 168-169,
threshold `AGGREGATE_OK_THRESHOLD = 0.8`) uses the same `okCount/trackCount`
denominator. On a typical Shabbat-morning service ~16/30 rows are intentional
unbonded section markers, so a setlist with 13/14 bonds healthy (92.9%) scores
43% and false-fires. `PerSetlistSummary` already carries `bondedCount`.

**Patch:** switch the denominator from `trackCount` to `bondedCount` for both
the per-setlist breach test and the aggregate, and add a floor so stub setlists
don't alert (e.g. only evaluate breach when `bondedCount >= 3`). Update the
`okPct` computation (line ~148) to match. Keep it minimal — denominator + floor,
no redesign.

> **Ride-along discipline:** Tasks 1+2 are the green-gate. If Task 3 balloons
> beyond a denominator/floor change, STOP, ship 1+2, and HEADS-UP the supervisor
> to defer C8I2-004 to a POLISH lane. Do not let it block the regressions.

---

## Out of scope (do NOT do here)

Everything else in TRIAGE §2/§3 is deferred POLISH: bearer-envelope cluster
(C8I1-001 / C8I2-006), template-CRUD validation (C8I1-003/4/5), reconcile
buckets (C8I2-005 / C8I2-008), trackCount drift-PRODUCER root cause (C8I2-003).
Don't touch them.

**Hard rules (binding):** do NOT touch `bridge/**`, repo-root `mcp/`,
`SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.

---

## Gates before SHIP

1. `npm run test:emulator` — full suite green (or document any pre-existing
   baseline failures as disjoint from your changeset).
2. `next build --webpack` — clean (compile + type-check).
3. **Deploys executed:** push to master (Vercel auto-deploy) + `firebase deploy
   --only firestore:indexes`.
4. **Deployed-surface REPROs (paste transcripts in SHIP-NOTICE):**
   - `suggest_band` against a real non-empty setlistId returns a ranked
     candidate list (NOT 500 / FAILED_PRECONDITION). Use a setlistId from
     `list_setlists`.
   - `git show origin/master:vercel.json` shows the new cron entry; confirm the
     Vercel dashboard lists the schedule (or note if you can't see the dashboard).
   - (Task 3) a sample `verify_setlist_charts` on a typical Shabbat setlist no
     longer trips the breach test under the new `bondedCount` denominator —
     show the before/after computed ratio.

## SHIP protocol

1. Single clean commit (or minimal commits); cherry-pick onto fresh
   `origin/master` if it diverged (narrow-lane caveat in `master-tip.md`).
2. Push to `origin master` (NOT `master:main`).
3. OVERWRITE `.coord/shared/master-tip.md` with the new SHA per its update protocol.
4. Drop a SHIP-NOTICE to `.coord/inbox/supervisor.md` (signed `from coder-1`)
   with the REPRO transcripts.
5. Mark your bearer row `ASSIGNMENT=burned` in `.supervisor-bearers`.
6. Hold your worktree for teardown until auditor ACCEPT + supervisor go-ahead
   (`[[feedback_worktree_teardown_timing]]`).

File contention: none — single lane. Files you'll touch: `vercel.json`,
`firestore.indexes.json`, `src/app/api/cron/verify-chart-bond-health/route.ts`,
`src/lib/mcp/tools/roster.ts`.
