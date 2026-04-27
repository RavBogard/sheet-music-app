# Ship Checklist — v5.0 Bulletproof Editor

Three sections. Read in order.

1. **Deploy verification** — what to check immediately after `git push origin master` lands the v50-07-05 commit.
2. **Band onboarding** — a 1-page user guide for Rabbi + band members.
3. **First-week monitoring playbook** — Sentry alert taxonomy + response procedure + rollback.

---

## Section 1: Deploy verification (run within 10 minutes of push)

1. Confirm the v50-07-05 commit landed on `origin master`:
   ```bash
   git log -1 --oneline
   ```
   Expected: latest commit is the `chore(paul): v50-07-05 UNIFY` close commit (or `feat(v50-07-05)` if checking right after Task 1+3).

2. Visit `https://CentralReform.live/setlists` in a fresh browser tab (signed in as Daniel). Expected: list of setlists renders, status 200, no console errors.

3. Open one current-week setlist (`/setlists/[id]`). Expected: SetlistGrid mounts; sync indicator shows **Saved** or **Idle** within 2 seconds.

4. Edit one cell (any cell). Expected: sync indicator transitions **Saving → Saved** within 2 seconds.

5. Hard-refresh the page (Cmd-R / Ctrl-R). Expected: the edit persists (Firestore commit landed).

6. Open one of the 24 historical legacy setlists (any setlist created before 2026-04-26). Expected: renders within 2 seconds. Wait 5 seconds for the silent lazy-hydration cascade. Then check Sentry within 5 minutes — confirm NO new `feature:lazy-hydration` errors fired.

7. Open the Sentry dashboard. Confirm the new feature tags are filterable: search for `feature:lazy-hydration`, `feature:dead-letter`, `feature:snapshot-listener`. Even with zero events, the tag dropdown should show them as known facets after the first prod capture; if you want to validate without waiting, set a saved view filtering on `level:error AND feature:dead-letter`.

8. If anything in steps 1–7 fails: see Section 3 rollback procedure. Otherwise, you're cleared to proceed with UAT (`v50-07-05-UAT-PLAN.md`).

---

## Section 2: Band onboarding (1-page user guide)

> **For:** Rabbi + band members using the new setlist editor.
> **What changed:** The editor is now a spreadsheet — one row per song, click a cell to edit, type to filter the dropdowns. Saves automatically. Works on tablet and phone too.

### How to open a setlist
- Sign in at `CentralReform.live`.
- Click **Setlists** in the navigation.
- Click the setlist name.

### How to add or change a song
- **Add a row:** click the empty row at the bottom. Type the song name — a list of matches appears. Click the song you want.
- **Change a song:** click the title cell of an existing row. Type a new song name and select from the list, or just type a free-text title.
- **Edit any other cell** (Key, BPM, Lead, Notes, Type): click the cell, type, then press Tab or click outside.

### How to bind a chart
- Click the chart icon on the right side of a row. A chart picker opens. Type to filter, click the chart you want. The icon changes to show the chart is bound.

### What the sync indicator means (bottom-right corner)
- **Idle / Saved** — everything is saved. Safe to walk away.
- **Saving** — your last edit is being sent to the server. Don't refresh in this moment if you can avoid it.
- **Offline** — you're not connected. Your edits are saved locally and will sync when you reconnect.
- **Conflict — review** — someone else edited the same row at the same time. Click the indicator; pick "Keep mine" or "Take theirs" for each row, then "Resolve all and save".
- **Failed** — something went wrong. Refresh the page; if it persists, report to Daniel.

### What to do on phone
- The page shows tappable cards instead of the table.
- Tap a card to open the edit form.
- Long-press a card (~half a second) to get a menu (Edit / Bind chart / Duplicate / Delete).

### What to do if something looks wrong
1. **Refresh the page.** Most issues clear instantly.
2. **Take a screenshot** if it doesn't.
3. **Note the time** (so Daniel can cross-reference Sentry).
4. **Send to Daniel** with a one-line description of what you were trying to do.

