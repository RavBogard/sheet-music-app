# v5h3-01-01 Save-Loss Recurrence Investigation

**Date:** 2026-05-02
**Phase:** v5h3-01-save-loss-recurrence
**Plan:** v5h3-01-01
**Mode:** Code-scan only (HUMAN-ACTION DEFERRED per Daniel "continue autonomously" + already-refreshed iPad)

---

## Production Capture (2026-05-02 Daniel iPad)

**Status:** ⏳ DEFERRED. Daniel reported: *"I've already refreshed."* Per his subsequent direction *"1 continue autonomously"*, the HUMAN-ACTION checkpoint at AC-1 was deferred. Console + Network history from this morning's session are lost; IndexedDB + Sentry + Firestore + auth state remain capturable but require Daniel's input which is unavailable in this session.

**What this constraint means for diagnosis:** Per v5h-01 postmortem §2 ("3 ranked hypotheses (all converge on engine writeback) all turned out wrong"), code-read alone is insufficient to disambiguate save-loss causes. Code-scan can RULE OUT hypotheses where a code path categorically cannot produce the symptom; it cannot CONFIRM hypotheses without production evidence. This investigation narrows the field but does not pick a fix.

---

## Hypothesis Analysis

### H-SL-1: TextCell single-tap-to-edit (v52-02-02) blur/commit race

**Code surface:** `src/components/setlist/grid/cells/TextCell.tsx`. Two-state pattern (button → input). v52-02-02 added `isCoarse` single-tap entry to edit mode (line 163-166: `onClick={() => { onFocus(); if (isCoarse) enterEditMode() }}`). Commit happens at `commit()` (line 77-83) wired to input `onBlur` (line 130) and Enter/Tab handlers.

**Code-scan analysis:**
- `commit()` flow is monotonic: `if (draft !== asString(value)) onCommit(draft); setEditing(false); if (advance) onMoveFocus?.(advance)`. Order is correct — commit fires BEFORE setEditing.
- `useEffect([value, editing])` at line 51-53 resets draft from value when `!editing`. Race: parent re-renders during commit, value prop is still old, draft gets reset to old. But `commit()` calls `onCommit(draft)` SYNCHRONOUSLY before setEditing(false), so the parent's `onCommit` handler (which presumably calls applyEdit) runs first. The risk would be if applyEdit's Dexie write hasn't propagated to value-via-useLiveQuery before useEffect fires — but that's normal React batching, and the next render will pass the NEW value down which useEffect will then sync.
- iOS Safari onBlur timing: when user taps another cell on iPad, the new cell's onClick fires. The OLD input's onBlur fires immediately after (or in some iOS versions, before — but blur is reliably called). `commit()` runs.
- **Specific potential race not ruled out:** if the parent grid scrolls or unmounts the cell during the commit (e.g., user scrolls right past the cell while editing), the input could unmount before blur fires. React 18+ handles this — unmount triggers blur. But in concurrent mode timing edge cases exist.

**Evidence from production:** N/A (deferred). The cell-type-correlated failure pattern (TextCell-only fields lost vs. DropdownCell fields kept) would be the smoking gun.

**Verdict:** ⏳ **STILL OPEN.** Code-scan does not reveal a definitive race. The two-state pattern is potentially racy but the explicit blur → commit chain looks correct. Confirms or rules out only with cell-type-pattern evidence from production.

---

### H-SL-2: Sticky-memory propagation (v50-04 1s debounce) clobbers in-flight edits

**Code surface:** `src/lib/songs/defaults.ts`. `propagateTrackEditToSong(songId, patch, setlistId)` debounces 1000ms then `flushOne(songId)` calls `applyEdit('update', 'songs', { docId: songId, patch: { defaults, recent } })`.

**Code-scan analysis:**
- The propagation writes to `songs/{songId}` — NOT to `tracks/{trackId}`. Different doc. Different rule block. Different outbox row.
- It cannot directly clobber a track edit because it doesn't touch the tracks collection.
- Per-song debounce: subsequent edits to same song's defaults within 1s merge via `mergePatch` (line 53-62) — second edit's patch wins for fields it sets, first edit's patch retained for fields it doesn't. No loss.
- Tab-close timing: setTimeout fires only if tab stays open. If tab closes before debounce, the song-defaults propagation is lost — but the TRACK edit (which IS persisted via applyEdit immediately at the cell-commit site) is intact. Daniel's complaint is about track-level edits (key/notes/lead per-row) not saving — different scope from song-defaults.

