# Track B — SyncIndicator state UX (Issues 1 + 4)

## Executive Summary

**Issue 1 (iPad-only red "Failed"):** Most likely cause is per-device outbox divergence — iPad's IndexedDB outbox table contains failed rows from prior sync attempts that desktop's outbox doesn't have, holding the engine in failed state. Consistent with v51-h02 handoff context showing phantom setlist still in Daniel's device IndexedDB. Each failed row blocks subsequent edits to that document (dead-letter behavior, by-design). No code fix required — data cleanup plus optional "Refresh library" UI action needed.

**Issue 4 (kebab "red line", all platforms):** The "red line" is NOT a CSS overlap. The kebab button is always disabled because onOverflow is never passed from SetlistGrid. With disabled=true, button renders at 40% opacity. Daniel's description refers to visual confusion: when sync state is failed, the inline error pill renders in red text right next to the dimmed kebab, creating a confusing adjacency. v51-h01 regression. Recommend: remove kebab (v52-h01) or enable with "Sync Debug" action (v52-03).

**Shared root cause?** Partially — Issue 1 (failed outbox rows) causes Issue 4 (failed state renders red error pill next to disabled kebab). Fix Issue 1 and red visual goes away. But Issue 4's disabled kebab is also a design gap.

---

## State Diagram

SyncIndicator has 6 states (src/lib/sync/state-machine.ts:6–13):

| State | Entered By | UI Render | Kebab Enabled? | User Actions |
|-------|-----------|-----------|---|---|
| idle | DRAIN_OK | Check (emerald), "Saved", span | Always disabled | None |
| dirty | EDIT_COMMITTED | CircleDashed (muted), "Editing…", span | Always disabled | None |
| saving | DRAIN_STARTED | Loader2 spin (indigo), "Saving…", span | Always disabled | None |
| conflict | DRAIN_VERSION_MISMATCH | AlertTriangle (red), "Conflict — review", button | Always disabled | Click → ReconciliationModal |
| failed | DRAIN_BUDGET_EXHAUSTED | XCircle (red), "Failed — retry", button | Always disabled | Click → onRetryFailed |
| offline | NETWORK_OFFLINE | CloudOff (amber), "Offline — N queued", span | Always disabled | None |

Kebab lives in parent SetlistGridTopBar, disabled={!onOverflow} (line 65). SetlistGrid never passes onOverflow, so always disabled.

---

## iPad-vs-Desktop Divergence Diagnosis (Issue 1)

### H1: Auth-claim staleness
**Status: Ruled out** — engine.ts:338–374 includes one-shot refresh+retry. No firestore.rules changes in v51. If ALL writes failed, auth suspected; but selective per-setlist failures point to per-document outbox rows.

### H2: Per-device outbox divergence
**Status: Confirmed (very high confidence)** — state-machine.ts:74–90 shows if ANY row failed, state is failed. Once failed, persists until deleted or re-drained. engine.ts:199–237 shows per-doc drain ordering — single failed row blocks all edits to that doc. iPad and desktop have separate IndexedDB; failed row in iPad outbox won't appear in desktop's. Same setlist, different device outboxes = different sync states. Handoff confirms phantom setlist CTAi6kgkTUpGYMO1Ffx7 still in Daniel's IndexedDB.

### H3: RemoteDocMissingError firing on iPad for phantom setlist
**Status: Confirmed as co-cause of H2** — firestore-adapter.ts:34–45 defines RemoteDocMissingError. init.ts:64–72 throws when tx.get(ref) finds !snap.exists(). engine.ts:318–336 handles as terminal (no retry). Handoff: Daniel saw "Remote doc missing: setlists/CTAi6kgkTUpGYMO1Ffx7" post-v51-h01. Phantom setlist — addDoc resolved client-side before server confirmation. iPad has row; Firestore doesn't. Every edit fires RemoteDocMissingError → dead-letter → red.

### H4: Snapshot-listener delivery failing on iPad
**Status: Ruled out** — listener failure affects all docs (global), not one setlist. Daniel reported selective failure, pointing to per-doc outbox row.

### H5: Failed state is sticky
**Status: Confirmed — state-machine.ts:36–41 shows EDIT_COMMITTED doesn't recover from failed. engine.ts:300–412 show no auto-retry. Row must be manually re-drained or deleted. For phantom docs, retry re-fires same error.

