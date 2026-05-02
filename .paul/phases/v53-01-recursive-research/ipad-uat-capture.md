# iPad UAT Capture — v53-01-01

**Captured:** 2026-05-02
**Captured by:** Rabbi Daniel (real production, real iPad, real auth, real library)
**Capture method:** Daniel-loop UAT (codified v51-04)
**Status:** Captured (NOT deferred)

---

## ⚠️ NEW HIGH-SEVERITY FINDING — Save-loss recurrence (NOT in original v53-01 scope)

**Daniel's words:** *"I made all sorts of changes to a setlist this morning and they didn't save when I just went back to it. This is so annoying. Some of them did, some didn't. Beyond irritating."*

### Why this matters

This is the **same class of bug as v5h-01** (track-edit save-loss, 2026-04-27). The v5.0-hotfix shipped E+F+B defense-in-depth specifically to make this impossible by construction:
- **E** — Firestore rules: added `match /tracks/{trackId}` + `match /songs/{songId}` blocks
- **F** — SetlistGridHydrator: outbox-pending guard around `db.{setlists,tracks}.put`
- **B** — snapshot-listener: strict-equality LWW guard preserving local row when `updatedAt` undefined

The postmortem (`.paul/postmortems/v5h-01-save-loss.md`) documented the lessons. The kitchen-sink harness (v50-07-04) regression-locks it. Yet **it is recurring** in real production, 5 days after v5.2 milestone shipped.

### What we know from Daniel's report

- **Selective failure:** "Some of them did, some didn't" — partial save-loss, not total. Suggests per-doc race condition or per-edit-type failure mode, not a global write block.
- **Surface latency:** Daniel didn't notice during editing — only on next open. Suggests writes appeared to succeed locally (Dexie put returned) but didn't reach Firestore (or were overwritten on re-fetch).
- **Single device:** Daniel was editing on one device this morning, returned later. So this is NOT a cross-device race; it's a single-device persistence failure.
- **Recent context:** v5.2 shipped 5 days ago (2026-04-30). Latest changes touched: cleanup.ts (v52-03), TouchOrPopover suppressAutoFocus contract (v52-02), TextCell single-tap-to-edit on coarse pointer (v52-02), config/defaults pointer doc (v52-05). Save-path changes were NOT part of v5.2 by design.

### Hypotheses (must be researched before any v5.3 UX work lands)

| # | Hypothesis | Why plausible | How to test |
|---|---|---|---|
| H-SL-1 | TextCell single-tap-to-edit (v52-02-02) introduced a focus/blur race on coarse pointer where edit commits don't fire `onCommit` consistently | New v52-02-02 code path; coarse-pointer-only; explains "some did, some didn't" if certain cell types use TextCell while others use DropdownCell | Read v52-02-02 SUMMARY + TextCell.tsx onBlur/Enter handlers; compare commit paths between TextCell and DropdownCell |
| H-SL-2 | Sticky-memory propagation (v50-04 `propagateTrackEditToSong` 1s debounce) clobbers in-flight edits when same field is edited twice within the debounce window | Debounced write to `songs/{id}` runs through `applyEdit('update','songs',...)`; if expectedUpdatedAt is stale, it could race with track-doc writes | Trace `propagateTrackEditToSong` callers; check if debounce reset on subsequent edit |
| H-SL-3 | `clearFailedOutboxRows` (v52-03) silently drops a row that was pending-not-failed if the FSM transition raced | New cleanup primitive; only filters by `status === 'failed'` per design — but if engine flips a row failed→pending mid-transaction, gap is possible | Read v52-03 cleanup.ts + state machine; check for status-read races |
| H-SL-4 | New `config/defaults` write path (v52-05) shares engine/outbox with track writes and exhausts a per-pump capacity, leaving track edits stuck pending past app close | New v52-05 service helpers route through `applyEdit`; if same pump-tick contention occurred this morning, edits could starve | Check engine.ts pump rate-limiting; trace whether v52-05 helpers actually queue via outbox or bypass |
| H-SL-5 | Auth-claim staleness (v5h-01 §3 redux) — Daniel's iPad auth token went stale, writes started failing silently into outbox, v52-03 sign-out-and-back-in pairing didn't surface because no error was visible | Known prior-art failure mode; v52-03 SyncIndicator overhaul SHOULD surface this now | Check IndexedDB `crc-local`/outbox for failed/pending rows from this morning |
| H-SL-6 | Different bug entirely — new code path introduced by something we haven't traced | Always plausible when "some did, some didn't" | Production console + IndexedDB inspection; reproduction harness |

### Recommended action — RESCOPE v5.3

**Strong recommendation:** Spin a **v5.3-hotfix** track ahead of v53-02..04 (same precedent as v5.0-hotfix). Sequence:
1. **v5h3-01** — Reproduce + diagnose save-loss recurrence (research; Daniel captures production state via DevTools/IndexedDB; same playbook as v5h-01-01)
2. **v5h3-02** — Fix (execute; defense-in-depth or single-cause depending on diagnosis)
3. **v5h3-03** — Postmortem update (extend `.paul/postmortems/v5h-01-save-loss.md` OR new `v5h3-01-save-loss-recurrence.md`); identify why kitchen-sink harness didn't catch this; named harness-fidelity gap from v5h-01 §5 has not been closed (Firebase emulator + thin RTL editor↔perf-view test pair was the recommendation; deferred since v5h-01-04)
4. **THEN** v53-02..04 proceed as planned