**Evidence from production:** N/A (deferred). Even with production capture, this hypothesis would be ruled out by definitional scope.

**Verdict:** ❌ **RULED OUT** (code-scan definitive). `propagateTrackEditToSong` writes to `songs/{id}`, not `tracks/{id}`. It cannot directly cause track-edit save-loss. (Could be implicated for SONG defaults loss, but Daniel's complaint is track-level.)

---

### H-SL-3: clearFailedOutboxRows (v52-03) drops a pending row mid-FSM-transition

**Code surface:** `src/lib/sync/cleanup.ts`. `clearFailedOutboxRows()` queries `db.outbox.where('status').equals('failed')` then loops `db.outbox.delete(row.localId)` per row.

**Code-scan analysis:**
- The query filters by `status === 'failed'` only. Pending and sending rows are excluded from the snapshot.
- Race window: if engine pump concurrently transitions a row from `failed` → `pending` (e.g., user resolves conflict via `engine.resolveConflict`), the row was in the snapshot taken before the transition; it gets deleted. Loss possible.
- BUT: `clearFailedOutboxRows` is **only called from SyncIndicator's user-triggered "Clear failed rows" action** (per cleanup.ts comment line 1-13). Not auto-invoked.
- Daniel did not report tapping the failed-state SyncIndicator action button this morning. If the SyncIndicator showed "Saved" (per his report), no failed state was visible.

**Evidence from production:** N/A (deferred). Could be confirmed by Daniel's recall ("did you tap any error/recovery button this morning?") OR by IndexedDB outbox state showing no failed rows.

**Verdict:** ❌ **RULED OUT** unless Daniel specifically tapped the failed-state SyncIndicator action this morning. User-initiated only; selective failure pattern (some saves succeed, some don't) is incompatible with one-shot cleanup that would produce total loss for the cleared cohort. (Code-scan-strong verdict; reverses only if production evidence contradicts.)

---

### H-SL-4: config/defaults pump-capacity contention

**Code surface:** `src/lib/sync/engine.ts` `drainOnce` (line 199-298). Per-doc ordering via `oldestPerDoc` map keyed by `${collection}/${docId}`.

**Code-scan analysis:**
- Per-doc ordering serializes per-doc; cross-doc operations interleave via the for-loop iteration but don't compete for global resources.
- BACKOFF_MS schedule is per-row, not engine-global. No global rate limit.
- Firestore quotas are very generous; client-side rate limiting would not produce silent drops.
- v52-05 `setDefaultForServiceType` (per STATE.md decision: "Service helpers do NOT call engine.pump()" + "config/defaults is a regular Firestore doc, not on outbox path") writes via `setDoc(merge: true)` DIRECTLY — does NOT enter the outbox. Cannot contend with track writes via the engine drain path AT ALL.

**Evidence from production:** N/A (deferred). Even with capture, this hypothesis is ruled out by code path: config/defaults writes bypass the outbox.

**Verdict:** ❌ **RULED OUT** (code-scan definitive). Engine has no shared capacity that could be exhausted; config/defaults bypasses the outbox entirely (v52-05 design). Cannot starve track writes.

---

### H-SL-5: Auth-claim staleness redux (v5h-01 §3 pattern)

**Code surface:** `src/lib/sync/engine.ts` `handleAdapterError` AuthError branch (line 338-374). One-shot refresh + immediate retry; on retry-failure, mark failed + dispatch DRAIN_AUTH_FAILED.

**Code-scan analysis:**
- AuthError handling: refresh + retry once, then dead-letter to `failed`. Sentry capture fires on dead-letter (line 398-404).
- v52-03 added "Sign out and back in" surface in SyncIndicator on failed-state with auth error message regex match.
- BUT: if the adapter MIS-CLASSIFIES a stale-claim error as TransientError (not AuthError), it goes through the backoff retry loop instead of the immediate refresh. Hits 5 attempts, dead-letters to Sentry, marks `failed`.
- Selective failure pattern fits: some writes might happen with valid token (succeed), others after token expiration (fail). If token refreshes successfully, subsequent writes succeed.
- v5h-01 §3 documented exactly this: 142 stuck outbox rows + 46 failed; Daniel sign-out/in restored `role: "admin"` claim; reset-and-drain flipped failed → pending.
- SyncIndicator should have shown the recovery button if any auth-flagged failures occurred. Daniel didn't mention this. Two possibilities: (a) failures were classified as Transient (not Auth), so SyncIndicator showed generic Failed without sign-out pairing; (b) failures didn't fire the SyncIndicator state transition because the engine drain succeeded for some rows.

**Evidence from production:** N/A (deferred). **Sentry would have captured dead-letter records if any rows hit 5 attempts** — that's the smoking gun. Current auth state (token age, role claim) would also tell us if Daniel's claim is stale right now.

**Verdict:** ⏳ **STILL OPEN.** Code-scan plausible (auth-claim staleness IS a known failure mode); needs Sentry capture for this morning's user/timeframe to confirm or rule out. **HIGHEST-PRIORITY hypothesis to evidence-check** given known prior art.

---

### H-SL-6: Different bug entirely — new code path not yet traced

**Code surface:** All v5.2 work commits since v5h-01 fix.

**Code-scan analysis (v5.2 audit):**
- v52-02-01: TouchOrPopover `suppressAutoFocus` prop — UI-only, no write path changes.
- v52-02-02: TextCell single-tap-to-edit — covered by H-SL-1.
- v52-03-01: `clearFailedOutboxRows` + sign-out — only deletes outbox rows; doesn't write to tracks.
- v52-04-01: SetlistCards Tailwind className changes — no writes.
- v52-05-01: `setDefaultForServiceType` writes to `config/defaults` via direct `setDoc` (NOT through applyEdit, NOT through outbox, NOT to tracks).

**No v5.2 work introduced a non-applyEdit write to tracks/setlists.** ✓

**Specific code-scan candidate considered + analyzed:** snapshot-listener cached-then-fresh delivery race. v5h-01-02 fix at lines 187-189 (setlists) + 233-236 (tracks) holds: `if (local.updatedAt === undefined) return; if (local.updatedAt >= delivery.updatedAt) return`. The fix prevents cached delivery from clobbering local edits when local.updatedAt is undefined (engine writeback skipped) or when local.updatedAt is at-least-as-new as delivery.

Edge case examined: if `result.updatedAt` from `commitOutboxRow` is `undefined`, engine.ts:266 skips local writeback, leaving `local.updatedAt` at whatever applyEdit set it to (or undefined). v5h-01-02 guard catches this. ✓

**Evidence from production:** N/A (deferred). Sentry breadcrumbs from this morning would surface anything traced; without them, we cannot rule out a yet-unidentified code path.

**Verdict:** ⏳ **STILL OPEN** by default for "different bug entirely" — no specific code-scan candidate found, but code-scan cannot exhaust possibility space. Sentry + IndexedDB outbox capture would surface anomalies.

---

## ChartBind H2 (Sibling Diagnosis)

**Status:** ⏳ DEFERRED. Songs-table count not captured. Cannot resolve from code-scan alone — depends on iPad's actual hydrated songs count this morning.

**Recommendation for v53-02:**
- IF eventual capture shows songs table empty/stale → ChartBindPopover H2 confirmed → systemic-fix path (recents + value format + library priming) for v53-02.
- IF capture shows hundreds of songs → H2 ruled out → smallest-fix path (cmdk value format only, ~10 LOC) sufficient for v53-02.

Back-propagation note added to `RESEARCH-SYNTHESIS.md` (next bullet).

---

## Anti-pattern Audit (cross-reference v5h-01 postmortem)

| # | Pattern | Status | Location |
|---|---|---|---|
| 1 | `firestore.rules` includes `match /tracks/{trackId}` block (v5h-01-02 fix E) | ✅ INTACT | `firestore.rules:115-120` |
| 2 | `firestore.rules` includes `match /songs/{songId}` block (v5h-01-02 fix E) | ✅ INTACT | `firestore.rules:128-133` |
| 3 | Snapshot-listener LWW guard with strict-equality undefined check (v5h-01-02 fix B) | ✅ INTACT | `snapshot-listener.ts:186-189` (setlists), `:233-236` (tracks) |
| 4 | Snapshot-listener `hasPendingOutboxRow` guard | ✅ INTACT | `snapshot-listener.ts:178, 212` |
| 5 | Engine writeback atomicity (engine.ts ~262-282) — outbox.delete + entity.put in same tx | ✅ INTACT | `engine.ts:259-282` |
| 6 | Engine writeback skips when `result.updatedAt === undefined` (preserves local) | ✅ INTACT | `engine.ts:266` |
| 7 | Sentry dead-letter capture (v50-07-05) on 5th-attempt failure | ✅ INTACT | `engine.ts:398-404` |
| 8 | Auth-error dead-letter capture | ✅ INTACT | `engine.ts:367-372` |
| 9 | RemoteDocMissing terminal capture | ✅ INTACT | `engine.ts:322-333` |
| 10 | No new Firestore sub-collection write paths added without rules | ✅ AUDIT PASSES | v52-05 added `match /config/defaults` (rules:212-215) for new write path; tracks/setlists/songs unchanged |
| 11 | No dual-write to embedded `setlists/{id}.tracks[]` + top-level `tracks/{id}` | ✅ AUDIT PASSES | Lazy-hydration cascade (v50-07-03) reads embedded `tracks[]` only when `hydrated !== true`; new edits go to `tracks/{id}` only |
| 12 | No optimistic-write state machines outside applyEdit | ✅ AUDIT PASSES | v5.2 work (v52-02..05) audited; no new write paths bypass applyEdit; v52-05 setDefaultForServiceType is one-shot setDoc to `config/defaults` (different doc, different concerns) |

**Anti-pattern audit verdict:** ✅ ALL v5h-01 fixes still in place. No regression on the defense-in-depth contract. No new Firestore paths missing rules. No new optimistic-write paths bypassing applyEdit.

---

## Harness Fidelity Gap (v5h-01 §5 action item #2)

**Status:** ⚠️ STILL OPEN — recurrence is evidence the deferral was wrong.

**v5h-01-04 deferred:** Firebase emulator integration + thin RTL editor↔perf-view test pair would have provided harness fidelity to catch this class of save-loss. The kitchen-sink harness (v50-07-04) uses in-memory zero-latency adapters that miss cache-vs-fresh races AND don't model real Firestore rules enforcement.

**v5h3 implication:** Whether the v5h3 cause is auth-claim staleness (H-SL-5), TextCell race (H-SL-1), or a different bug (H-SL-6), the kitchen-sink harness should have caught it but didn't. v5h3-01-03 postmortem MUST escalate this gap as a v5.4-or-sooner commitment, OR v5h3-01-02 fix should be "harness-fidelity-only" (build the emulator harness; reproduce the recurrence in CI; the act of reproduction reveals the cause).

---

## Ranked Confidence Matrix

| # | Hypothesis | Status | Confidence | Evidence | v5h3-01-02 fix scope est. |
|---|---|---|---|---|---|
| 5 | H-SL-5: Auth-claim staleness redux | ⏳ STILL OPEN | MEDIUM (known prior art; consistent with selective failure pattern; needs Sentry confirmation) | None yet — Sentry dead-letter records from this morning would confirm | ~30 LOC if AuthError mis-classification confirmed (adapter error-mapping fix) + sign-out-prompt UX hardening |
| 1 | H-SL-1: TextCell single-tap-to-edit blur/commit race | ⏳ STILL OPEN | LOW-MEDIUM (code path is suspicious post-v52-02-02; no smoking gun in code-scan; needs cell-type-pattern evidence) | None yet — Daniel's recall of which cell types kept vs. lost edits would confirm | ~50 LOC if confirmed (commit-path hardening; e.g., synchronous flush before parent state change) |
| 6 | H-SL-6: Different bug entirely | ⏳ STILL OPEN | LOW (code-scan exhausted; no candidate found; may exist) | None — Sentry breadcrumbs + IndexedDB outbox state would surface | unknown |
| 2 | H-SL-2: Sticky-memory propagation clobber | ❌ RULED OUT | DEFINITIVE (writes songs/{id}, not tracks/{id}) | Code path | N/A |
| 3 | H-SL-3: clearFailedOutboxRows mid-FSM race | ❌ RULED OUT | STRONG (user-triggered only; selective failure incompatible) | Code path; reverses only with Daniel evidence of tapping recovery button | N/A |
| 4 | H-SL-4: config/defaults pump-capacity contention | ❌ RULED OUT | DEFINITIVE (bypasses outbox; no shared capacity) | Code path | N/A |

**Code-scan narrowed 6 → 3 still-open. Cannot disambiguate further without production evidence.**

---

## Recommended Fix Shape for v5h3-01-02

**round-2 capture needed.** Three hypotheses (H-SL-1, H-SL-5, H-SL-6) remain open after code-scan. Picking single-cause or multi-cause without evidence repeats v5h-01 §2 "3 wrong handoff hypotheses" mistake.

Two round-2 paths to consider at the decision checkpoint:

### Round-2 Option A: Manual capture (Daniel does iPad inspection)

When Daniel has time + access to the affected iPad in its current state (IndexedDB still intact post-refresh), run the deferred AC-1 capture: IndexedDB outbox + tracks state + songs count + Sentry filter for this morning + auth state + cell-type-pattern recall.

**Pros:** Uses what's already there; no code changes; closes the diagnosis fast if Daniel can carve 30min.
**Cons:** Requires Daniel's time on the affected iPad; if too much time passes, IndexedDB outbox may auto-drain or get cleared by background app activity.

### Round-2 Option B: Auto-capture instrumentation (v5h3-01-01b plan)

Build automatic capture infrastructure:
- Add explicit Sentry breadcrumbs at key commit/write paths (TextCell.commit, applyEdit, engine.drainOnce per-row, snapshot-listener handleTracks)
- Add IndexedDB-persisted "edit recovery log" — every commit logs payload metadata + timestamp + cell-type to a Dexie table; on next mount, oldest N entries upload to Sentry as breadcrumb sequence
- Deploy to production
- Wait for next recurrence; auto-capture surfaces the cause without Daniel having to do anything

**Pros:** Automated; catches future recurrences without Daniel intervention; feeds harness-fidelity work in v5h3-01-03.
**Cons:** ~2-4h to build + deploy; one wait window for next recurrence (could be days/weeks); breadcrumb noise needs to be tuned to not pollute Sentry.

### Round-2 Option C: Manual capture (Option A) NOW + Auto-capture (Option B) PARALLEL

Best of both: Daniel captures what he can right now; auto-capture gets built so future recurrences are caught even if this one's evidence is degraded.

**Pros:** Maximum information; future-proofs; closes harness-fidelity gap incrementally.
**Cons:** Larger v5h3 scope (Option A + Option B + actual fix shape).

---

## Open Questions for Daniel

1. **Sentry access:** Can Sentry be queried for any captures with user=Daniel (UID), date range = 2026-05-02 morning hours? v50-07-05 instrumentation should have logged any dead-letter writes with tags `feature: 'dead-letter'`, `collection`, `docId`, `op`, `attempts`. **Even one matching record is high-value evidence.**
2. **Recall:** Of the edits that didn't save this morning, do they share a pattern by cell type? E.g., all the lost edits were in Notes/Title fields (TextCell) vs. Key/Type/Lead picker (DropdownCell)? This is the H-SL-1 disambiguator and Daniel can answer from memory without re-opening the iPad.
3. **Affected setlist still recoverable:** is the iPad still on the affected setlist tab (post-refresh), or has Daniel navigated away? IndexedDB outbox/tracks state from this morning may still be inspectable if the iPad hasn't been further used.
4. **Round-2 path preference:** A (manual capture when possible), B (auto-capture instrumentation deploy), or C (both)?

---

## Files

- This investigation: `.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md`
- Source files audited (read-only): snapshot-listener.ts, engine.ts, cleanup.ts, TextCell.tsx, defaults.ts, firestore.rules
- Plan: `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-01-PLAN.md`

Zero source code modified. `git diff sheet-music-app/src/ sheet-music-app/firestore.rules` empty.

---

## Verdict Summary

- 6 hypotheses → 3 RULED OUT (H-SL-2, H-SL-3, H-SL-4) by code-scan; 3 STILL OPEN (H-SL-1, H-SL-5, H-SL-6) requiring evidence.
- Highest-priority evidence target: Sentry filter for this morning (closes H-SL-5).
- Anti-pattern audit: ✅ all v5h-01 fixes intact; no new Firestore paths missing rules; no new write paths bypassing applyEdit.
- Harness fidelity gap (v5h-01 §5 action item #2): ⚠️ still open; recurrence is evidence the v5h-01-04 deferral was wrong.
- Recommended fix shape: **round-2 capture needed**. Daniel decides between Option A (manual when possible), B (auto-capture instrumentation v5h3-01-01b plan), or C (both).
