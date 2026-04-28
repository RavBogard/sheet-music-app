---
phase: v51-03-create-setlist-wizard
plan: 01
subsystem: ui
tags: [react, firestore, hebcal, shadcn, wizard, clone, sticky-memory]

requires:
  - phase: v50-04-song-catalog
    provides: sticky song memory (key/bpm/lead) preserved at READ time via seedTrackFromSong; v51-03 verifies (does NOT modify) this contract
  - phase: v51-02-editor-readability
    provides: editor visual language (locked; v51-03 lands BEFORE the editor surface — wizard only)
provides:
  - findLastMatchingService(serviceType, beforeDate?) on createSetlistService
  - cloneSetlist(source, targetDate) generic clone; cloneForNextWeek now a thin wrapper
  - useCreationWizard.mode/setMode/cloneSource/cloneSourceLoading + auto-default-to-clone effect
  - Three-offer pre-form strip in CreationWizard.tsx (date-driven Clone CTA + Use a template + Start from scratch)
affects: [v51-04 vocal-lead-rename, future template additions, gig-packet print]

tech-stack:
  added: []
  patterns:
    - "Service-type matching as a pure exported helper (`setlistMatchesServiceType`) so the templateType→ServiceType resolution is testable without mocking firestore"
    - "Festival-bucket fan-out: legacy `templateType: 'festival'` matches sukkot/simchat_torah/passover/shavuot specific service types"
    - "Mode-aware wizard: `mode` ('idle'|'clone'|'template'|'scratch') decoupled from data lookup so explicit user intent (template) overrides auto-defaults"

key-files:
  created:
    - src/lib/__tests__/setlist-firebase.test.ts (13 cases: pure helper + service)
  modified:
    - src/lib/setlist-firebase.ts (findLastMatchingService + cloneSetlist + cloneForNextWeek wrapper)
    - src/hooks/use-creation-wizard.ts (mode/cloneSource state + lookup effect + clone branch in create())
    - src/hooks/__tests__/use-creation-wizard.test.ts (+5 cases under "v51-03 clone path")
    - src/components/setlist/wizard/CreationWizard.tsx (date-first reorder + offer strip + clone-mode field hiding)

key-decisions:
  - "Skip shadcn Tooltip: not in src/components/ui/; AC-5 explicitly allows hide-with-explanatory-text. Avoided new dependency."
  - "Date-first reorder: moved Date picker to the top of the form so the offer strip can react to it. Tablet-first wins (44px+ full-width fields > 2-col cramped grid)."
  - "Pure helper extraction: setlistMatchesServiceType exported separately from the firestore-coupled findLastMatchingService so 6 of 13 tests run with zero mocks."
  - "Mode auto-defaults to 'clone' ONLY when current mode is 'idle' — handleTemplateSelect locks mode='template' BEFORE setEventDate fires, so template intent isn't clobbered by the lookup effect."
  - "Hide Name + Template inputs when mode='clone': user committed to the clone path; name comes from generateSetlistName(targetDate) inside cloneSetlist. Cancel + Clone button is the whole UI."

patterns-established:
  - "Best-effort firestore lookup: findLastMatchingService catches errors and returns null so the wizard degrades silently to 'no clone offer' on offline/permission failures"
  - "Verbatim-copy clone: source.tracks pass through cloneSetlist unmodified; sticky-memory propagation happens at READ time on next ChartBindPopover use, never at write time"
  - "Public-surface preservation via wrapper: cloneForNextWeek's signature unchanged; refactored as `cloneSetlist(source, dateAdd(source.eventDate, 7))` so EmptyState's 'Make next week's' CTA is untouched"

duration: ~95min
started: 2026-04-27T18:30:00Z
completed: 2026-04-27T18:55:00Z
---

# Phase v51-03 Plan 01: Smart Create-Setlist Wizard — Summary