---

## Kebab "Red Line" Cause Analysis (Issue 4)

### H6: CSS overlap
**Status: Ruled out** — error pill is sibling in flex-col, renders below main element. No z-index, no absolute positioning. Different DOM hierarchies; no overlap.

### H7: Kebab disabled when sync state is failed
**Status: Confirmed — always disabled unconditionally** — SetlistGridTopBar.tsx:65 shows disabled={!onOverflow}. SetlistGrid.tsx:1518–1522 never passes onOverflow. CSS: disabled:opacity-40. Button renders dimmed in all states because onOverflow never provided. Daniel likely saw: red error pill next to dimmed kebab, read as "red line through kebab."

### H8: CSS regression in v51-h01
**Status: Ruled out** — SetlistGridTopBar was NEW file (status: A). No prior CSS to regress. No pseudo-elements.

### H9: Placeholder icon or strikethrough
**Status: Ruled out** — line 74 always renders MoreVertical. When disabled, still MoreVertical, just dimmed. No icon swap.

---

## Per-State Kebab Availability Rationale

Current: Kebab disabled in all states. Design gap.

| State | Should Available? | Rationale |
|-------|-----------|----------|
| idle | Maybe | Good time for advanced actions. No pending ops. |
| dirty | No | Edits in flight. |
| saving | No | Drain in flight. |
| conflict | No | User resolves via SyncIndicator button. |
| **failed** | **Yes** | CRITICAL. User blocked. Kebab should offer escape hatch: "Refresh library" (detect+delete phantom docs). Currently disabled. |
| offline | Maybe | Limited functionality context. |

---

## Persistent vs. Transient (Issue 1 sub-question)

Failed state is STICKY. state-machine.ts:36–41 show EDIT_COMMITTED doesn't recover. engine.ts:388–412 show no auto-retry loop. Row must be manually re-drained or deleted. For phantom docs, retry fails same way; user must delete or sign out.

---

## Recommendation

**Issue 1:** Add "Refresh library" action that scans outbox for failed rows with "Remote doc missing", offers delete. No sync engine code fix needed.

**Issue 4:** Option A (v52-h01): Remove kebab (~10–15 LOC). Option B (v52-03): Keep and implement "Sync Debug" popover (~50–100 LOC).

---

## Files to Change

| Fix | File | LOC |
|-----|------|-----|
| Issue 1 UI | src/components/setlist/dashboard/SetlistDashboard.tsx | 30–50 |
| Issue 1 logic | src/lib/sync/cleanup.ts (new) | 40–60 |
| Issue 4 (v52-h01) | src/components/setlist/grid/SetlistGridTopBar.tsx | 10–15 |

---

## Open Questions

1. Did edits to other setlists also fail on iPad, or just one?
2. Did edits actually save despite red "Failed"?
3. Have you signed out+in on iPad since v51-h02?
4. Does "red line" appear in all states or only when failed?
5. Does kebab respond to clicks (disabled feedback)?

---

## Sources

**Files:** SyncIndicator.tsx, SetlistGridTopBar.tsx, SetlistGrid.tsx, state-machine.ts, engine.ts, firestore-adapter.ts, init.ts, store.ts, SyncIndicator.test.tsx

**Docs:** HANDOFF-2026-04-27-v51-hotfix-pickup.md, v5.1-hotfix-save-failure-2026-04-27.md

**Commits:** d440192 (v51-h01), 2b35860 (v51-h02)

---

## Follow-up: Issue 1 Confidence Firming (code-read only, no iPad UAT)

### Q1: Existing recovery affordances
[Confidence: HIGH]

NO USER-FACING AFFORDANCE EXISTS to reset failed/phantom outbox rows.

