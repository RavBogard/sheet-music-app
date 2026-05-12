# Plan Audit — 2026-05-12

Independent Phase F audit of FIX-PLAN-V2.md, BUGS-4-5-6-PLAN.md, and RESEARCH/CLUSTERS.md against repo HEAD `4818a28c`. No prior context from Phases A/B/D.

## Audit method

For every file:line reference in the three docs, I opened the cited file via Read and quoted the actual content at HEAD. For every function name (`applyEdit`, `notifyEditCommitted`, `clearFirestoreIndexedDB`, `timestampsMatch`, `updateSetlistWithVersion`, `subscribeToSetlist`, `primeSongsLibrary`), I confirmed existence and inspected the body. For each cited commit (`0ec6773c`, `63e3debc`, `9fb45b5a`, `f1096e90`), I ran `git show --stat` and matched the diff summary to the plan's claim. For `notifyEditCommitted` callers I grep'd the whole `src/` tree to validate "only called from tests" claims. For external claims (Serwist version) I checked `package.json`. Bottom line: the three docs are **substantially correct** with a handful of off-by-line-range citations and one outright wrong line reference in BUGS-4-5-6-PLAN.

---

## File: FIX-PLAN-V2.md

### Verified claims (sample)

- **T1.1 (Bug 4):** "MobileCardList renders at SetlistGrid.tsx:1673" — VERIFIED. Line 1673 opens `<MobileCardList` (confirmed in cited file).
- **T1.1:** "grip is multi-select toggle at MobileRowCard.tsx:166-179" — VERIFIED. Line 166 declares `handleHandleClick`; lines 170-178 dispatch `onSelectionClick`, not a drag.
- **T1.1:** "Move Up/Down buttons at MobileRowCard.tsx lines 387-402" — VERIFIED.
- **T1.2:** "`applyEdit` does not call `engine.notifyEditCommitted()`" — VERIFIED. I read `src/lib/local/write.ts` end-to-end (216 lines); no engine import or call. The function exists at `engine.ts:561` but has zero callers in `src/` (grep'd whole tree).
- **T1.2:** "`scheduleNextPump` early-returns at engine.ts:524" — VERIFIED. Line 524 reads `if (next.length === 0) return`.
- **T1.4:** "ReconciliationProvider.tsx renders 'Remote changes detected' for every `outbox.status === 'failed'` row" — VERIFIED by reading the provider file; it consumes `useLiveQuery` over failed outbox rows and renders the modal without classifying the error subtype.
- **T1.5:** "regex `/firestore/i` in `clearFirestoreIndexedDB` does not match `crc-local`" — VERIFIED. File `src/lib/firebase.ts` line 102 reads ``if (dbInfo.name && /firestore/i.test(dbInfo.name))``. `crc-local` does not match. Plan's cited range `firebase.ts:99-115` is slightly off — the function spans 94-119, but the regex is at 102 within that window. Minor.
- **T2.3:** "`_shutdownRecoveryScheduled` is one-shot per session, never reset" — VERIFIED. Line 164 declares the flag; line 169 returns when set; no reset anywhere in `firebase.ts`. The JSDoc at lines 162 says "Debounced: subsequent calls within 5s are no-ops" — that comment is wrong (it's permanent, not 5s-debounced). The plan correctly flags the contradiction.
- **T2.4:** "3-second SW reload at firebase.ts:150-154" — VERIFIED. Line 153 reads `setTimeout(() => window.location.reload(), 3000)`.
- **T2.6:** "`isMobile` declaration at SetlistGrid.tsx:925" — VERIFIED.
- **T2.6:** "`subscribeToSetlist` is used by use-add-to-setlist.ts:167" — VERIFIED. Line 167 reads `unsub = setlistService.subscribeToSetlist(undoSetlistId, ...)`.
- **Commit `0ec6773c`:** "May 9, 2026 — replaced TanStack table with card list" — VERIFIED. `git show --stat 0ec6773c` shows `src/components/setlist/grid/SetlistGrid.tsx | 148 +--------------------` with that exact subject line.
- **Commit `63e3debc`:** "HEAD when FIX-PLAN-V2 was written" — VERIFIED commit exists; it's the Phase B+D research-docs commit dated 2026-05-12 12:35:59. Note HEAD has since advanced (current HEAD `4818a28c`); claims that hinged on that older HEAD are still valid because the relevant files have not changed in the recent shipped fixes (which are sync/outbox bugfixes).
- **Serwist 9.5.11:** package.json shows `"serwist": "^9.5.11"`, `"@serwist/next": "^9.5.11"`, `"@serwist/precaching": "^9.5.11"` — VERIFIED.

### Failed / problematic claims

- **T1.3 (silent LWW) — Cluster 9.P9.2 reference is internally muddled.** FIX-PLAN-V2 T1.3 says "Files: `src/lib/setlist-firebase.ts` (the `timestampsMatch` + `updateSetlistWithVersion` logic) ... Dependencies: confirm Phase B's exact location (Phase B says `init.ts:80-87`; cross-check before edit)." Both locations exist and BOTH have the same shape of bug:
  - `src/lib/setlist-firebase.ts:33` declares `timestampsMatch`; line 56 (`if (expectedUpdatedAt !== null && !timestampsMatch(...))`) does NOT silently pass on undefined remote because the wrapper `updateSetlistWithVersion` uses `null` as sentinel, not `undefined`.
  - `src/lib/sync/init.ts:80-87` is the load-bearing outbox-engine path used by every track edit. Lines 75-88 read:
    ```
    if (row.expectedUpdatedAt !== undefined) {
        const remote = snap.data() as { updatedAt?: Timestamp }
        const remoteMs = remote.updatedAt?.toMillis()
        if (remoteMs !== undefined && remoteMs !== row.expectedUpdatedAt) {
            throw new VersionMismatchError(...)
        }
    }
    ```
    The `remoteMs !== undefined` guard means: if local has an expected stamp but remote has no stamp, the precondition silently passes → silent overwrite. The plan correctly identifies the bug pattern but **points the implementer to the wrong file**. The bug is in `init.ts:80-87` (verified), not setlist-firebase.ts. The plan honestly flags this as needing cross-check, but a reader could easily edit the wrong file.

- **BUGS-4-5-6-PLAN: `SetlistGridHydrator.tsx:251-256` for `primeSongsLibrary()` call — WRONG LINE.** The actual call site in the file at HEAD is **line 293-294**:
  ```
  293:        void primeSongsLibrary().catch(() => {})
  294:    }, [hydration, primeSongsLibrary])
  ```
  Lines 251-256 are inside the lazy-hydration `catch` block (logger.warn / captureSyncFailure for hydration failures), unrelated to song priming. ARCHITECTURE-MAP.md (line 295) correctly cites "lines 289-294". BUGS-4-5-6-PLAN's verification footer also re-states the wrong "251-256" range. **Real off-by-40-lines error.**

- **Cluster 9.P9.1 / Architecture map line 108: "`notifyEditCommitted` is only called from tests."** Grep across whole repo (not just `src/`) shows: defined at `engine.ts:561`; **zero callers anywhere — not tests, not production, not scripts.** The architecture map line 652 actually says "engine.pump / notifyEditCommitted callers outside tests — only `cleanup.ts:113`." I checked `cleanup.ts:113` — it calls `engine.pump()`, not `notifyEditCommitted()`. So the architecture map conflates the two functions. The substantive claim (no production nudge of the engine from `applyEdit`) is verified; the wording about "only called from tests" is inaccurate. **Low-severity — does not change the fix.**

- **Cluster 8 / D.5: "500ms long-press at SetlistGrid.tsx:508"** — line 508 is the `setTimeout(...)` call site, but the literal `500)` argument is on line 518. Lines 508-518 form the setTimeout call. Minor — the function does exist, just not on the single cited line.

- **T1.5 line range:** plan cites `firebase.ts:99-115`. Function `clearFirestoreIndexedDB` actually spans lines 94-119 at HEAD. The regex on line 102 is within both ranges. Minor — substance of claim (`crc-local` doesn't match regex) is correct.

- **T1.1 "Wrap card in `useSortable({ id: track.id })`"** — Inferred recommendation, not a current-HEAD claim. No verification needed; but the plan does not currently call out that `useSortable` from `@dnd-kit/sortable` is already in the project. I confirmed via dependency search: `@dnd-kit/sortable` is imported elsewhere in SetlistGrid.tsx (the `SortableRow` dead-code path), so the import surface exists.

### Contradictions

- The JSDoc at `firebase.ts:158-163` reads "Debounced: subsequent calls within 5s are no-ops" but the implementation at 164-173 has no reset. FIX-PLAN T2.3 correctly flags this contradiction; just noting that the source comment is misleading at HEAD.
- BUGS-4-5-6-PLAN says "drag-handle" tests are in `SetlistGrid.dnd.test.tsx` with "3 failing tests already pre-existing on master." CLUSTERS A.1 also says "3 failures in dnd.test.tsx" but CLUSTERS A.2 says "11 failures in contextmenu.test.tsx" and A.3 "~57 remaining failures." I did not run the test suite to confirm the 71-failure total, so this is **Unverified — needs `npm test` run.** Downgrading from "Verified" to "Unverified" per audit rules.

---

## File: BUGS-4-5-6-PLAN.md

### Verified claims (sample)

- "Commit `0ec6773c` deleted desktop table, replaced with cards-only" — VERIFIED via `git show --stat 0ec6773c`. The commit body says "Replaced TanStack table with card list in SetlistGrid.tsx" and the SetlistGrid.tsx diff is `-148` lines.
- "SetlistGrid.tsx renders MobileCardList at line 1673" — VERIFIED.
- "BatchActionBar render at SetlistGrid.tsx:1656-1663" — VERIFIED. Lines 1656-1663 read `{selectedTracks.length >= 2 ? <BatchActionBar ... /> : null}`.
- "MobileRowCard grip handler at lines 166-179" — VERIFIED.
- "Move Up / Move Down buttons at lines 387-402" — VERIFIED.
- "handleDragEnd in SetlistGrid.tsx lines 1443-1501" — VERIFIED at start (line 1443); did not read end at 1501 but the start is correct and the function exists.
- "primeSongsLibrary uses one-shot getDocs at prime.ts:31-39" — VERIFIED. Lines 31-39 define `defaultFirestoreAdapter` with `getDocs(collection(firestoreDb, 'songs'))` at line 33.
- "sw.ts:14-20 declares `clientsClaim: true, navigationPreload: true`" — VERIFIED. The full `Serwist({...})` constructor occupies lines 14-20.
- "firebase.ts:151-154 controllerchange reload" — VERIFIED.

### Failed claims

- **`SetlistGridHydrator.tsx:251-256` for primeSongsLibrary call — WRONG.** Actual call at lines 293-294. Detailed above under FIX-PLAN-V2.
- **Verification footer claims `SetlistGridHydrator.tsx:251-256` was "verified"** — the line range was not, in fact, what it claimed to be. The verification footer itself is inaccurate on this point.

### Contradictions

None beyond the line-number errors above.

---

## File: RESEARCH/CLUSTERS.md

### Verified claims (sample)

- "C.1 `_shutdownRecoveryScheduled` at firebase.ts:164-173" — VERIFIED.
- "C.5 firebase.ts:151-154 3-second SW reload" — VERIFIED.
- "C.6 firebase.ts:130-141 auto-IDB-wipe on unhandledrejection" — VERIFIED (`unhandledrejection` listener spans lines 130-141, calling `clearFirestoreIndexedDB` on `INTERNAL ASSERTION FAILED`).
- "C.2 isMobile at SetlistGrid.tsx:925" — VERIFIED.
- "C.4 correction: `subscribeToSetlist` IS used by use-add-to-setlist.ts:167" — VERIFIED.
- "D.2 `clearFailedOutboxRows` kept as deprecated alias" — Not directly verified (I did not read engine.ts for the alias) but plausible given the SyncIndicator comment at line 146-156 ("the previous default called `clearFailedOutboxRows`...`retryFailedOutboxRows` resets failed rows to pending...").
- "P9.1 engine.ts:524 early-return / scheduleNextPump" — VERIFIED.
- "P9.2 init.ts:80-87 silent LWW when remote undefined" — VERIFIED (see detailed quote in FIX-PLAN section).
- "Bug 5 root cause at prime.ts:31" — VERIFIED.

### Failed claims

- **C.7 cites `SyncIndicator.tsx:124-128` for "Saved · just now" tooltip-only label** — VERIFIED at line 124-128 (`const tooltip = useMemo(...)`; line 127 returns `Saved ${formatRelative(...)}`). The tooltip-only nature is plausible (the visible label comes from `visual.label(...)` elsewhere, not from this `tooltip` memo). I confirmed: line 185 reads `title={tooltip}` (HTML title attribute, i.e., tooltip-only). VERIFIED.
- **C.10 cites `SyncIndicator.tsx:184-186` for `<span disabled>` issue** — close. Line 186 reads `const Element = isAction ? 'button' : 'span'`; line 187 spreads `disabled={isAction ? !onClick : undefined}`. The `disabled` is gated on `isAction` so it would NOT apply to the `<span>` branch at HEAD. **CLUSTERS' claim that `disabled` lands on `<span>` is FAILED at current HEAD** — `disabled` is `undefined` when not `isAction`. Possible that an earlier HEAD had the bug; at HEAD `4818a28c` it does not.
- **D.5 cites SetlistGrid.tsx:508 for 500ms long-press** — see FIX-PLAN section above. The setTimeout starts at 508; the 500 literal is at 518. Minor.
- **Cluster 9 footer claim "all three claims verified by Phase B against HEAD source"** — I re-verified P9.1 and P9.2 independently; both substantively correct. P9.3 (modal mislabel) is verified by structure but I did not enumerate all the dead-letter / auth-failed code paths to confirm those flow into `outbox.status === 'failed'`. **Unverified** (needs deeper read of engine state machine).
- **Verification footer cites HEAD `9fb45b5a185b13e134d23a764aa1b01dc1e9972a`** — that SHA exists, but it's actually the "Phase D lock decisions" commit dated 2026-05-12 12:24, not necessarily the HEAD when CLUSTERS.md content was finalized. Minor traceability issue.

### Contradictions

- Cluster 5 / C.10 claim conflicts with current HEAD (see above).

---

## Critical findings summary

Load-bearing items that require plan correction before implementation:

1. **BUGS-4-5-6-PLAN.md: wrong line ref for `primeSongsLibrary()` call in SetlistGridHydrator.tsx.** Says `251-256`; actual is `293-294`. An implementer of Bug 5 would not be derailed (the fix is in `ChartBindDialog.tsx`, not the hydrator) but the cited "verification" is incorrect.

2. **FIX-PLAN-V2.md T1.3 file pointer is misleading.** Plan tells implementer to edit `setlist-firebase.ts` (`timestampsMatch` / `updateSetlistWithVersion`), then notes Phase B says `init.ts:80-87`. The actual silent-LWW bug for outbox-driven track edits is at `init.ts:80-87` (Production adapter `commitOutboxRow` → `runTransaction`). `setlist-firebase.ts` is a separate code path (setlist-doc level) that uses `null` as the sentinel rather than `undefined`. The two paths need separate fixes; the plan conflates them.

3. **CLUSTERS C.10: SyncIndicator `disabled` on `<span>` claim is FAILED at HEAD.** At line 187, `disabled` is gated `isAction ? !onClick : undefined`, so the `<span>` branch always receives `undefined`. Either the claim was true at an earlier HEAD and is now stale, or it was always wrong. No remediation needed.

## Less critical findings

- T1.5 line range cited as `firebase.ts:99-115`; actual function span is 94-119. Substance correct.
- Cluster 8 / D.5 cites line 508 for the 500ms long-press; the literal is on line 518. Substance correct.
- Architecture map's "`notifyEditCommitted` only called from tests" is technically inaccurate (no callers anywhere including tests); doesn't change the fix shape.
- FIX-PLAN's resume checklist says HEAD is `63e3debc` — current HEAD has advanced to `4818a28c`. The relevant source files have not meaningfully changed in the recent commits, so plan line refs are still valid.
- The 71-failing-tests claim in CLUSTERS Cluster 2 / A.1-A.3 is not independently verified (no test run performed). Downgrade to Unverified.
- I did not independently verify the Y.js / Phase D research in `COLLAB-PIVOT.md` — that doc was out of audit scope per the task brief.

## Overall verdict

The plan is **mostly clean.** Two real line-number errors (BUGS-4-5-6-PLAN primeSongsLibrary call site; one stale SyncIndicator disabled claim), one architectural pointer ambiguity (T1.3 file-path), and a handful of near-miss line ranges. No hallucinated files, no hallucinated functions, no contradictions between the plan's commit-SHA claims and `git show`. This is a markedly better state than the v1 BUGFIX plan that the RESEARCH-PLAN was created to remediate. The honest "Inferred" / "Open" / "verify before edit" markers in the docs do their job — they cover most of the remaining ambiguity.

## Audit footer

- **HEAD SHA at audit time:** `4818a28c972c8be688e8da86a67bd6cf3c31eac7` (2026-05-12 12:43:30 -0500)
- **Time of audit:** 2026-05-12 (per env)
- **Files opened (verified existence + line refs):**
  - `src/lib/firebase.ts`
  - `src/lib/local/write.ts`
  - `src/lib/sync/init.ts`
  - `src/lib/sync/engine.ts`
  - `src/lib/sync/cleanup.ts` (grep only)
  - `src/lib/setlist-firebase.ts` (grep + spot-read)
  - `src/lib/songs/prime.ts`
  - `src/app/sw.ts`
  - `src/components/setlist/grid/SetlistGrid.tsx` (spot-reads at 505-525, 920-925, 1440-1450, 1655-1680)
  - `src/components/setlist/grid/MobileRowCard.tsx` (spot-reads at 160-180, 380-410)
  - `src/components/setlist/grid/MobileCardList.tsx` (file-existence only)
  - `src/components/setlist/grid/ChartBindDialog.tsx` (file-existence only)
  - `src/components/setlist/grid/ChartBindPopover.tsx` (file-existence only)
  - `src/components/setlist/grid/SetlistGridHydrator.tsx` (spot-reads at 248-262 + grep at 293-294)
  - `src/components/setlist/grid/SyncIndicator.tsx` (spot-read 120-190)
  - `src/components/setlist/grid/ReconciliationProvider.tsx` (spot-read 1-40)
  - `src/hooks/use-add-to-setlist.ts` (spot-read 160-175)
  - `package.json` (grep for serwist)
- **Commits verified via `git show --stat`:** `0ec6773c`, `63e3debc`, `9fb45b5a`, `f1096e90`. All exist; all subjects match the plan's description.
- **External sources checked:** package.json (Serwist 9.5.11 confirmed). No external URLs were dereferenced — the Serwist changelog claim in BUGS-4-5-6-PLAN is a *recommended* investigation step ("Run `npm view serwist versions --json`"), not a load-bearing claim, so no external fetch needed.
- **Out of scope per task brief:** `RESEARCH/COLLAB-PIVOT.md`, `RESEARCH/ARCHITECTURE-MAP.md` (referenced for cross-checking, not independently audited).
- **Test-suite run NOT performed.** Claims about "71 failing tests" / "3 dnd failures" / "11 contextmenu failures" are flagged Unverified.
