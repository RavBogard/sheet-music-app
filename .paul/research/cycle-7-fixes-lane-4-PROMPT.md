# Cycle-7-fixes Lane 4 — Misc bundle (harness + AI enrichment + MCP polish + housekeeping)

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-TRIAGE.md`** §3 per-instance catalog → THIS FILE.

**Role:** IMPLEMENTER. Standard CODER.md §Worktree-setup.

**Bearer:** admin `crl_live_*` from pool row `ASSIGNMENT=cycle-7-fixes-lane-4`.

**Wall-clock budget:** ~120 min (lane bundles many small fixes; each is narrow but they add up).

**Branch:** `feat/cycle-7-fixes-4-misc`
**Worktree:** `sheet-music-app-cycle-7-fixes-4-misc/`
**Cut from:** origin/master tip.

---

## §0 — Mission

Bundle 9 narrow fixes that don't justify their own lane but collectively close 9 cycle-7 findings + 3 housekeeping items. Each sub-task is small (≤30 LOC most); the bundle's coordination overhead is the cost. Ship as a single FF commit if possible; multi-commit if narrow-lane caveat applies.

Sub-tasks listed in dependency-friendly order (do them in this order to minimize file-touching ping-pong):

---

## §1 — Sub-task A — Probe harness Web-SDK wiring (C7I2-008 + C7I3-005)

**Surface:** `src/lib/firebase.ts` — the Firebase Web-SDK exports.

**Approach:** env-gated `window.__c7_auth_for_probes__` exposure. When `process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH === '1'`, attach the `auth` instance + a `signIn(customToken)` helper to `window` so cowork Playwright drivers can wire `firebaseAuth: getAuth()` from `page.evaluate`. When env is absent (i.e. production), do nothing — zero exposure.

Per Instance 2's proposed shape — ~3 lines:

```typescript
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH === '1') {
  ;(window as any).__c7_auth_for_probes__ = {
    auth,
    signIn: (token: string) => signInWithCustomToken(auth, token),
  }
}
```

**Acceptance:** with `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1` set in env, `cycle-4/harness/lib/probe.mjs::mintSession` can invoke `signInWithCustomToken` via `page.evaluate('window.__c7_auth_for_probes__.signIn(token)')`. Production build (env unset) doesn't expose anything.

---

## §2 — Sub-task B — `create_template_from_setlist` MCP tool (C7I1-007)

**Surface:** `src/lib/mcp/tools/templates.ts` (the Lane 2 cycle-6-fixes ship).

**Approach:** add a new MCP tool that inverts `clone_setlist_from_template`. Reads an existing setlist, snapshots its tracks into a new `setlistTemplates/{templateId}` document. Carries over `templateType` (configurable; default `null`), preserves track field shape (per `COPYABLE_TRACK_FIELDS` in templates.ts), sets `ownerUid` to caller. Trusted-leader gate.

Register in `src/lib/mcp/tools/index.ts` (verify there's no merge conflict with Lane 3's registrations — coordinate via HEADS-UP).

**Acceptance:** `create_template_from_setlist({setlistId, name, templateType?:string|null})` returns `{ok:true, templateId, trackCount}`. Subsequent `get_template({templateId})` returns the snapshotted tracks. Emulator test coverage.

---

## §3 — Sub-task C — Bearer TTL bug (C7I1-011)

**Surface:** `src/lib/mcp/tokens.ts` + `src/app/api/auth/test-session/route.ts` + wherever band_leader test sessions get their `expiresAt`.

**Investigation:** Instance 1 reproduced band_leader bearer rejected as `invalid_token` at ~10min despite advertised 4h TTL — TWICE with two independently-minted c7i1 bearers. Possible causes:
1. Session-store eviction (Firestore TTL or in-memory cache evicts before claimed expiry).
2. JWT TTL hardcoded somewhere (the 4h claim is from one path, the actual check uses a different shorter TTL).
3. Rate-limit-store conflation (premature revoke).

**Approach:** investigate first; fix once cause is identified. Fix path likely involves either updating the advertised TTL to match actual (10min) OR fixing the path to honor 4h. Daniel-action ratify: if it's a deliberate ~10min TTL by design and only the messaging is wrong, just fix the messaging. If it's a bug, fix it.

**Acceptance:** band_leader test sessions either (a) consistently live for the advertised TTL, or (b) consistently advertise the actual TTL (whichever is the correct intent — document the decision in HANDOFF).

---

## §4 — Sub-task D — AI enrichment cache writer audit (C7I4-004)

**Surface:** the NEW-3 AI enrichment subscriber path (recent ship; `subscriberActive:true` in `getAiConfig` but `aiEnrichmentCache=0`, `aiCorrectionSignals=0`, `enrichmentStatus=null` on 50/50 library sample 24h post-ship).

**Investigation:** read-only Instance 4 couldn't disambiguate dormant-by-no-input from broken-writer. As implementer with admin bearer + write capability, you can:
1. Force-trigger an enrichment via `proposeAiEnrichment` MCP tool (if it exists) or by uploading a test chart.
2. Watch `aiEnrichmentCache` for a new row.
3. If write fires → writer is fine, system is dormant-by-no-input (no charts uploaded post-NEW-3-ship).
4. If write doesn't fire → writer is broken; instrument the subscriber path.

**Acceptance:** HANDOFF documents the diagnosis. If broken: fix shipped + emulator test. If dormant-by-no-input: documented as INFO (no fix needed) plus optionally a backfill action — run enrichment on existing library entries to seed the cache.

---

## §5 — Sub-task E — Memory + decision updates (C7I4-003 + AUDITOR.md amendment)

**Three updates:**

1. **`[[project_orphan_baseline]]` 272 → 24.** Edit `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\memory\project_orphan_baseline.md` to reflect actual prod state per C7I4-003. Update MEMORY.md if the description line references the old number.
2. **Promote `[[feedback_mcp_lane_deployed_surface_evidence]]` into `AUDITOR.md §Validation-workflow`.** Per ratified Decision 2. Add the promotion text (drafted in `.coord/inbox/auditor.md` 2026-05-19T23:30Z message). After promoting, delete the feedback memory file + remove from MEMORY.md index.
3. **Update PARENT + iPad-shadow CHECKLIST mental-model correction.** Edit `.paul/research/cycle-7-cowork-PARENT.md` §1 mission roster (Instance 3 row) AND `.paul/research/cycle-7-ipad-shadow-CHECKLIST.md` §4 to reflect that `api/setlists/notify-updated` is the in-app notif fanout endpoint, NOT the live-edit listener path. Real live-edit primitive is `wait_for_setlist_change` + `useSetlistPerformance` Dexie snapshot listener.

**Acceptance:** memory updates land; AUDITOR.md amendment lands; feedback memory deleted; PARENT + CHECKLIST corrected. These are documentation changes only — no test coverage needed.

---

## §6 — Sub-task F — `PerformanceBottomBar` orphan removal (C7I2-007)

**Surface:** wherever `PerformanceBottomBar` lives in `src/components/performance/` (verify via `find`).

**Approach:** confirm zero consumers via `git grep -nE "PerformanceBottomBar"` returns zero src/ matches; then delete the file. Check for any `import` references that would break the build (should be none).

**Acceptance:** file deleted; `next build` clean.

---

## §7 — Sub-task G — Hebrew phonetic transliteration in `search_library` (C7I1-012)

**Surface:** `src/lib/mcp/tools/library.ts` — `search_library` query path.

**Decision required:** implement fuzzy-match OR document as known limitation. Daniel-action recommendation: **DOCUMENT for now**. Hebrew phonetic matching is non-trivial (Levenshtein with custom Hebrew weights, or a phonetic algorithm like Soundex adapted for Hebrew transliterations). Out of cycle-7-fixes scope.

**Approach:** add a doc-string comment to the `search_library` tool registration + the relevant code path noting the limitation. Add a finding to the project backlog (or a new `[[project_hebrew_phonetic_search_deferred]]` memory) for future implementation.

**Acceptance:** documented; no code change to the search logic itself.

---

## §8 — Sub-task H — Misc envelope hint corrections + error UX (C7I1-005 + C7I2-006 + C7I3-003 + C7I3-004)

**4 small fixes:**

- **C7I1-005:** `suggest_band` error envelope hint says "Check Firestore connectivity" but the actual problem (was the) missing index. Now that the index is deployed (this session), the 500 should auto-resolve. **Update the hint** to be more diagnostic-honest: `"Check Firestore index status at console.firebase.google.com/project/<PROJECT_ID>/firestore/indexes"`. Surface: wherever `suggest_band` builds its error envelope (likely `src/app/api/scheduling/suggest-band/route.ts`).
- **C7I2-006:** `/api/mcp/tokens` 401 hint copy is unclear about WHY it's 401. Suggest more diagnostic copy: distinguish "no Authorization header" vs "invalid bearer" vs "expired bearer". Surface: `src/app/api/mcp/tokens/route.ts`.
- **C7I3-003:** position-arg silent-normalize — `add_track_to_setlist {position:999}` on a 10-track setlist clamps to end-of-list without warning. Either return rich-envelope warning (`warning: 'position clamped from 999 to 10'`) or document as intended.
- **C7I3-004:** `lastModifiedBy` stale on rejected (stale-version) write. Either rename to `lastObservedModifiedBy` OR fix to reflect actual winner of last race. Decision: **rename + document** is lower-risk (existing reads keep working with the renamed field once aware).

**Acceptance:** each sub-fix lands or is documented as decision-made; HANDOFF lists each with verdict.

---

## §9 — Sub-task I — webVitalsObservations read surface (C7I4-005)

**Surface:** new MCP tool `get_web_vitals_summary({route?, sinceDays?:7})` in `src/lib/mcp/tools/`. Or HTTP route `/api/admin/web-vitals/summary` if MCP isn't preferred for admin reads.

**Approach:** query `webVitalsObservations` Firestore collection; compute p75 LCP/FID/CLS per route; return aggregate. Admin-only auth gate.

**Acceptance:** Daniel can call `get_web_vitals_summary` via Claude Desktop OR hit `/api/admin/web-vitals/summary` with admin session and see p75 stats per top-5 routes by sample count.

---

## §10 — Sub-task J — Optional: prune the 4 stale Firebase composite indexes

**Context:** Firebase CLI noted 4 indexes exist in prod that aren't in our `firestore.indexes.json` (console-clicked debugging indexes from past sessions). Cleanest path is to enumerate them, decide which are still useful, and either add to the config file (preserve) or run `firebase deploy --only firestore:indexes --force` (delete-unsynced).

**Decision required:** Daniel-action OR Lane 4 coder discretion. Recommend enumerate-and-document only this lane; let Daniel decide deletion at TRIAGE time.

**Acceptance:** HANDOFF documents the 4 indexes (collection group + fields) + a recommendation per-index (keep or delete).

---

## §11 — REPROs (mandatory for substantive changes; documentation-only changes don't need REPROs)

Required `## Repros` for:
- Sub-task A — probe harness wiring (verify `window.__c7_auth_for_probes__` exists with env flag on, absent without).
- Sub-task B — `create_template_from_setlist` end-to-end (create + verify via `get_template`).
- Sub-task C — bearer TTL fix (mint + observe TTL behavior at advertised expiry).
- Sub-task D — AI enrichment writer audit (force-trigger + observe cache row).
- Sub-task F — `PerformanceBottomBar` deletion (next build clean).
- Sub-task I — webVitalsObservations read surface (admin call returns p75 stats).

