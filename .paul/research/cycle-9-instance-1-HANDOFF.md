# Cycle-9 Sweep — Instance 1 HANDOFF

**Axis:** Band-facing Perform mode + iPad UX
**Signed:** from cycle-9-instance-1
**uidPrefix:** c9i1
**Deployed SHA at start:** `db208948f687542c130235fa65224bf2640e1c0c` (built 5/19/2026, version 7.0.0) — newer than PARENT-expected base `edb24a47c`, so the cycle-8 + cycle-9-A/B fix lanes have likely landed.
**Bearer:** burned (the c9i1 musician token was the only one minted and was swept by `cleanup_all_test_data({prefix:"c9i1"})` — see §Cleanup below). The raw value is NOT written anywhere in this repo.

---

## Verdict per sub-axis

| Sub-axis | Verdict | Notes |
|---|---|---|
| Tonight's setlist loads at /perform | **PASS** | Public listing renders, "CF1 Eval — Friday Evening (May 22)" at top correctly. |
| Card title rendering (C7I2-001 regression watch) | **PASS (with caveat)** | `truncate` Tailwind class wraps the h1. NO horizontal overflow observed. Caveat: see C9I1-009 — could NOT actually constrain viewport to iPad-Mini 768px. |
| Chart opens on tap | **PASS** | dodi li (Drive fileId) renders as image chart; PDFOverlay opens with full toolbar. |
| C7I2-002 missing-chart affordances | **PASS** | Bad fileId → "Couldn't load chart" + "Chart not found" + Retry/Back/Library buttons. NO infinite spinner. Confirmed at deployed SHA. |
| Toolbar: zoom / metronome / transpose | **PASS** | Zoom mutates 100→120 (React render-tick artifact made it look broken on instant double-click; +500ms read confirms). Transpose has graceful "not available for image charts" aria-label. Metronome button present with `aria-label="Start metronome"`. |
| Song-to-song nav within setlist | **PASS** | Setlist context is path-derived (`/perform/setlist/<id>` → click track → PDFOverlay). SONG 1 OF 12 → 2 OF 12 navigation operational, zoom persisted. |
| `/perform/setlist/<id>` public view | **PASS** | Loads unauth, tracks render, "X songs · Y items" count is correct (matches songs+readings, minus headers). |
| [[feedback_no_cover_art]] policy | **PASS** | Zero per-track `<img>` elements on listing or setlist view. Only logos. |
| Empty / 0-song setlist | **OBSERVED** | trackCount=0 setlists (e.g. Confirmation Shabbat) actually have content in the doc — see C9I1-005 drift. The UI does NOT show a broken empty state because the actual tracks render. |
| Big 30-row setlist (Parashat Emor) | **PASS** | 4 section headers visible, no horizontal overflow at observed width, 23 items rendered. |
| Gig-packet print | **PASS (functional)** | Click "Gig Packet" opens an inline section-toggle panel (NOT `[role=dialog]`) showing Pre Service / Beginning / Birchot HaShachar / etc. + "Setlist Only" toggle. Did not exercise actual print render (would require pdf comparison). |
| Auth gating of leader controls | **PASS** | Source confirms `isLeader && <Edit>` and `canPrint && <Gig Packet>`. Unauth curl SSR confirms strings absent. Initial in-browser observation was contaminated by Daniel's cached auth — see C9I1-012. |
| Offline / slow-network degrade (Dexie path) | **NOT EXERCISED** | Did not throttle network in this budget. `PerformanceOfflineIndicator setlistFileIds={…}` confirmed present in source at `/perform/setlist/[id]/page.tsx:135`. Recommend instance follow-up. |

---

## Findings table

| ID | Sev | Kind | Tag | Surface | One-liner |
|---|---|---|---|---|---|
| C9I1-001 | LOW | data-display-polish | | /perform/setlist/<id> h1 | "Shir Shabbat —  — May 13" double-em-dash placeholder |
| C9I1-002 | INFO | regression-of-shipped-fix | (PASS verification) | /perform/<fileId> | C7I2-002 affordances hold: Retry/Back/Library on bad fileId |
| C9I1-003 | INFO | regression-of-shipped-fix | (PASS verification) | /perform | [[feedback_no_cover_art]] holds: 0 per-track img elements |
| C9I1-004 | INFO | regression-of-shipped-fix | (PASS verification) | PerformanceToolbar | Transpose gracefully disabled for image charts |
| C9I1-005 | LOW | data-drift | **known-in-flight** | MCP↔UI | trackCount=0 on Confirmation Shabbat but UI shows 5 songs |
| C9I1-006 | LOW | ux-direct-link | | /perform/<fileId>?setlistId= | Query-param setlistId is ignored — context is path-only |
| C9I1-007 | LOW | ux-iPad-affordance | | /perform/setlist/<id> | Track rows are role=button DIVs (no middle-click open-in-new-tab) |
| C9I1-008 | INFO | cross-axis-observation | **cross-axis (axis-2)** | /perform listing | c9i2-CLONE-emor-weekly-flow-test fixture leaked into public listing |
| C9I1-009 | INFO | harness-limitation | | cowork-harness | resize_window does not constrain viewport — iPad-Mini was NOT measured at 768px |
| C9I1-010 | INFO | regression-of-shipped-fix | (PASS verification) | PerformanceToolbar | Zoom mutates + persists across in-setlist nav |
| C9I1-011 | INFO | regression-of-shipped-fix | (PASS verification) | /perform/setlist/<id> | Edit/Gig Packet correctly gated by isLeader/canPrint |
| C9I1-012 | INFO | probe-method-caveat | | this report | Daniel's Chrome had cached auth — extrapolations noted |

