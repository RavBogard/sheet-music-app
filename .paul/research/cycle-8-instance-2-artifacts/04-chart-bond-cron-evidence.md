# §2 — chart-bond cron + chart_bond_alerts evidence

Captured 2026-05-19T22:33Z; deployed SHA per master-tip = `edb24a47c`.

## §2.1 — Cron-fire status

**Wall-clock at probe:** 2026-05-19 22:33 UTC. First scheduled tick per PARENT/dispatch:
2026-05-21 15:00 UTC (Thursday `0 15 * * 4`). NOT-FIRED is the expected branch
per §2 step 2 — but a deeper issue surfaced:

### HIGH — chart-bond cron NOT REGISTERED in `vercel.json`

`origin/master` ships the route file at
`src/app/api/cron/verify-chart-bond-health/route.ts` (commit `edb24a47c`,
introduced as part of the cycle-7-fixes Lane 3 work). The route is reachable on
prod (`https://www.centralreform.live/api/cron/verify-chart-bond-health` returns
HTTP/2 401 + `x-matched-path: /api/cron/verify-chart-bond-health` — deployed and
auth-gated).

But `vercel.json:crons[]` does NOT contain an entry for this path. Full crons[]
on `origin/master`:

```json
[
  { "path": "/api/cron/sync",                   "schedule": "0 * * * *" },
  { "path": "/api/cron/drive-sync",             "schedule": "*/5 * * * *" },
  { "path": "/api/cron/enrich",                 "schedule": "0 2 * * *" },
  { "path": "/api/cron/ai-enrich-retry",        "schedule": "*/30 * * * *" },
  { "path": "/api/cron/aggregate-corrections",  "schedule": "0 */6 * * *" },
  { "path": "/api/cron/scheduling-reminder",    "schedule": "0 10 * * *" },
  { "path": "/api/cron/admin-consistency",      "schedule": "0 4 * * *" }
]
```

`git log origin/master --oneline -- vercel.json` returns ZERO commits — vercel.json
was last touched on the initial scaffold and has never received the chart-bond
cron entry. The Lane 3 PROMPT's "DOD: New cron entry in vercel.json" never
executed. The 2026-05-21 15:00 UTC first tick will NOT fire — Vercel has nothing
to schedule.

Lane 3 PROMPT excerpt (`.paul/research/cycle-7-fixes-lane-3-PROMPT.md`):

> **New cron entry:** `vercel.json` entry `/api/cron/verify-chart-bond-health`
> runs once daily (e.g. Thursday afternoon US Central, ahead of Friday service).
> ...
> - Endpoint at `src/app/api/cron/verify-chart-bond-health/route.ts` runs cleanly.
> - Emulator test covers the alert-emit path.
> - `chart_bond_alerts` Firestore collection block in `firestore.rules` (admin-read only).

The route shipped + the firestore.rules block shipped (verified: rules contain
`match /chart_bond_alerts/{alertId} { allow read: if isAdmin(); allow write: if false; }`).
The vercel.json registration is missing.

**Severity rationale:** This is a regression-of-shipped-fix per PARENT §6 — the
ship-claim from Lane 3 was that the chart-bond alerting machinery runs daily.
It doesn't. The Friday-service-eve health gate Lane 3 was supposed to deliver
silently never executes. Per the PARENT auto-revive bar, this is a candidate
for cycle-8-fixes wave.

**Patch:** add to vercel.json:crons[]:

```json
{ "path": "/api/cron/verify-chart-bond-health", "schedule": "0 15 * * 4" }
```

## §2.2 — chart_bond_alerts collection contents

No direct Firestore read tool exposed, but the implication of §2.1 is unambiguous:
the cron has never fired in production, so `chart_bond_alerts` should be empty.
(Confirm via Firebase console after fix if Daniel wants belt-and-suspenders.)

Even if the cron WERE registered, an additional issue: `list_setlists({sort:'recent_event'})`
returns ZERO setlists with `publishedAt !== null` in the most recent 10 (see
artifacts/05). The cron's query `where("publishedAt", "!=", null)` would survey
zero documents on the next tick → still no alerts. The `publishedAt` field
appears unset across the active dataset; the publish path may write it
elsewhere or not write it at all. (Cross-reference: cycle-7-fixes Lane 3 — does
`publish_setlist` actually set `publishedAt`?)

## §2.3 — Cross-check vs. `verify_setlist_charts` on a sample

Picked the largest recent setlist (cycle-7 instance-1 anchor): `UnjLqKTtS4lNKQfMY6hB`
"Shabbat Morning — Parashat Emor — May 2", reported by list_setlists as
`trackCount: 45`.

`verify_setlist_charts({setlistId:"UnjLqKTtS4lNKQfMY6hB"})` returns:
- `trackCount: 30` (← drift, see §2.4 below)
- `bondedCount: 14`
- `okCount: 13`
- `missingCount: 1` (Hallelujah Jam — `upload-f39740c1-...` not in Storage; no Drive fallback)
- `okPct = 13/30 = 43.3%` (BELOW the cron's 70% per-setlist breach threshold)

If the cron were registered AND if this setlist were `publishedAt != null`, the
cron would log a `perSetlistBreached` alert against it. Read the next two
sub-findings before treating that as correct behavior.

## §2.4 — MED — trackCount drift on UnjLqKTtS4lNKQfMY6hB

`list_setlists.trackCount = 45` vs `verify_setlist_charts.trackCount = 30`.
The denormalized counter on the setlist doc disagrees with the actual `tracks/`
subcollection length by 15. This is precisely what `recompute_setlist_track_count`
is designed to heal — see §3 below. The cron's inline self-heal would catch
this, but the cron isn't registered.

## §2.5 — LOW — per-setlist breach formula likely false-positive

The cron's per-setlist threshold formula is `okCount / trackCount < 70%`.
On a typical service like Emor, ~16 of 30 tracks are intentional `unbonded`
section-markers ("Pre Service", "Birchot HaShachar", "Drash", "Closing", etc.) —
never-bonded by design, not broken bonds.

The fair denominator for "are my bonds OK" is `bondedCount`, not `trackCount`.
By bonded count, this setlist is 13/14 = 92.9% healthy (one missing chart).
By the cron's formula, it's 43.3% — well under the 70% breach threshold,
guaranteeing an alert that does NOT correspond to a real chart-bond problem.

This is the kind of false-positive §2 step 3 asks me to surface. The formula
matches the Lane 3 PROMPT spec (so it shipped as designed), but the design
itself will fire alerts on every typical Shabbat-morning setlist regardless of
actual bond health.

Suggested fix: use `okCount / max(bondedCount, 1)` instead — that's the actual
health ratio. Pair with a minimum-bondedCount floor (e.g. only alert if
bondedCount >= 3) to suppress alerts on near-empty stub setlists.

## §2.6 — verify_setlist_charts on a non-existent setlist (sanity)

Skipping; the cycle-7 sweep already covered error-envelope shape on this tool.
