# HANDOFF — v5.0-hotfix save-loss bug fully closed; paused for the day

**Date:** 2026-04-27
**Pause reason:** Bug fixed end-to-end + UAT passed. Daniel chose to pause for the day with everything else queued for resume planning.
**Branch:** master
**Last commit:** `663b4ad` (chore: STATE update marking v5h-01-03 APPLY+UAT complete)
**v5.0-hotfix milestone status:** 3 of 4 plans complete; only the postmortem (v5h-01-04) remains.

---

## What got done today (2026-04-27)

### v5h-01-02 — E+F+B fix shipped (commit `0c2921d`)
- `firestore.rules` — `match /tracks/{trackId}` + `match /songs/{songId}` blocks deployed to crcmusiccharts (band-leader/admin write, member read; no ownerId check). Closed the production permission-denied silent-fail.
- `SetlistGridHydrator.tsx` — outbox-pending guard around `db.{setlists,tracks}.put` priming.
- `snapshot-listener.ts` — strict-equality LWW guard at both setlists + tracks branches; preserves local row when `updatedAt` is undefined.
- `property-failures.test.ts` — flipped AC-1 from `it.fails` → `it` (regression lock).
- Suite 1479/1479; tsc + build clean.
- AC-4 (Daniel UAT scenario 1) initially partial-pass — see diagnostic chain below.

### Diagnostic chain that ultimately closed AC-4 for v5h-01-02
1. **Outbox audit** revealed 142 stuck rows (46 failed `permission-denied` + 96 pending blocked behind them by per-doc drain ordering) — all from BEFORE the rules deployed; engine doesn't auto-recover failed rows.
2. **Auth-token was stale** (Daniel's session token from before rules deploy didn't carry the admin claim path needed for the new rules). Sign-out/in restored `role: "admin"`.
3. **Reset-and-drain snippet** flipped 46 `failed` rows back to `pending`. Engine retried with fresh token; cell-commit edits started persisting; reconciliation modal resolved precondition mismatches via "Keep mine".
4. Editor save indicator went green; cell-edits persisting cleanly across navigation.
5. **Perf-view continued showing stale data** — separate architectural issue, routed to v5h-01-03.

### v5h-01-03 — perf-view architectural refactor (final commit `92b1902`, with 4 iterations)

The original v5h-01-03 plan was an execute fix (resubscribe-on-error + hydrated-trust gate). Wrong hypothesis; shipped a regression.

| Commit | Approach | Outcome |
|--------|----------|---------|
| `f83d75d` | resubscribe-once + hydrated-trust dual-read | Returned `[]` during initial mount window → broke live setlists. Reverted at `2897c30`. |
| `8971223` | `{ includeMetadataChanges: true }` + flip on `metadata.fromCache === false` listener delivery | Wrong signal — `fromCache` indicates source not freshness. Failed UAT. |
| `4aa6840` | Flip gate on `getDocsFromServer.then()` resolution | Correct signal but didn't address architectural divergence. Failed UAT (still 60s+ + multiple refreshes). |
| `92b1902` | **Architectural:** read tracks from Dexie via `useLiveQuery` + mount snapshot-listener for cross-device | ✅ UAT passed. Daniel: "worked!" |

The final architectural refactor unifies the data path: editor and perf-view BOTH read tracks from Dexie (the editor was already doing this; perf-view now does too). Cross-device updates flow through the snapshot-listener (writes Firestore changes into Dexie via `db.put`). Embedded fallback retained ONLY for unhydrated legacy setlists. Suite 1481/1481.

### Files touched today
- `firestore.rules` (deployed)
- `src/components/setlist/grid/SetlistGridHydrator.tsx`
- `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx`
- `src/lib/sync/snapshot-listener.ts`
- `src/lib/sync/__tests__/property-failures.test.ts`
- `src/hooks/use-setlist-performance.ts` (refactored to Dexie via useLiveQuery)
- `src/hooks/__tests__/use-setlist-performance.test.ts` (rewritten with fake-indexeddb)
- `src/types/models.ts` (added `hydrated?: boolean` to Setlist)

---

## Open work for resume — IN PRIORITY ORDER