Severity summary: **0 HIGH · 0 MED · 4 LOW · 8 INFO**. **No BLOCKS-GREEN. No regression-of-shipped-fix in the negative sense.** Five INFO findings are explicit PASS-verifications of previously-shipped fixes (C7I2-001 mitigation via truncate, C7I2-002 affordances, no-cover-art, transpose tooltip, zoom persistence, isLeader gating).

---

## Load-bearing items for supervisor triage

1. **Five PASS-verifications of previously-shipped fixes.** C9I1-002 (C7I2-002), C9I1-003 ([[feedback_no_cover_art]]), C9I1-004 (transpose-on-image), C9I1-010 (zoom persistence), C9I1-011 (canPrint/isLeader gating). All hold at deployed SHA `db208948f`.
2. **C9I1-005 trackCount drift IS a real producer.** Confirmation Shabbat has 5 actual tracks but MCP `list_setlists` reports `trackCount: 0`. Mother's Day is clean (trackCount=2 matches). This is the cycle-9 hardening B lane's territory — tagged known-in-flight. Worth confirming the fix lands a backfill, not just a write-side guard, since this doc was already drifted.
3. **C9I1-008 sibling fixture leak.** Instance-2's `c9i2-CLONE-*` setlist is visible on the unauth /perform listing. Suggests either (a) instance-2 wrote the setlist without `isTest:true`, OR (b) the writer-side name/owner heuristic doesn't catch the `c9i2-CLONE-` prefix. Belongs in axis-2 / cross-instance hygiene triage.
4. **C9I1-009 harness limitation (LOAD-BEARING for next sweep).** Cowork's Claude-in-Chrome `resize_window` does NOT constrain rendered viewport. The iPad-Mini-specific layout claims in §verdict are extrapolated from desktop-width DOM observation + Tailwind class inspection at the source level, **not measured at 768px**. The PARENT spec called for in-sandbox Playwright at `cycle-4/harness/`; Playwright is NOT preinstalled in the cowork sandbox, only the `mintSession` primitive is checked in. Future iPad-Mini probes need either (a) `npm install playwright` in-sandbox plus chromium download, OR (b) a different cowork browser harness with DevTools-Protocol mobile-emulate.

---

## Cleanup verification

Fixtures minted in this instance:

| Fixture | Tool | Identifier | Cleanup proof |
|---|---|---|---|
| Test musician account | `create_test_account({role:"musician", uidPrefix:"c9i1", label:"cycle-9 sweep i1 band-perform", ttlSec:7200})` | `uid: test-c9i1-musician-37e14609`, `tokenId: YxGD2pIG1qvIOU0N82O0` | `cleanup_all_test_data({prefix:"c9i1"})` returned `{removed:1, failures:[], aggregate:{mcpTokens:1, ...all zero}}` — confirmed sole fixture swept. |

No setlists, no chart uploads, no library writes, no scheduling rows, no Dexie/IDB mutations. Read-only probes against existing prod fixtures (Shir Shabbat May 13, Confirmation Shabbat, Mother's Day, Parashat Emor May 2).

The raw `crl_live_*` bearer was used in-memory only by the MCP client wired into this cowork session; per PARENT §2 it was never written to any file under `sheet-music-app/`, `.coord/`, or the artifacts directory.

---

## Method notes (what worked, what didn't)

- **Worked:** Claude-in-Chrome browser_batch for navigate + JS probe + console-read in one round trip. Source-inspection cross-check for auth-gating and template-string artifacts. MCP `get_setlist` / `list_setlists` for data ground-truth against the UI.
- **Didn't work:** `resize_window` for viewport-constrained iPad-Mini emulation. In-sandbox Playwright (not installed).
- **Probe-method caveat:** Daniel's Chrome had cached Firebase auth in localStorage (`crc_cached_user` truthy), which initially looked like an authorization-display bug for the "Edit" / "Gig Packet" buttons until I sanity-checked the source and an unauth curl SSR. Future instances should mint a fresh-context browser tab (or use the test-session cookie path the harness's `mintSession` provides) before declaring any "unauth user sees X" finding.
- **Deliberately out of scope:** offline-throttle / Dexie behavior, actual print render comparison, multi-musician roster overlay, monitor mix. Some belong to axis 2/3/4/5.

---

## Re-entry per PARENT §7

Severity tally: 0 HIGH / 0 MED / 4 LOW / 8 INFO. **0 BLOCKS-GREEN, 0 regression-of-shipped-fix.** From axis-1, no signal triggering a cycle-9-fixes parallel wave. Route findings to POLISH or backlog per supervisor triage.
