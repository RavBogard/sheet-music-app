# iPad sweep — Perform-mode deep coverage: FINDINGS

**Lane:** `ipad-sweep-perform` (coder-1) · **Tier:** 1 (FINDINGS-only; no `src/` edits)
**Base SHA:** `9a6e6453c` · **Surface:** real WebKit at the standard 11" iPad viewport (820×1180 portrait, 1180×820 landscape) against **prod** (`https://www.centralreform.live`).
**Spec:** `e2e/perform-ipad-deep.spec.ts` (8 probe areas) + additive `e2e/helpers/seed.ts` helpers.
**Severity tags only** (HIGH/MED/LOW/INFO) per the discovery→TRIAGE rule; green-gating is the supervisor's call.

Run posture: `--project=ipad-webkit --project=ipad-webkit-landscape --workers=1 --retries=1`.
Result: **8 passed / 1 flaky (passed on retry) / 9 cross-project skips**, exit 0. Each probe passes deterministically in isolation; the flake is the prod connectivity blip described in F-5.

Bearer: dogfooded `mint_admin_bearer` off the live supervisor root (tokenId `lWcx2Ul6QAW41tALOuzi`, 2h TTL), used as `MCP_BEARER`, revoked post-run. Isolation: lane-distinct mint labels (`ipad-sweep-perform-portrait-*` / `-landscape-*`), revoke-by-id in `afterAll`; **never** `cleanup_all_test_data`.

---

## F-1 — HIGH — MCP-bonded text/scraped chart mis-routes to PDFViewer in Perform mode ("Invalid PDF structure")

**What:** A scraped/text chart bonded to a setlist row **via MCP** (`add_track_to_setlist({songId})` / `bulk_add_tracks`) renders through **react-pdf** in Perform mode instead of `TextScoreViewer`. On iPad WebKit the pdf.js worker throws `InvalidPDFException: Invalid PDF structure` — the band gets a broken/empty chart, not the chord text.

**Repro (deployed surface, iPad WebKit):**
1. `save_scraped_chart` a chord-text chart → `fileId` (`upload-<uuid>`).
2. `add_track_to_setlist({setlistId, songId: fileId, title})` → publish.
3. Open the row in `/perform/setlist/<id>` on `ipad-webkit`.
4. Console logs: `[PDFViewer] react-pdf load error: InvalidPDFException: Invalid PDF structure. (workerSrc=/pdf.worker.min.5.4.296.mjs)`. The chord text never appears.

**Root cause (read-only trace):**
- `src/lib/queue-utils.ts:13-44` `toQueueItem` detects file type by: `track.mimeType` → `fileId`/`fileName` extension → **defaults to `'pdf'`**.
- MCP `add_track_to_setlist` / `bulk_add_tracks` do **not** stamp `mimeType`/`fileName` onto the `SetlistTrack` (only the in-app picker bind path does — corroborates `[[project_track_mimetype_gotcha]]`). The fileId is `upload-<uuid>` (no `.txt`), so the extension fallback misses too → defaults `'pdf'`.
- `src/components/performance/PDFOverlay.tsx:144-157` has a `useLibraryStore` mimeType backstop **only for images** (`isImage`), not for text/musicxml. So even though `library_index` knows the real mimeType, the overlay still routes a text chart to `PDFViewer`.

**Impact:** The band's **MCP-first weekly authoring flow** (Daniel/David via Claude Desktop) is the primary way new charts get bonded. Any **non-PDF** chart bonded via MCP (scraped text, MusicXML, an image whose fileId lost its extension) renders as a broken PDF on the band's iPads. PDFs are unaffected (the `'pdf'` default is correct for them). The in-app scraper is a documented import path for chord-chart text, so text charts do occur.

**Regression pin:** `e2e/perform-ipad-deep.spec.ts` probe 9 asserts the *correct* behavior (text renders via `TextScoreViewer`) under `test.fail()` — it is an expected failure today; when the bug is fixed it will pass unexpectedly and turn the suite red, signalling the marker should be removed.

**Suggested fix (NOT in this lane — sweep ≠ fix):** either stamp `mimeType` on MCP-bonded tracks (mirror the picker bind path), or extend the `toQueueItem`/`PDFOverlay` `library_index` mimeType backstop to text + musicxml (today only images get it).

---

## F-2 — MED — In-overlay transpose is discarded on chart navigation (no save affordance)