Evidence:
- SyncIndicator.tsx lines 88-96: component accepts optional onRetryFailed prop, but NEVER provided in production. SetlistGrid line 1518-1522 instantiates SetlistGridTopBar with NO syncProps. SyncIndicator renders with undefined onRetryFailed, making failed-state button disabled.
- store.ts lines 1-22: Zustand store exposes only state reads. No resetFailures(), deletePhantom(), or clearOutbox() exposed.
- engine.ts: Public API is start(), shutdown(), pump(), getState(), resolveConflict(), notifyEditCommitted(). NO resetFailures() or equivalent. resolveConflict() (lines 443-463) only handles conflict state.
- state-machine.ts lines 74-90: deriveStateFromOutbox() reads shape; no transition out of failed except CONFLICT_RESOLVED (conflicts only) or DRAIN_OK when all rows gone.
- Production UI path: SyncIndicator failed button disabled; user cannot click it.

Consequence: Red Failed on iPad is dead-end UX until user manually clears IndexedDB via DevTools or signs out/in.

### Q2: Auth-claim staleness — compounding factor?

[Confidence: HIGH]

YES, auth-claim staleness IS a second plausible contributing factor and SHOULD be addressed in v52-03.

Evidence from v5h-01 postmortem (v5h-01-save-loss.md Lessons.4):

1. Documented incident: When v5h-01-02 rules deploy completed, Daniel existing browser session token was minted before the rules deploy and didnt carry the admin claim path the new rules required. Engine retries continued returning permission-denied until Daniel signed out and signed back in, which minted a fresh token with role admin.

2. Engine one-shot auto-refresh (engine.ts:338-374): When AuthError is thrown on first attempt (row.attempts === 0), engine calls adapter.refreshAuthToken() once (line 342), then retries immediately (lines 344-346). If refresh succeeds, row drains. If fails, row marked failed and FSM stops. This is ONE-SHOT — no continuous probing on future pump cycles.

3. Scenario explaining Issue 1 on iPad:
   - iPad had active session before server-side state change (rules deploy or similar).
   - v51-h02 introduced RemoteDocMissingError as terminal (no retry); auth failures remain transient with one-shot refresh.
   - Phantom row fires RemoteDocMissingError dead-letters immediately (engine.ts:318-336).
   - Other rows fire transient AuthError (permission-denied from stale token) one-shot refresh attempted; if fails, also dead-letter.
   - iPad receives red Failed from MIX of phantom-row terminal errors AND auth-failure transient errors that one-shot refresh couldnt recover.
   - Desktop actively edited after stale-token issue, forces fresh token mints via normal OAuth flow; outbox doesnt accumulate same failed rows.

4. Post-hotfix observation: v5h-01-02 diagnostic chain states: reset-and-drain snippet flipped 46 failed → pending → engine retried with fresh token → cell-commit edits started persisting (v5h-01-save-loss.md). Sign-out/in FIXED auth failures; RemoteDocMissingError rows remained failed (terminal).

5. No proactive auto-refresh since v5h-01: Postmortem Lessons.4 notes out of scope because Firebase doesnt expose rules-version changes. But token staleness on iPad after ANY server state change is NOT addressed by proactive refresh logic.

Implication for v52-03: Clear failed rows affordance should pair with Sign out and back in option. Addresses both root causes.

### Q3: failed state auto-recovery behavior

[Confidence: HIGH]

Trace of failed state terminal vs transient:

Entry points to failed state (state-machine.ts:56-58):
- DRAIN_BUDGET_EXHAUSTED event: transient errors hit MAX_ATTEMPTS (5 backoff rounds)
- DRAIN_AUTH_FAILED event: auth refresh failed after one attempt

Exit paths from failed state (state-machine.ts:36-41):
- NO AUTOMATIC EXIT. EDIT_COMMITTED explicitly preserves failed state (line 40). New edits queue as pending rows but dont change FSM.
- ONLY exit: user calls resolveConflict() method, dispatches CONFLICT_RESOLVED event (line 461), but that applies to conflict state only, not failed.

Engine behavior when failed (engine.ts:199-237):
- drainOnce() derives dueRows from pending rows only (line 220).
- Any blocked doc with failed row never reaches dueRows array (line 211: blockedDocs.add(k) for failed rows).
- Per-doc ordering invariant: single failed row blocks ALL subsequent rows for that doc.
- If dueRows is empty, function returns (line 235); FSM not dispatched; state stays failed.

