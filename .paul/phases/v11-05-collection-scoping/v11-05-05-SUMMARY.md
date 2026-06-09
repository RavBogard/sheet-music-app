---
phase: v11-05-collection-scoping
plan: 05
subsystem: ui
tags: [multi-tenant, vocab, creation-wizard, firestore, org-scoping, zustand, react]

requires:
  - phase: v11-03-03
    provides: "label(org,key) + hidesLiturgicalFields(org) vocab helpers"
  - phase: v11-05-04
    provides: "client host-org pattern coerceOrgId(document.documentElement.dataset.org)"
  - phase: v11-04
    provides: "where('orgId','==',org) dashboard reads that the in-app create must satisfy"
provides:
  - "orgId stamped on all in-app setlist creates (createSetlist/cloneSetlist/duplicateSetlist)"
  - "de-synagogued CreationWizard / PublicSetlistListing / SetlistCards for the band tenant"
affects: [v11-06]

tech-stack:
  added: []
  patterns: ["client host-org default in the firebase service layer (coerceOrgId(dataset.org))", "per-surface vocab key (don't share a key across surfaces with different CRC strings)"]

key-files:
  created: []
  modified: [src/lib/setlist-firebase.ts, src/lib/org/vocab.ts, src/components/setlist/wizard/CreationWizard.tsx, src/components/performance/PublicSetlistListing.tsx, src/components/setlist/SetlistCards.tsx, src/lib/setlist-firebase.test.ts, src/lib/org/__tests__/vocab.test.ts]

key-decisions:
  - "Stamp orgId at the firebase service layer (host default) so no in-app create caller is missed"
  - "clone/duplicate inherit the SOURCE setlist's orgId (rowOrg), not the host"
  - "wizardNamePlaceholder is its own key — the wizard's CRC placeholder differs from the edit-sheet's"
  - "Band tenant loses the liturgical clone-offer strip (hidden), keeps date+name+template"

patterns-established:
  - "Per-surface vocab key when two surfaces share a concept but have different CRC strings"

duration: ~40min
started: 2026-06-09T11:13:00Z
completed: 2026-06-09T11:36:00Z
---

# Phase v11-05 Plan 05: In-app orgId Stamp + Vocab De-synagoguing Summary

**Every in-app setlist create now stamps `orgId` (host default for new, source-inherited for clone/duplicate) so band-tenant setlists are visible on their own dashboard, and the CreationWizard / public listing / display cards speak band vocab for Brothers Lazaroff while remaining byte-identical for CRC. This closes phase v11-05.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Started | 2026-06-09T11:13:00Z |
| Completed | 2026-06-09T11:36:00Z |
| Tasks | 2 completed (all PASS) |
| Files modified | 7 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: In-app create stamps orgId (host default) | Pass | createSetlist → hostOrgId(); explicit additionalData.orgId wins; clone/duplicate inherit source via rowOrg. 5 unit cases in setlist-firebase.test.ts |
| AC-2: BL in-app setlist visible on BL dashboard | Pass | orgId='brotherslazaroff' stamped → matches the v11-04 where('orgId','==',org) filter; not on CRC's |
| AC-3: CreationWizard de-synagogued for BL, CRC byte-identical | Pass | newSetlist/blankSetlist/clone+createSetlistAction/wizardNamePlaceholder via label(); offer-strip + rabbi hidden via hidesLiturgicalFields; CRC bases asserted == prior strings |
| AC-4: Public listing + display cards de-synagogued for BL, CRC byte-identical | Pass | PublicSetlistListing pastSection; SetlistCards planPlaceholder + liturgical Save-as-Default gated; CRC byte-identical |

## Verification Results

- `npx tsc --noEmit` → 0
- `npx eslint` (7 changed files) → 0
- `npx vitest run` (full) → **3323 passed / 0 failed** (78 skipped pre-existing; baseline 3316 + 7 new)
- setlist-firebase.test.ts → 24/24 (+5 orgId cases); vocab.test.ts → 6/6 (+2 cases incl. CRC byte-identical assertion)
- Skill audit: /ui-ux-pro-max invoked ✓ (SPECIAL-FLOWS required skill)

## Accomplishments