### Known limitations (during the v5.0 transition)
- Setlists from before April 2026 may take 1–2 extra seconds the FIRST time you open them — they're being silently migrated to the new format. Subsequent opens are normal speed.
- The first time anyone uses the new editor, it loads a fresh copy of the data; that's normal.

---

> *Move this onboarding doc to a public help system in v5.1 — for v5.0 milestone close it lives in `.paul/phases/v50-07-migration-cutover/`.*

---

## Section 3: First-week monitoring playbook

### Alert taxonomy

Every Sentry event from the v5.0 sync substrate is tagged with `feature` (one of four values). The following table maps tag → meaning → severity → response.

| Alert tag | Meaning | Severity | Response |
|---|---|---|---|
| `feature:lazy-hydration` | A legacy setlist failed to silently migrate on first edit-open. The setlist is still readable in perf-view (embedded `tracks[]` fallback) and editable in the editor (the fan-out will retry on the next mount). | **Warning** | Triage. If rate >1/day per setlist: investigate the captured `setlistId` + `trackCount`; check if any specific legacy setlist is consistently failing. Common cause: malformed legacy track data the migration cascade rejects. |
| `feature:dead-letter` | An outbox row failed all 5 retry attempts (NetworkError / TransientError schedule). The user's edit is preserved in their local IDB outbox at status `'failed'`, but won't drain to Firestore without intervention. | **Error — URGENT** | The user lost an edit (from their perspective — the row is in IDB but not in Firestore). Capture from Sentry: `collection`, `docId`, `op`, `attempts`, `lastError`. Manually inspect Firestore for current state. Decide: (a) the user should reconcile (refresh, re-edit), or (b) you manually edit Firestore to match the user's intent. If rate >1/week: there's a systemic adapter issue — investigate before next service. |
| `feature:snapshot-listener` (any `site`) | The cross-leader live-edit listener hit an error. UX impact: the affected user doesn't see another leader's edit until they refresh. No data loss; engine drain remains the source of truth. | **Warning** | Triage. Check `site` (`setlist-apply` / `tracks-apply` / `setlist-subscribe` / `tracks-subscribe`) — apply errors are local Dexie issues; subscribe errors are Firestore connection issues. If rate >1/hour per user: investigate. Otherwise, log and move on. |
| `feature:write-atomicity` (currently NOT wired — placeholder for future) | An `applyEdit` Dexie transaction failed wholesale (entity row + outbox row should land atomically, but didn't). Indicates IDB corruption or schema-version mismatch. | **Error** | Rare. Instruct the user to clear site data (browser settings → site data → CentralReform.live → Clear) and retry. If multiple users hit this at once: a Dexie schema bump landed without a migration — roll back. |

### Recommended Sentry dashboard view

Pin a saved view: `level:error OR feature:dead-letter` — these are the events that need same-day attention. Everything else can wait for a daily review.

### Rollback procedure

If a deployed change breaks production (Sentry storm of new errors right after a deploy, or UAT scenario fails catastrophically):

1. Identify the bad commit. Sentry's first-seen timestamp on the new error → cross-reference `git log --oneline --since="<timestamp>"`.
2. Revert it on master:
   ```bash
   git revert <sha>
   git push origin master
   ```
   Vercel auto-deploys the previous shape within ~3 minutes.
3. Confirm in Sentry that the error rate drops back to baseline.
4. Document the regression: write a short note in a new `v51-XX-PLAN.md` (or `v5.0-hotfix-PLAN.md`) describing what broke, how it was reverted, and what fix needs to land before re-attempting.

### What ISN'T captured (intentional)

So you don't waste cycles looking for these:

- **Engine state transitions to `'conflict'`** — that's a user-facing UX event (reconciliation modal opens), not a backend failure. The reconciliation modal is the response.
- **Per-attempt drain failures** — only the dead-letter (5th attempt) is captured. Per-attempt would alert-fatigue.
- **Payload contents** — only stable identifiers (`setlistId`, `docId`, `op`) reach Sentry. User-authored notes / song titles are deliberately omitted (PII discipline).

---

*v50-07-05 ship checklist — apply at deploy, hand to band Day 1, monitor Week 1*