### 1. v5h-01-04 — Postmortem (~30 min)
**Status:** Planned but not yet written.
**Path forward:** `/paul:plan` for v5h-01-04, then `/paul:apply`.
**Coverage needed:**
1. **Cutover-plan rules-audit gap.** v50-05-02 introduced top-level `tracks/{trackId}` + `songs/{songId}` collections without `firestore.rules` entries. Default-deny silently rejected every v5.0 track save in production. Propose a CARL/PAUL gate: "Did you add new top-level Firestore collections? If yes, did `firestore.rules` grow corresponding match blocks?"
2. **Kitchen-sink harness fidelity gaps.** v50-07-04's fast-check property harness shipped multiple blind spots:
   - No security-rules layer → missed missing tracks/songs rules.
   - No perf-view path coverage → missed data-path divergence + dual-read freshness bug.
   - Zero-latency in-memory adapters → missed cache-vs-server-fresh races and Firestore SDK persistent-cache semantics.
   - Recommend integration-shaped test surfaces (a thin Playwright spec or RTL test running both editor cell-commit AND perf-view subscription against a shared in-memory Firestore).
3. **Perf-view fix iteration lessons:**
   - `metadata.fromCache` indicates source not freshness — was a false signal.
   - Research-before-execute when subscription state semantics + caching are at play.
   - When a hook has been patched 2-3 times without success, step back and consider whether the architecture is right.
   - Architectural fixes (Dexie via useLiveQuery here) can be cleaner AND simpler than patches.
4. **Daniel-loop UAT cadence as v5.x norm.** v5h-01-02 and v5h-01-03 each ran a UAT cycle with Daniel between fix and milestone close. Establish this for v5.x.
5. **Auth-claim staleness incident** (today's diagnostic chain). Consider: should client tokens auto-refresh on rules-version change? Probably out of scope; document for future awareness.

### 2. Issue 2 — iPad key-picker UI is bad
**Status:** Surfaced in v5h-01-02 UAT; symptom is vague.
**What's needed:** Daniel to describe what specifically reads as bad (small? hard to scroll? wrong widget? doesn't open?).
**Routing once described:**
- If tap-target / sheet-vs-popover issue → v50-05-04 regression follow-up (the iPad polish plan). Could ship as v5h-01-05 if blocking onboarding, or as a v5.1 plan.
- If "feels janky / discoverability" → v5.1 UX overhaul.
**Resume action:** ask Daniel for the symptom, then route per above.

### 3. v5.0 milestone close
**Status:** Pending v5h-01-04 + Issue 2 resolution.
**Path:** `/paul:audit-milestone` (or `/paul:plan-milestone-gaps` if there are other UAT carryovers) once v5.0-hotfix is complete.
**Then:** `/paul:complete-milestone v5.0` to archive.

### 4. v5.1 — UX overhaul milestone
**Status:** Documented in ROADMAP but not yet planned. Several items already routed here:
- Reconciliation modal copy improvement ("detected changes from somewhere else" reads scary for single-leader).
- Issue 2 (iPad key picker UI) — likely lands here unless it's a v50-05-04 regression.
- General editor + perf-view UX polish.
**Path:** `/paul:new-milestone` or `/paul:discuss-milestone` to scope.

---

## Operational state at pause

- **Production:** Live + healthy. Last verified by Daniel UAT 2026-04-27 ("worked!").
- **Firestore rules:** tracks/{id} + songs/{id} match blocks deployed to crcmusiccharts.
- **Dexie schema:** v2; no migration needed.
- **Engine:** drained cleanly per Daniel's last diagnostic snippet (outbox empty for setlist `kQNvssixRlHQRB6gtWqt`).
- **Auth:** Daniel's session has `role: "admin"` (verified via JWT claims diagnostic). Other band members unaffected (Daniel is currently the only user).
- **Suite:** 1481/1481 passing. tsc + next build clean.
- **Branch:** master. No outstanding commits, no in-flight work.

## How to resume

```
/paul:resume   # reads STATE.md + this handoff; routes to next action
```

Expected route: `/paul:plan` for v5h-01-04 postmortem (the single remaining plan in v5.0-hotfix).

Alternative routes (if Daniel raises Issue 2 first):
- Describe iPad symptom → I scope into v50-05-04 regression OR v5.1 plan.

After v5h-01-04 closes:
- `/paul:audit-milestone` to verify v5.0-hotfix scope + close it.
- `/paul:new-milestone` for v5.1 UX overhaul.

---

*Pause-time STATE: v5.0-hotfix is 75% complete (3 of 4 plans). Bug is fixed; only documentation + lesson-capture remains before milestone close.*