**Date-aware New Setlist wizard now offers three priority-ordered paths (Clone last matching service / Use a template / Start from scratch) driven by Hebcal-inferred service type from the picked date.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min wall time on a fresh resume session |
| Started | 2026-04-27T18:30:00Z |
| Completed | 2026-04-27T18:55:00Z |
| Tasks | 5 of 5 (3 auto + 1 verify + 1 HUMAN-VERIFY) |
| Files modified | 4 |
| Files created | 1 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: findLastMatchingService returns most recent match | Pass | Test "returns the most recent matching setlist before the cutoff date" — returns C (most recent friday_night) over A (older). |
| AC-2: Falls back to inferred type when templateType missing | Pass | Test "matches by inferring service type when templateType is missing (legacy)" + pure helper case "missing templateType falls back to inference (legacy setlists)". |
| AC-3: Returns null when no match | Pass | Test "returns null when no candidate matches" + "returns null gracefully when getDocs throws (offline / permission)". |
| AC-4: Wizard surfaces Clone CTA when match exists | Pass | Component renders brand-colored Clone primary CTA with `Clone last {SERVICE_TYPE_LABELS[type]} ({format date})` when `cloneSource` is non-null. |
| AC-5: Wizard hides/disables Clone CTA when no match | Pass | No-match path renders explanatory text "No prior {service-name} to clone yet — pick a template or start from scratch below." (AC-5 hide-with-text alternative). |
| AC-6: Clone path creates new setlist via cloneSetlist with target date | Pass | Hook test "clone create() invokes cloneSetlist with the chosen date and routes to the new setlist" asserts `cloneSetlist(source, TARGET_FRIDAY)` call. |
| AC-7: Sticky song memory propagates through clone path | Pass | Hook test "verbatim copy" snapshots source.tracks before clone, asserts `passedSource.tracks` deep-equals snapshot, key='D' bpm=96 preserved. defaults.ts NOT modified (boundary diff empty). |
| AC-8: Telemetry distinguishes the three creation modes | Partial | Toast message includes mode tag (`Cloned from…` / `Created "{name}" from {template} — N/M…` / `"{name}" created!`). Sentry breadcrumb deferred — see Deviations. |
| AC-9: Daniel UAT approved | Pass | Daniel said "go" at HUMAN-VERIFY checkpoint after f30e819 deployed. |

## Accomplishments

- 90% weekly flow ("clone last week's Erev Shabbat") is now one click after picking a date — no manual name entry, no template walkthrough.
- Service-type matching cleanly handles three vintages of setlist data: explicit `templateType` (current), legacy `'festival'` bucket (multi-match), and pre-templateType setlists (inferred from eventDate via getServiceContext).
- v50-04 sticky-memory contract verified intact under the new clone path: cloned tracks are byte-identical copies; new bindings via ChartBindPopover still pull fresh sticky values.

## Task Commits

Single feature commit for the cohesive vertical slice (helper + wiring + UI + tests landed together):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–4 | `f30e819` | feat | findLastMatchingService + cloneSetlist + wizard offer strip + tests |

