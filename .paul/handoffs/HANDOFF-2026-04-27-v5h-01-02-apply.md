# Handoff — Resume v5h-01-02 APPLY after context clear

**Created:** 2026-04-27 (mid-session, before /clear)
**Read this on /paul:resume.**

## Where we are

- v5.0-hotfix milestone, phase v5h-01.
- v5h-01-01 LOOP COMPLETE (reproduce + diagnose).
  - Production state capture surfaced ACTUAL root cause: missing Firestore rules for `tracks/{trackId}` + `songs/{songId}` (NOT the engine race the original handoff hypothesized).
  - Decision: ship E + F + B defense-in-depth.
- **v5h-01-02 PLAN CREATED, awaiting APPLY.**
  - Plan path: `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-PLAN.md`
  - Type: execute, autonomous=false, depends_on=["01"]
  - Decision-checkpoint at start: option-all-three (recommended) vs option-ef-only.
  - 5 auto tasks (T1 rules + deploy, T2 Hydrator guard, T3 tests, T4+T5 listener fix + AC-1 flip).
  - HUMAN-VERIFY at end: Daniel's UAT scenario 1 against prod after rules deploy + outbox clear.

## Critical session-specific reminders

- **Firebase CLI is available in this session** — Task 1 deploys via `firebase deploy --only firestore:rules` directly. No external action needed for the deploy step.
- **Daniel has 50+ stuck failed outbox rows** in his `crc-local`/outbox for setlist `kQNvssixRlHQRB6gtWqt`. The HUMAN-VERIFY step includes a DevTools console snippet (using Dexie via skypack import) for him to paste. Snippet is documented inline in v5h-01-02-PLAN.md's HUMAN-VERIFY task. Manual delete fallback is also documented.
- **Decision-checkpoint default:** option-all-three per v5h-01-01 SUMMARY recommendation. If user says "yes" / "go" / "1" without specifying, treat as option-all-three.
- **Production app uses `crc-local` (NOT `crc-sync`)** Dexie database. `crc-sync` is the cross-tab-lock channel name; `crc-offline` is a separate older IDB for file caching. Don't reference `crc-sync` in DevTools instructions — that confused Daniel earlier in this session.

## Recovery snippet (paste into Chrome DevTools console on centralreform.live)

```js
(async () => {
  const Dexie = (await import('https://cdn.skypack.dev/dexie@4')).Dexie
  const db = new Dexie('crc-local')
  await db.open()
  const failed = await db.table('outbox').where('status').equals('failed').toArray()
  console.log(`Found ${failed.length} failed outbox rows. Deleting...`)
  for (const r of failed) await db.table('outbox').delete(r.localId)
  console.log('Done. Refresh the page.')
})()
```

## Key files for next session

- `.paul/STATE.md` — loop position + resume guidance.
- `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-PLAN.md` — the plan to execute.
- `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md` — decision context + smoking-gun observations.
- `.paul/postmortems/v50-07-save-loss-investigation.md` — production state capture (50+ failed rows on setlist kQNvssixRlHQRB6gtWqt; 2 sample rows verified with `lastError: "permission-denied"`; firestore.rules audit confirmed missing tracks + songs blocks).

## Sequencing for next session

1. `/paul:resume` (auto-detects this handoff file)
2. `/paul:apply .paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-PLAN.md`
3. Decision-checkpoint fires → user picks option-all-three (recommended) or option-ef-only.
4. T1 firestore.rules + `firebase deploy --only firestore:rules`.
5. T2 SetlistGridHydrator outbox-pending guard.
6. T3 +3 tests.
7. (if all-three) T4 listener LWW fix + T5 AC-1 it.fails → it flip.
8. HUMAN-VERIFY: Daniel runs UAT scenario 1 with recovery snippet.
9. /paul:unify → close v5h-01-02.
10. /paul:plan v5h-01-03 (postmortem; final plan in v5.0-hotfix).
11. /paul:audit-milestone v5.0-hotfix → close.
12. /paul:milestone v5.1 (UX overhaul).

## Suite baseline

- 1476/1476 tests passing (one pre-existing cross-tab-lock flake unrelated).
- AC-1 in property-failures.test.ts is currently `it.fails(...)` — passes when inner assertion throws (bug reproduces).
- After T4+T5, AC-1 flips to `it(...)` and inner assertion passes (bug fixed).

---

*Handoff: 2026-04-27 — bridge from v5h-01-02 PLAN created → v5h-01-02 APPLY execution post-/clear*
