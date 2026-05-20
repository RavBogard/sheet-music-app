# iPad sweep — Library browse + chart-bind picker — FINDINGS

**Lane:** `ipad-sweep-library` (coder-3) · **Wave:** ipad-sweep · **Risk tier:** 1
**Surface:** standard 11" iPad, WebKit engine, 820×1180 portrait + 1180×820 landscape (`playwright.config.ts` `ipad-webkit` / `ipad-webkit-landscape`)
**Run:** prod (`https://www.centralreform.live`), `--project=ipad-webkit` + `--project=ipad-webkit-landscape`, `--workers=1`
**Specs:** `e2e/library-ipad.spec.ts` (browse/search/dedup) + `e2e/chart-bind-ipad.spec.ts` (MobileCardList bind + perform render)
**Suite posture:** 12/12 green (hard floors pass; the behaviors below are SOFT-probed → annotations so the committed suite stays usable as a regression harness).
**Bearer hygiene:** dogfooded `mint_admin_bearer` off the pool root (child `tkbcBZfqxofmYswDoh3s` minted + revoked); a later re-run used a Daniel-handed root directly (mint hit the 10/day cap). No token written to any tracked file. Test fixtures id-scoped + cascade-revoked (`revoke_test_account`); never `cleanup_all_test_data`.

