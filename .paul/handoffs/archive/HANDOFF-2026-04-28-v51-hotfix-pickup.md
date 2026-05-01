# PAUL Handoff — v5.1 closed + 2 hotfixes shipped + cross-computer pause

**Date:** 2026-04-28 (session started 2026-04-27 evening, rolled past midnight)
**Status:** paused (clean state — no in-progress work, no uncommitted .paul/ changes)
**Branch:** master
**Last commit:** `2b35860` (v51-h02 hotfix, pushed)
**Last tag:** `v5.1` (annotated, pushed)

---

## READ THIS FIRST

You are continuing on a different computer. **Pull origin master first** — there are several pushed commits since your last machine's session.

```bash
cd sheet-music-app
git pull origin master
git fetch --tags  # picks up v5.1 annotated tag
```

**Project:** sheet-music-app (CentralReform.live) — Reform Jewish synagogue worship band setlist tool. Tablet-first; iPads on music stands. Daniel is the only UAT user; band not yet onboarded.

**CRITICAL CULTURAL CONTEXT:** CRC services are **Friday evening (Erev Shabbat) + Saturday morning (Shabbat)**. NOT Sunday. See `~/.claude/projects/C--Users-dsbog-CentralReform-live/memory/project_shul_cadence.md`.

---

## What Closed This Session

### v5.1 Editor UX Polish — ✅ COMPLETE 2026-04-27

4 phases / 4 plans shipped + tagged `v5.1`:
- **v51-01-01:** Picker rework (TouchOrPopover + DropdownCell mode + KeyCell chromatic Major|Minor tabs across all 6 dropdown sites). Commits `6671254` / `c11a5c4` / `304e940`.
- **v51-02-01:** Editor readability + visual hierarchy (Option B Comfortable Dense, 44/48 row heights, tier-class typography, section framing). Commit `c40d880` + close `05ddafb`.
- **v51-03-01:** Smart create-setlist wizard (date-aware Clone CTA via Hebcal, three-offer pre-form strip, sticky-memory verbatim copy verified). Commit `f30e819` + close `6c5040a`.
- **v51-04-01:** Vocal Lead label rename (6 surfaces) + Daniel-loop UAT discipline codified in PROJECT.md + gig-packet print smoke verified. Commit `233d8b5` + close `b023ea0`.

Milestone formally closed via `/paul:complete-milestone` at commit `85b14a0`:
- `.paul/MILESTONES.md` gained v5.1 entry under Completed Milestones
- `.paul/milestones/v5.1-ROADMAP.md` archives the roadmap snapshot
- ROADMAP reorganized — v5.1 collapsed into Completed details block
- PROJECT.md Current State Version: v5.0 (pending UAT) → v5.1
- Tag `v5.1` created + pushed

Suite: 1481 → 1513 (+32) across the milestone. Boundary diff was clean against firestore.rules / sync engine / local store / models — no foundation churn.

---

## Hotfixes Shipped Post-Milestone-Close (Daniel UAT caught both)

The Daniel-loop UAT discipline codified in v51-04 (`PROJECT.md` § "UAT Discipline") immediately surfaced two regressions:

### v51-h01 — Save-failure visibility + lazy-hydration race
**Commit:** `d440192` (pushed)

Daniel UAT (on phone): "frequently saying failed in the save notification" creating + editing setlists.