- Closed the in-app orgId-stamp gap: a band user creating/cloning/duplicating a setlist in-app no longer produces an orgId-less doc that would vanish from their own (org-filtered) dashboard.
- Completed the v11-03-03-deferred vocab work: the CreationWizard, public perform listing, and display cards now speak band vocab for BL and hide liturgical framing, with CRC provably byte-identical.
- Last v11-05 slice — cross-tenant collection scoping is functionally complete; only the prod deploy gate + the v11-06 isolation audit remain.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-firebase.ts` | Modified | hostOrgId() helper; orgId stamped on createSetlist (host default) + clone/duplicate (source-inherited via rowOrg) |
| `src/lib/org/vocab.ts` | Modified | +6 keys (newSetlist, blankSetlist, cloneSetlistAction, createSetlistAction, wizardNamePlaceholder, pastSection, planPlaceholder) |
| `src/components/setlist/wizard/CreationWizard.tsx` | Modified | useOrg(); band vocab via label(); offer-strip + rabbi hidden via hidesLiturgicalFields |
| `src/components/performance/PublicSetlistListing.tsx` | Modified | "Past services" → label(org,'pastSection') |
| `src/components/setlist/SetlistCards.tsx` | Modified | "Plan Service" → label(org,'planPlaceholder'); liturgical Save-as-Default gated by hidesLiturgicalFields |
| `src/lib/setlist-firebase.test.ts` | Modified | +5 orgId-stamp cases |
| `src/lib/org/__tests__/vocab.test.ts` | Modified | +2 cases (CRC byte-identical + BL override for the new keys) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Stamp orgId at the firebase service layer (host default), not via useOrg in the hook | Covers ALL in-app create callers uniformly; mirrors v11-05-04 congregation-store | No caller-threading to miss; createSetlist signature unchanged |
| clone/duplicate inherit the SOURCE setlist's orgId | You can't clone across tenants; legacy no-orgId → crc (backfilled reality) | Clones stay in their tenant |
| Separate `wizardNamePlaceholder` key | The wizard's placeholder differs from the edit-sheet's namePlaceholder; sharing would change CRC's wizard text | CRC byte-identical preserved |
| Hide the liturgical clone-offer strip for BL | The offer strip is SERVICE_TYPE_LABELS-driven (Erev Shabbat); BL authors mainly via MCP | BL loses in-app clone-last-week; acceptable |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Byte-identical correctness (wizardNamePlaceholder) |
| Scope additions | 1 | +createSetlistAction key (AC-driven) |
| Deferred | 0 | — |

**Total impact:** Two extra vocab keys, both AC/correctness-driven; no scope creep.

### Auto-fixed Issues

**1. [Byte-identical] Reusing namePlaceholder would have changed CRC's wizard placeholder**
- **Found during:** Task 2 (qualify — the wizard placeholder "e.g., Shabbat Morning, Friday Night..." differs from the edit-sheet's namePlaceholder "e.g., Shabbat Morning")
- **Fix:** Added a dedicated `wizardNamePlaceholder` key (CRC base = the exact current wizard string)
- **Files:** vocab.ts, CreationWizard.tsx, vocab.test.ts
- **Verification:** vocab.test.ts asserts the CRC base == the prior hardcoded string

### Scope additions

**1. +createSetlistAction key**
- AC-3 requires "the create button" to use band vocab; the Create button (sibling of the Clone button) needed its own key for consistency. Added "Create Setlist"/"Create Set".

### Deferred Items

None for this slice. (Phase-level: leadHistory/getAllSetlists cross-tenant read remains deferred to v11-06 per v11-05-04.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Local `label` variable in SetlistCards collides with vocab's `label` export | Imported as `orgLabel` alias |

## Next Phase Readiness

**Ready:**
- Phase v11-05 collection scoping is code-complete across all 5 slices (templates, users, assignments, congregation, in-app-create+vocab).
- The v11-06 isolation audit has its inputs: scripts/e2e-bl-tenant-probe.mjs + the per-collection scoping to verify.

**Concerns:**
- **Phase-close DEPLOY GATE not yet run** — 5 prod scripts (backfill-orgid-v11 HARD, user-orgids, david-claim, assignment-orgids, seed-bl-congregation) must run dry-run→--apply, THEN push, in order (templates HARD gate first). These mutate CRC's live prod data + deploy to both tenants.
- leadHistory/getAllSetlists cross-tenant read deferred to v11-06.

**Blockers:**
- None for the code. The deploy gate is the gating operation before push.

---
*Phase: v11-05-collection-scoping, Plan: 05*
*Completed: 2026-06-09*