Severity is tagged HIGH/MED/LOW/INFO only (green-gating is supervisor's call at TRIAGE per the 2026-05-19 cycle-7 protocol amendment).

---

## F1 — `/library` search misses REORDERED multi-token queries (MED) — CONFIRMED

**Repro (deterministic, both viewports, every run):**
1. Open `/library` on iPad.
2. Find any multi-word chart, e.g. `Abanibi (Hirsch) - Achshav (Folk)`.
3. Type two of its tokens in reversed order: `Folk Abanibi`.
4. The row does **not** surface.

**Root cause:** the in-app `/library` search filters client-side through Fuse.js
(`src/lib/library-store.ts`: `threshold: 0.3`, `distance: 100`, keys
`name`/`metadata.key`/`metadata.artist`/`metadata.topics`). Fuse's default bitap
scoring is sequence-sensitive and does **not** token-AND. The cycle-9 "Bug 3"
token-AND fix (`1a9886f13`) landed only in the **MCP** `searchLibrary` tool — the
browser `/library` search the band actually uses never got it.

**Impact:** a leader who types "composer title" in the other order (very common
for liturgical charts catalogued "Title (Composer)") fails to find the chart on
the iPad. Caught-by: `library-ipad.spec.ts` reordered-token probe.

---

## F2 — `/library` search has no trustworthy "no results" state (MED) — CONFIRMED

**Repro (deterministic, both viewports):**
1. Open `/library`.
2. Type a 25-char nonsense string `zzzznotachartanywhere9999`.
3. **~127 of 337** CRC rows remain visible; the `No matches found` EmptyState
   never appears.

**Root cause:** the same Fuse config is too permissive at the catalog scale — a
guaranteed-nonsense query still scores ≤0.3 against a large fraction of the
~337-row CRC catalog (short Hebrew/transliterated titles + multi-key matching),
so `combinedItems` is never empty and the EmptyState branch
(`SongChartsLibrary.tsx`, `combinedItems.length === 0 && !loading`) never fires.

**Impact:** searches feel imprecise and the user never gets a clean "nothing
matched" signal. Pairs with F1/F4: the search is simultaneously *too loose* for
gibberish and *too strict/erratic* for legitimate tokens. A tuned threshold (or
porting the MCP token-AND logic to the client) would fix F1+F2 together.
Caught-by: `library-ipad.spec.ts` gibberish probe (row count captured in the
annotation).

---

## F3 — iPad chart-bind had ZERO e2e coverage; existing spec is desktop-only (MED) — CONFIRMED (code + run)

**Finding:** at iPad CSS width the setlist editor (`/setlists/[id]`) renders the
**MobileCardList** path (`MobileCardList.tsx` / `MobileRowCard.tsx`). The desktop
TanStack grid and its `data-testid="chart-cell"` button **do not exist** at this
width. A leader binds a chart by: tap the row card (aria-label `"<title>. Tap to
edit."`) → inline edit pane → tap **"Bind Chart"** → `ChartBindDialog` cmdk
picker.

The pre-existing `e2e/chart-bind-picker.spec.ts` runs **only `--project=chromium`**
(desktop width) and drives the `chart-cell` flow — i.e. it exercises a surface the
band never sees on their iPads. The band's actual bind path was untested.

**Closed by this lane:** `e2e/chart-bind-ipad.spec.ts` drives the real
MobileCardList flow under `ipad-webkit`(+landscape). The structural flow PASSES:
card → edit pane → "Bind Chart" → picker opens + is typeable (both viewports),
and the row card tap target is ≥44px (72px). Severity is the *coverage gap*, not
a runtime break.

---

## F4 — `/library` single-token search is INCONSISTENT across runs/viewports (MED) — OBSERVED

**Observation:** a single contiguous token that literally appears in a title
(`Abanibi` → `Abanibi (Hirsch) - Achshav (Folk)`) surfaced the row in one portrait
run but **failed to surface it** in a later portrait run and in landscape. Same
data, same query, different result across runs.

**Likely cause (not yet root-caused):** a race between the zustand Fuse store
filter (`setFilter`) and the 500ms-debounced content-search (`useContentSearch`,
fires at ≥3 chars and re-renders `ContentSearchResults` above the list), and/or a
React-Query refetch toggling `loading`. The controlled `<input>` + two async
result surfaces appear to interleave non-deterministically on WebKit.

**Impact:** search reliability on the band's hardware is not dependable.
Confidence: behavior reproduced as an *inconsistency*; the exact mechanism needs a
focused debug session (recommend instrumenting the filter pipeline). Caught-by:
`library-ipad.spec.ts` single-token probe.

---

## F5 — iPad chart-bind picker slow to reflect a just-uploaded chart (MED) — OBSERVED

**Observation:** a chart uploaded via MCP (`save_scraped_chart`) seconds before
opening the picker did **not** appear in the iPad chart-bind picker within 8s of
upload + Web-SDK sign-in (both viewports, latest run).

**Mechanism:** the picker (`ChartBindDialog`/`ChartBindPopover`) reads Dexie
(`getDb().songs` via `useLiveQuery`), primed by `subscribeSongsLibrary()`
(`SetlistGridHydrator.tsx`) — a Firestore client `onSnapshot` listener that
requires Web-SDK auth (`auth.currentUser`). Cold-priming the ~568-row songs
library into Dexie under WebKit appears to exceed the 8s window.

**Open question (needs manual confirmation):** is the picker *empty/sparse*, or
does it have the existing library and only lag on the brand-new doc? The probe
only checks for the just-uploaded fixture, so the narrow confirmed claim is:
*a newly-uploaded chart is not promptly bindable on iPad*. In one landscape run
the fixture DID surface but the bond did **not** persist server-side within 2.5s
(`get_setlist` showed `songId/fileId: null` while the local row optimistically
showed the chart title) — a secondary, lower-confidence bind-persistence concern
worth a manual iPad bind check.

**Impact on the weekly flow:** Daniel authors via MCP, then a leader opens the
setlist on an iPad to bind/perform. If the picker lags on cold open, binding the
freshly-added chart is briefly impossible. Caught-by: `chart-bind-ipad.spec.ts`
fixture-surface probe.

---

## Positive confirmations (PASS on iPad WebKit, both viewports)

- **`/library` renders dense, no horizontal overflow** at 820px and 1180px; chart
  rows are ≥44px tap targets (iOS HIG). No cover art (per design).
- **Dedup holds:** no two visible CRC-tab rows share an identical display name
  (`dedupeChartsByStem`).
- **iPad bind FLOW is structurally sound:** card → edit pane → "Bind Chart" →
  picker mounts + accepts typing (the iPad keyboard path via `TouchOrPopover`'s
  non-suppressed autofocus).
- **Bonded charts open in Perform under WebKit** (text fixture + curated PDF)
  with no load error — the `library_index` mimeType backstop
  (`project_track_mimetype_gotcha`) resolves a viewer even though track docs lack
  `mimeType`/`fileName`. (react-pdf canvas-under-WebKit is covered by
  `perform-ipad.spec.ts`.)

## Recommended follow-ups (for TRIAGE)

1. **F1+F2 together:** port the MCP `searchLibrary` token-AND logic to the client
   `/library` search, or replace Fuse with token-AND + a tighter threshold. One
   change fixes both reordered-miss and gibberish-no-empty-state.
2. **F4:** debug the Fuse-store ↔ content-search debounce race (instrument the
   filter pipeline; consider gating content-search behind the store filter).
3. **F5:** confirm picker cold-open behavior on a real iPad; consider priming
   Dexie eagerly or showing a "library loading" affordance in the picker, and
   verify bind persistence on touch.