3 fixes in one commit:
1. `createSetlist` + `cloneSetlist` now stamp `updatedAt: serverTimestamp()` at write time (`src/lib/setlist-firebase.ts`). Closes the lazy-hydration precondition race that was the most likely root cause of intermittent "Save failed" indicators on first edit after create.
2. Both direct-write paths now call `captureSyncFailure({ feature: 'write-atomicity', site, op, collection, trackCount })` on throw — closes the v50-07-05 instrumentation gap (engine drain was instrumented but the wizard's direct addDoc paths were not).
3. `SyncIndicator.tsx` renders `lastError` inline below the label when state is `'failed'` (truncated 120 chars, red ~11px). Mobile-visible — tooltip-only display didn't fire on touch, so Daniel couldn't see the actual SDK error from his phone.

Plus: wizard's bare `} catch {` now binds err and includes `err.message` in the toast.

Research artifact: `.paul/research/v5.1-hotfix-save-failure-2026-04-27.md`

### v51-h02 — Wizard routing for calendar "+" + terminal RemoteDocMissingError
**Commit:** `2b35860` (pushed)

After v51-h01 deployed, the inline error revealed the actual SDK message: **"Remote doc missing: setlists/CTAi6kgkTUpGYMO1Ffx7"**. Diagnostic: `https://centralreform.live/setlists/CTAi6kgkTUpGYMO1Ffx7` returned 404 + Daniel created it earlier same day. Conclusion: phantom setlist (addDoc resolved client-side without server confirmation under flaky phone signal) → local Dexie has it, Firestore doesn't, every edit dead-letters.

ALSO Daniel reported a separate issue: tapping the "+" placeholder for upcoming Shabbat morning **did not open the v51-03 wizard** — it built from template directly. Root cause: `handleCreateFromCalendar` in `src/hooks/use-setlist-dashboard.ts` predates v51-03 and bypasses the wizard.

2 fixes in one commit:

**Fix A (wizard routing):**
- `SetlistDashboard.tsx` now owns `wizardPrefilledDate` state + `openWizardForDate(date)` callback
- `PlaceholderCard.onCreate` and `UnifiedCalendar.onCreateSetlist` both route through `openWizardForDate`
- `CreationWizard` accepts new `prefilledDate` prop; on dialog open it resets state then calls `wizard.setEventDate(prefilledDate)` so the lookup effect fires findLastMatchingService → offer strip surfaces

**Fix B (terminal RemoteDocMissingError):**
- New `RemoteDocMissingError` class in `src/lib/sync/firestore-adapter.ts`
- `init.ts` throws it instead of `TransientError` when `tx.get(ref)` finds `!snap.exists()` on update
- `engine.ts` handles the new class as terminal (no retry — was 5× backoff = ~15.5s wasted) with Sentry capture (feature: `'write-atomicity'`, site: `'remote-doc-missing'`)
- User-visible message: "This setlist isn't on the server (was deleted or never synced). Refresh your library."

Suite: 1513/1513 (no new tests added; no regressions). tsc clean. next build exit 0.

---

## What's Currently Open

### 1. Daniel UAT verification of v51-h02 has NOT happened yet
- Internet went out mid-conversation as v51-h02 was deploying
- Daniel hasn't confirmed: (a) calendar "+" now opens wizard with prefilled date, (b) phantom setlist now surfaces immediate "Remote doc missing — refresh library" message
- **First task on resume:** ask Daniel to verify v51-h02 on production. URL: https://centralreform.live/setlists

### 2. Phantom setlist CTAi6kgkTUpGYMO1Ffx7 still in Daniel's IndexedDB
- One-shot manual cleanup is still needed (the v51-h02 fix prevents 15s backoff but doesn't auto-delete the row)
- Phone path: Settings → Safari → Advanced → Website Data → centralreform.live → Remove
- Desktop path: DevTools → Application → IndexedDB → crc-local → setlists table → delete row id=CTAi6kgkTUpGYMO1Ffx7
- A follow-up plan could add an opt-in "Refresh library" button that scans for phantoms and offers cleanup — too destructive for an emergency hotfix.

### 3. v50-07-05 Sentry observability gap on direct writes is now CLOSED for setlist creation
- `createSetlist` + `cloneSetlist` are now instrumented (v51-h01)
- `RemoteDocMissingError` is now instrumented (v51-h02)
- The general pattern (legacy non-engine direct Firestore writes) may have other unflagged sites — worth a future audit but not P0

### 4. v5.0 milestone STILL pending UAT
- v5.0 (Bulletproof Editor) closed its 7 phases on 2026-04-27 but is awaiting Daniel-on-real-production weekly worship cycle + band onboarding + first-week smoke
- Close path: `/paul:audit-milestone v5.0` once those gates clear
- v5.1 polish + the two hotfixes were prerequisite work to make that UAT comfortable

---

## Three Possible Next Moves (user's choice on resume)

### Option 1: Verify v51-h02 + continue UAT
Quickest path. Daniel verifies the calendar "+" wizard routing + phantom-setlist immediate-error on his other computer. If both work as designed, he runs his weekly worship cycle UAT. Once that passes + band reports first-week smoke, → `/paul:audit-milestone v5.0`.

### Option 2: Open a v5.1-hotfix postmortem milestone
Mirrors the v5.0-hotfix structure (1 phase, 4 plans):
- Plan 1: research + reproduce the v51-h01 + v51-h02 root causes against production
- Plan 2: harden engine error taxonomy (RemoteDocMissingError as the model — what other terminal-failure classes are still routed through TransientError retries?)
- Plan 3: add the "Refresh library" cleanup action for phantom-doc detection + reconciliation
- Plan 4: postmortem doc capturing lessons learned (write-atomicity instrumentation gap, addDoc-vs-snapshot-listener race, calendar "+" routing gap)

### Option 3: Pause longer + reconvene next session
v5.1 + 2 hotfixes shipped. Stop here, let Daniel use the app for the upcoming Shabbat morning service, surface what comes up via Daniel-loop UAT.

---

## Standing User Preferences (from auto-memory — don't violate)

- Push to `origin master` (not `master:main`); deploy via Vercel; no preview branches
- Tablet-first application; band on iPads on music stands; Daniel uses both desktop + iPad + phone
- Reform Jewish synagogue — Friday night + Shabbat morning; never Sunday
- "Vocal Lead" not "Lead"/"Leader" (per-song role); rabbi "Led by:" on print is distinct
- App must be "bulletproof and easy and intuitive" before band onboarding
- Explicitly stage `.paul/phases/{phase}/` dir on PAUL commits (don't orphan PLAN/SUMMARY files)
- Run `next build` not just `tsc` for verification
- **Pre-existing dirty state on `package.json` + `src/build-info.json`** — auto-touched by dev script; do NOT stage on PAUL commits
- Daniel uses multiple computers — always `git pull origin master` + `git fetch --tags` before starting

---

## Key Files for Quick Re-Orientation

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state — read first on resume |
| `.paul/MILESTONES.md` | v5.1 entry now under Completed Milestones with full accomplishments + decisions table |
| `.paul/ROADMAP.md` | Current Milestone slot is empty; v5.1 collapsed into Completed details |
| `.paul/PROJECT.md` | Version: v5.1; Validated section has v5.1 entries; "UAT Discipline" subsection under Constraints |
| `.paul/research/v5.1-hotfix-save-failure-2026-04-27.md` | Research artifact for the save-failure investigation |
| `.paul/postmortems/v5h-01-save-loss.md` | Prior postmortem (binding methodology lesson — research without prod state went 3-for-3 wrong) |

Source surfaces touched in hotfixes (for reference if a follow-up plan needs to re-verify):
- `src/lib/setlist-firebase.ts` — createSetlist + cloneSetlist (now stamp updatedAt + Sentry-instrumented)
- `src/hooks/use-creation-wizard.ts` — wizard create() catch path now binds err
- `src/components/setlist/grid/SyncIndicator.tsx` — inline error display when state='failed'
- `src/components/setlist/SetlistDashboard.tsx` — wizardPrefilledDate state + openWizardForDate
- `src/components/setlist/wizard/CreationWizard.tsx` — prefilledDate prop
- `src/lib/sync/firestore-adapter.ts` — RemoteDocMissingError class
- `src/lib/sync/init.ts` — throws RemoteDocMissingError instead of TransientError on !snap.exists
- `src/lib/sync/engine.ts` — handles RemoteDocMissingError as terminal

---

## Commits Since Last Machine Pull

```
2b35860  hotfix(v51-h02): wire calendar "+" through wizard + terminal RemoteDocMissingError
d440192  hotfix(v51-h01): close save-failure visibility gap + lazy-hydration race
85b14a0  chore(milestone): close v5.1 — Editor UX Polish complete
b023ea0  feat(v51-04): vocal lead rename + UAT discipline complete — close phase + v5.1 milestone
233d8b5  feat(v51-04-01): rename "Lead" → "Vocal Lead" + codify Daniel-loop UAT
6c5040a  feat(v51-03): smart create-setlist wizard complete — close phase
f30e819  feat(v51-03-01): smart create-setlist wizard with date-aware Clone CTA
```

Plus annotated tag `v5.1` (created at `85b14a0`, pushed).

---

## Resume Instructions

1. `git pull origin master` + `git fetch --tags`
2. Run `/paul:resume` — it'll detect this handoff and route to a "verify v51-h02 deployment first, then route to next move" prompt
3. Or skip: ask Daniel directly whether v51-h02 worked on production, then route based on his answer
4. Pre-existing package.json + src/build-info.json dirty state is normal and stays — do NOT include in any PAUL commit

---

*Handoff created: 2026-04-28 at clean pause point. v5.1 milestone closed + 2 hotfixes shipped + tagged. Awaiting Daniel UAT verification of v51-h02 on resume.*