This will be flagged in RESEARCH-SYNTHESIS.md as the recommended `rescope` decision-checkpoint outcome.

---

## Finding 1 — ChartBind picker (Track A primary)

**Daniel's words:** *"I have to scroll way to the right to see the chart button. When I click it the search opens but it never sees or suggests anything, makes no dif when I type."*

### Confirmed sub-mode

**Sub-mode (c) — focused but no filter / wrong results, OR no library at all surfacing.** Picker opens and search input is reachable; typing produces NO suggestions. "Makes no diff when I type" is unambiguous — the filter is either querying an empty list (H2 hydration) or filtering produces zero matches (H1 cmdk value format).

### Confirmed sub-mode (a) — discoverability gap

**NEW finding NOT in Track A scope:** Daniel must scroll way right in the spreadsheet to even see the Chart button. So the ChartCell is in a column that's off-screen on iPad without horizontal scrolling. This is a separate issue from the picker bug:

- **Issue 1a — Chart cell column placement.** Where does ChartCell live in the column order? Is it after Notes (which has the longest content)? Should it be promoted left, OR should there be a row-side affordance (e.g., chart icon at the row gutter) so binding doesn't require scrolling?
- **Issue 1b — Picker doesn't suggest anything when typing.** Confirms Track A H1 (cmdk value format scoring) AND/OR H2 (Dexie not hydrated when picker mounts). UAT confirms the symptom; needs production state inspection (IndexedDB songs table count) to disambiguate which.

### iPad-specific reproduction

- Picker opens — yes (sub-mode (a) ruled out)
- Keyboard pops — yes implied (Daniel typed)
- Typing produces filter results — **NO** (sub-mode (c) confirmed)
- Tap-to-bind tested? — couldn't get there (no results to tap)

### Updated v53-02 scope

ChartBind fix is now **two surfaces**:
1. Picker filter actually works (Track A H1 + H2 — needs production library count to pick smallest fix)
2. Chart cell discoverable without horizontal scroll on iPad (column reorder OR row-side affordance)

### Daniel explicit statement: chart-verification peek is OUT of scope

**Daniel's words:** *"don't worry about [chart verification]. Fix the other pieces."*

→ **Drop Track C chart-peek option set from v53-02.** v53-02 scope shrinks to: ChartBind picker fix + Chart cell discoverability fix. Reduces v53-02 scope by ~half.

---

## Finding 2 — AddRow polymorphism (Track C primary)

**Daniel's words:** *"I click add and it has me type but never suggests anything, and only gives me the option to add a song."*

### Confirmed scope

Two surfaces:
1. **Suggestions don't appear when typing** — same class as ChartBind H1/H2. The library lookup IS the suggestion source for AddRow's library branch. If ChartBind's library is empty/stale, AddRow's library is also empty/stale (both use `useLiveQuery(getDb().songs.toArray())`). One root cause, two surfaces.
2. **Only Song available** — Confirms Track C's diagnosis exactly. AddRowPlaceholder.tsx ONLY surfaces library Song + free-text Song. Reading / Prayer / Transition / Section / Note are absent.

### Implication

**The save-loss recurrence + the empty-library-suggestion finding are likely RELATED.** If something is preventing Dexie writes (save-loss) it could ALSO be preventing Dexie reads / library hydration (no suggestions). Worth a single-investigation pass in v5h3-01 hotfix.

### Updated v53-03 scope

Unchanged in shape (polymorphic Add menu — recommend Track C Option A grouped CommandList per Track C's strongest-rank). Now also depends on whatever v5h3-fix lands for the empty-library / no-suggestions issue.

---

## Finding 3 — Chart verification peek

**Daniel's words:** *"don't worry about this. Fix the other pieces."*

### Confirmed scope: OUT OF v5.3

→ **Drop entirely from v5.3.** Track C's 3 chart-peek options + recommendation become DEFERRED-to-future-milestone artifacts. They're written and saved, but not actioned. v53-02 plan does NOT include chart-peek.

If Daniel changes his mind post-v5.3, the design is already on the shelf.

---

## Summary table

| Finding | Track | Status | v5.3 target |
|---|---|---|---|
| Save-loss recurrence | NEW (not in plan) | 🔴 HIGH SEVERITY | **v5h3-hotfix BEFORE v53-02..04** |
| ChartBind picker filter broken | A | Confirmed (sub-mode c) | v53-02 |
| ChartCell off-screen on iPad | NEW | Confirmed | v53-02 (column placement OR row-side affordance) |
| AddRow no suggestions while typing | C | Confirmed (likely shared root cause with ChartBind picker) | v5h3-hotfix OR v53-02 (bundle with ChartBind picker fix) |
| AddRow only allows Song | C | Confirmed | v53-03 (Track C Option A — grouped CommandList) |
| Chart-verification peek | C | DROPPED per Daniel | OUT of v5.3 |

## Production state Daniel did NOT capture (would help diagnosis)

These were not requested in the original UAT plan; recommend Daniel capture in v5h3-01 if he can:
- IndexedDB `crc-local` → `outbox` table contents (any failed/pending rows from this morning?)
- IndexedDB `crc-local` → `songs` table count (is the library actually populated?)
- Safari Web Inspector console errors (any rules-denied / 4xx / 5xx?)
- Network tab: did any `tracks/*` writes fail this morning?

These are critical for diagnosing the save-loss + library-empty class of bugs and should be a **HUMAN-ACTION checkpoint in v5h3-01-01**.