Optional/documentation: E (memory updates), G (Hebrew docs), J (index enumeration).

---

## §12 — Hard rules

- Don't touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- Claim shared files in `.coord/shared/claims.md` before editing. Likely contended: `src/lib/mcp/tools/index.ts` (Sub-tasks B + I touch registrations); `firestore.rules` (Sub-task I admin-read rule), `src/lib/mcp/tools/templates.ts` (Sub-task B).
- HEADS-UP Lane 3 before touching `src/lib/mcp/tools/index.ts` — coordinate registration order to avoid merge conflict.

---

## §13 — HANDOFF requirements

SHIP-NOTICE `msg-from-coder-4-cycle7-fixes-4-ship` to `.coord/inbox/supervisor.md`:
- Ship SHA + branch + commit summary
- Per-sub-task PASS/FAIL/DOCUMENTED with brief explanation
- `## Repros` for the sub-tasks that have them
- Bearer-burn: pool row `ASSIGNMENT=cycle-7-fixes-lane-4` → `ASSIGNMENT=burned`

---

## §14 — Bail-out conditions

- HARD-BLOCK if any sub-task scope balloons (e.g. Sub-task C bearer-TTL investigation uncovers a deeper auth-store issue) — surface, possibly carve off as a separate lane.
- DEGRADED-OK on Sub-tasks G + J — these are explicit "document and defer" candidates by design.

---

*from supervisor*