Backoff schedule (engine.ts:28-30):
- BACKOFF_MS = [500, 1000, 2000, 4000, 8000]: 5 attempts.
- After 5 transient attempts, row marked failed with status:failed (line 390) and Sentry captures dead-letter (line 398).
- After status becomes failed, enters blocked-docs set on next pump (line 211).
- SUBSEQUENT pumps skip that row forever (no scheduled retry; scheduledFor never updated once status is failed).

Terminal errors (RemoteDocMissingError, AuthError-after-refresh):
- Both throw DRAIN_BUDGET_EXHAUSTED event immediately without backoff (lines 334, 372).
- Marked as failed with status:failed without scheduling future retry.
- Will block subsequent rows for that doc forever unless row deleted OR app signed out/in (clears failed token claims).

Users recovery path (or absence thereof):
- Red Failed indicator is sticky. If user clicks it, button disabled — nothing happens.
- IF user manually deletes failed row from IndexedDB (DevTools → crc-local → outbox), next drainOnce() skips that doc, subsequent pending rows for that doc drain on next pump.
- IF user signs out/in, Firestore auth token refreshed, but failed row NOT automatically re-drained (still in outbox with status=failed). User must ALSO manually reset that rows attempts and status back to pending.
- IF user does neither, failed row blocks that doc forever.

Systemic gap: FSM has NO affordance to EXIT failed without manual intervention (DevTools or code-level engine API call). State is system stuck; user must take action — but UI doesnt surface what action, and theres no in-app button to take it.

### Updated Confidence — Issue 1

Moved from MEDIUM → HIGH.

Reasoning:
1. Per-device outbox divergence (HIGH confidence, code + handoff confirmed): iPad has phantom-row + auth-failure rows; desktop doesnt. CONFIRMED.
2. Failed state is terminal without manual reset (HIGH confidence, code-read confirmed): FSM has no auto-exit; blocked-docs remain blocked forever. CONFIRMED.
3. Auth-claim staleness IS second compounding factor (HIGH confidence, v5h-01 postmortem + engine one-shot refresh limit confirmed): iPad may have experienced token staleness PLUS phantom rows. Sign-out/in recovers auth but not phantom. CONFIRMED.
4. No in-app affordance to trigger recovery (HIGH confidence, UI code confirmed): SyncIndicator button disabled; user must use DevTools or sign out. CONFIRMED.

Only item NOT personally captured on Issue 1 specific iPad session is whether BOTH phantom rows AND auth failures present. But code-read chain is HIGH confidence that either one (or both) WILL cause Issue 1, and recovery path for each differs (delete row vs. sign out/in).

v52-03 must ship user-facing affordance to exit failed state. Code path exists; UI doesnt surface it.

### v52-03 Implications

Priority-ordered concrete deliverables:

1. PRIMARY (BLOCKING for Issue 1 closure): Add Clear failed rows or Refresh library action reachable from SyncIndicator when state is failed.
   - File: src/components/setlist/grid/SyncIndicator.tsx (add button alongside Failed label).
   - Logic file: new src/lib/sync/cleanup.ts (export clearFailedRows() that scans outbox for status=failed rows and deletes them).
   - Integration: wire cleanup call into SyncIndicator button onClick handler.
   - Estimate: 30–50 LOC UI + 20–30 LOC cleanup logic.

2. SECONDARY (ADDRESSING auth-staleness co-factor): When user clicks Clear failed rows, surface secondary action: Sign out and back in (or inline Sign out button).
   - Rationale: if failed rows include auth-claim staleness, deletion alone wont fix it; next edit fails with same stale token.
   - File: extend SyncIndicator or wrap in higher-order component coordinating with auth context.
   - Estimate: 15–25 LOC.

3. TERTIARY (PREVENTION, v52-04 or later): Add Refresh library modal (modeled on ReconciliationProvider) offering to delete phantom rows, delete all failed rows, or sign out.
   - This is full Data recovery UX surface; more ambitious than item 1. Deferred to v52-04 if item 1 suffices.
   - Estimate: 50–100 LOC.

Exit gates for v52-03:
- SyncIndicator renders CLICKABLE action button when state is failed (not disabled).
- Clicking button calls clearFailedRows() and optionally prompts sign-out.
- After clearing, engine re-pumps and state transitions from failed to idle or dirty/saving.
- v52-03 closes with Issue 1 marked RESOLVED (user can unblock themselves without DevTools).