**What:** A musician transposes a chart in the Perform overlay (e.g. +2), pages to the next chart and back — the transpose is **gone** (resets to the chart's saved key). There is no way to keep an ad-hoc transpose across navigation.

**Repro (iPad WebKit):** open a chart → transposer popover → "Transpose up" ×2 (stepper shows `+2`) → "Next song" → "Previous song" → re-open transposer → shows `Original Key`.

**Root cause:** `src/lib/store.ts` — `nextSong`/`prevSong`/`jumpToSong`/`setQueue` all set `transposition: <track>.transposition ?? 0` (the *saved* per-track value). The in-overlay transpose is session-only and is **not** in the store's `partialize` (only `zoom`+`audio` persist). So any manual transpose is lost on the next nav.

**Impact:** During a live service a player who bumps a chart up a step then flips charts loses it silently. Arguably by-design (each song carries its own saved key), but the lack of any "keep/save this transpose" affordance is the surprising part. Triage call on severity.

**Regression pin:** probe 3 asserts the reset (passing test = documents current behavior).

---

## F-3 — LOW/INFO — Dense-row key-badge does not reflect an in-overlay transpose

**What:** Transposing a chart in the overlay does **not** move the dense setlist row's key-badge. The badge keeps showing the saved/profile key.

**Root cause:** `src/components/performance/SetlistRow.tsx:34-45` computes the badge from `track.transposition` + the musician-profile `defaultTransposition`, **never** from `useMusicStore.transposition` (what the overlay transposer mutates). Already noted in `perform-flow.spec.ts`; confirmed here at the iPad WebKit viewport.

**Impact:** Consistent with F-2 — the badge reflects the saved/profile key, not an ad-hoc overlay transpose. Mostly an internal-consistency observation; low user impact.

**Regression pin:** probe 3 asserts the badge stays put after an overlay transpose.

---

## F-4 — INFO — No user-draw annotation surface in Perform mode (confirmed absent)

No freehand-draw / annotation control exists in the Perform toolbar (probe 7 asserts count 0). Consistent with the prior `perform-flow.spec.ts` finding ("no user-draw surface shipped" — react-pdf's AnnotationLayer renders *embedded* PDF annotations, not a user canvas). Not a regression; flagged so a future annotation feature flips probe 7 to a draw→persist→nav probe.

---

## F-5 — INFO / transient (NOT a confirmed product bug) — Freshly-published setlist's client live-subscription can briefly empty the row list after hydration

**What:** Immediately after publish, opening a setlist sometimes shows the heading but `0 songs / No tracks yet` for a few seconds, then settles (or settles on reload/retry).

**Trace:** `/perform/setlist/[id]` SSR (`page.tsx`) renders the full row list at FCP from an Admin-SDK read (curl of the raw SSR HTML for a fresh 32-row setlist returns **all 32 rows** — confirmed). After hydration, `SetlistPerformClient` swaps `initialTracks` for the client Firestore **live frame**; when the client transiently can't reach the Firestore backend (`Could not reach Cloud Firestore backend ... client is offline` — observed in console), the live frame is empty and **replaces** the SSR rows. A reload re-runs SSR and usually clears it.

**Why likely NOT a real-band bug:** the band opens setlists published earlier (fully propagated), and the blip is a connectivity transient (also seen on flaky venue wifi). It only bit the harness because it publishes-then-reads within seconds. Logged for completeness.

**Harness mitigation:** `awaitRow()` reload-on-miss (2 reloads) + `--retries=1`. With these the suite is green; the residual flake (≤1 probe/run) clears on retry.

---

## F-6 — INVESTIGATED, NO BUG — `bulk_add_tracks` does NOT render 0 tracks in Perform

Early in the sweep the long (32-row, `bulk_add_tracks`) setlist appeared to render 0 tracks while sequential-add setlists rendered fine — suggesting a bulk-vs-sequential data-shape bug. **Disproven:** a direct curl of the perform SSR HTML for a fresh `bulk_add_tracks` setlist returns all 32 rows; `delete_setlist` cascade-deletes all 32 (so the `tracks where setlistId==X` query sees them). The "0 tracks" was F-5 (client-hydration connectivity blip), which is **random across setlists** (it later hit the small sequential `deep` setlist on probe 2). No bulk-specific defect. Recorded so this isn't re-chased.

---

## PASS — behaviors verified clean on iPad WebKit (no bug)

- **Setlist switching** (probe 1): navigating between two setlists shows the correct rows each time; no stale rows from the other setlist. PASS.
- **Sequential chart nav** (probe 2): pages forward/back through every bonded PDF chart; `Song N of M` tracks correctly; Next disabled at the end, Prev disabled at the start; overlay stays mounted; no react-pdf/WebKit render error on real PDFs. PASS.
- **Long setlist, 32 rows** (probe 4): no horizontal overflow at 820px; list scrolls; the deepest row is reachable; its tap target ≥ 44px (iOS HIG). PASS.
- **Unbonded row** (probe 5): for a musician an unbonded song row is non-interactive (no `role=button`); tapping it is a graceful no-op — no overlay, no crash, no infinite spinner. PASS.
- **Header / section row** (probe 6): renders as a non-interactive label for a musician (no `role=button`); not tappable-as-chart. PASS.
- **Landscape 1180×820** (probe 8): heading + rows render; no horizontal overflow at the wider width; chart overlay opens and closes. PASS.