Plan dir was already committed in `d4f7093` (wip from prior session).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/__tests__/setlist-firebase.test.ts` | Created | 13 cases — 6 for `setlistMatchesServiceType` pure helper, 7 for `findLastMatchingService` with mocked firestore. |
| `src/lib/setlist-firebase.ts` | Modified | `setlistMatchesServiceType` exported helper; `findLastMatchingService` service method; `cloneSetlist(source, targetDate)` extracted; `cloneForNextWeek` reduced to thin wrapper. |
| `src/hooks/use-creation-wizard.ts` | Modified | `CreationMode` type; mode/cloneSource/cloneSourceLoading state; useEffect lookup on eventDate change with auto-default-to-clone-when-idle; clone branch in `create()`. |
| `src/hooks/__tests__/use-creation-wizard.test.ts` | Modified | Added `findLastMatchingService` + `cloneSetlist` + `getServiceContext` mocks; +5 cases under "v51-03 clone path" describe (auto-default, clone create call, scratch fallback, template override, verbatim copy). |
| `src/components/setlist/wizard/CreationWizard.tsx` | Modified | Date moved to top; three-offer strip card with brand-colored Clone CTA + text-link Use template / Start scratch (≥44px tap targets); template + name fields hidden when mode='clone'; submit button label flips to "Clone Setlist". |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Skip shadcn Tooltip dependency | Not present in `src/components/ui/`; AC-5 allowed hide-with-text alternative; no-dep budget. | No new dependency; explanatory inline text replaces disabled-button-with-tooltip. |
| Date picker moved to top of form | The offer strip reacts to date — burying date in a 2-col grid below name was wrong information architecture. Tablet-first prefers full-width fields anyway. | Existing template/name/scratch flows still work; date is no longer "optional" in the visual hierarchy (it drives the new flow). |
| Mode auto-defaults to 'clone' only when current mode is 'idle' | Respect explicit user intent: when user explicitly picks a template via `setSelectedTemplate`, mode locks to 'template' BEFORE the eventDate effect runs. | No "template intent clobbered by lookup" footgun. |
| Pure helper exported (`setlistMatchesServiceType`) | Type-resolution logic is the riskiest part (festival-bucket, legacy fallback); tests run synchronously without firestore mocks. | 6 of 13 setlist-firebase tests are zero-mock. |
| Single feature commit (not per-task) | Cohesive vertical slice; same precedent as v50-07-03 + v51-02-01; per-task split would orphan UI without backing helper. | One revert button if needed; clean range. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | None — test-mock fix only |
| Scope additions | 0 | Stayed inside the 5 named files |
| Deferred | 1 | Sentry breadcrumb (AC-8 partial) |

**Total impact:** Plan executed essentially as written. One small AC-8 partial completion documented below.

### Auto-fixed Issues

**1. Test-mock surface for use-creation-wizard.test.ts**
- **Found during:** Task 2 (running existing wizard tests after the new effect added a `getServiceContext` import).
- **Issue:** The pre-existing `vi.mock('@/lib/liturgical-calendar', …)` did not export `getServiceContext`; 3 tests failed with "No 'getServiceContext' export is defined on the mock".
- **Fix:** Added `getServiceContext` to the liturgical-calendar mock; added `findLastMatchingService` + `cloneSetlist` to the setlist-firebase service mock; reset the new mocks in `beforeEach`.
- **Files:** `src/hooks/__tests__/use-creation-wizard.test.ts`
- **Verification:** Suite green at 17/17 for use-creation-wizard.test.ts (was 12; +5 new for v51-03).
- **Commit:** part of `f30e819`.

### Deferred Items

- **Sentry breadcrumb for `creation_mode` tag (AC-8 partial)** — discovered in Task 3 design. Toast messages already differentiate the three modes ("Cloned from…", "Created from {template}…", "{name} created!") which satisfies AC-8's user-facing requirement. The Sentry breadcrumb was tagged "Optional" in the plan task description ("emit Sentry breadcrumb…NO setlist name, NO song titles — PII discipline") and adds an additional code surface that would need its own PII-discipline review. Punt to v51-04 or later as a small follow-up; toast tagging is sufficient for now.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `getServiceContext` not in test mock (3 fails after Task 2 hook changes) | Added missing export to the liturgical-calendar mock surface (see Auto-fixed §1). |
| `expect.anything()` matcher fails on `undefined` second arg to `toast.success` | Switched the assertion to read `(toast.success).mock.calls[0]` and regex-match the message string directly. |
| TS error on `(...args: unknown[])` spread to a zero-arg `vi.fn` mock | Tightened the mock signature to `(d: unknown) => mockGetServiceContext(d)`. |

## Skill Audit (v51-03)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded at APPLY entry per SPECIAL-FLOWS.md BLOCKING gate; queried design DB for `wizard dialog primary secondary tertiary CTA hierarchy` (ux domain) + `shadcn dialog disabled tooltip touch target` (shadcn stack) before designing the offer strip. Tooltip absent in repo → fell back to AC-5 hide-with-text alternative. |

All required skills invoked ✓

## Next Phase Readiness

**Ready:**
- v51-04 (Vocal Lead label rename + Daniel-loop UAT codification + gig-packet print smoke check) is the final phase in v5.1; foundations stable.
- The wizard surface is now date-driven; v51-04 can rely on `mode` state if it needs to differentiate paths in print/copy.

**Concerns:**
- Sentry breadcrumb for creation_mode is deferred — if v5.1 ship needs telemetry on which path users take, address in v51-04.
- The wizard's "service date" field is now functionally required for the Clone offer to appear; users who skip it fall through to the existing form. Not a regression but worth watching during UAT.

**Blockers:** None.

---
*Phase: v51-03-create-setlist-wizard, Plan: 01*
*Completed: 2026-04-27*
