# product-gap-features — FINDINGS (coder-6, Lane product-gap-features)

**Tier-0 READ-ONLY research.** Base SHA `a5d35f47f`. Scope: *missing CORE FEATURES* on the
functional / user-facing / workflow-completeness half. Lens: band-onboarding readiness + Daniel's
MCP weekly clone→tweak→publish flow + the band's Perform-on-iPad surface. **Seam:** coder-5 owns
robustness/security/reliability/observability; I own missing capabilities + UX completeness. Monitor
subsystem skipped per prompt.

Method: 4 parallel corpus-ingestion sub-agents (MCP-authoring / Perform-iPad / library-MusicXML /
deferred-backlog) **+ my own ground-truth of the live code at `a5d35f47f`.** Every "missing" claim
below was checked against deployed code; the verification killed 6 would-be false positives that
memory and the sub-agents asserted (see §D). This is the [[feedback_cowork_prompt_verify_before_write]]
discipline applied: claims are graded against deployed code, not memory.

---

## §A — TL;DR: the 5 highest-value missing features for band-readiness + the weekly flow

1. **Full-setlist offline pre-cache on Perform entry (+ an in-Perform "Save offline" action).**
   The single highest-risk live-service failure. *Band · HIGH · effort S · FACT.*
2. **MusicXML key label + capo "Play As" grid in the transposer.** The strategic chart format is
   blind on its core ergonomic right now. *Band/Daniel · HIGH · effort S–M · code-confirmed.*
3. **`get_congregation_context` (+ per-song lead history) read tool for Daniel's authoring.**
   Makes Claude "know the congregation" instead of asking every session. *Daniel · HIGH · effort S · FACT (absent).*
4. **In-service live-edit propagation to band iPads** ("setlist changed → refresh", optional
   conductor page-sync). The unique-vs-paper value prop, never wired/tested. *Band/leader · HIGH · effort M + investigation.*
5. **Full-text / lyric chart search via MCP.** Disambiguates multi-version + Hebrew-variant charts
   during authoring. *Daniel · HIGH-med · effort S–M · FACT (server route exists, not MCP-exposed).*

---

## §B — Prioritized feature-gap map

Each: **who** · **impact** · **effort** · **NEW vs KNOWN-DEFERRED** (corpus cite) · **FACT vs INFERENCE**.

### TIER 1 — highest value, small/contained effort, verified

**F1. Full-setlist offline pre-cache on Perform entry + in-Perform "Save offline" CTA**
Band · HIGH · S · NEW · **FACT.**
The offline infra is fully built — `src/lib/offline-idb.ts` (IndexedDB blob store) + `src/lib/prefetch.ts`
(`prefetchSetlistPDFs(fileIds)` bulk-cache; `prefetchUpcoming(...)` 2-ahead) + `PerformanceOfflineIndicator`
("OFFLINE — N/M CHARTS READY"). **But `prefetchSetlistPDFs` has no production caller** (grep at
`a5d35f47f`: only `prefetch.test.ts` references it) and the `perform/setlist/[id]` page triggers no
precache on mount. So when shul Wi-Fi drops mid-service, every not-yet-opened chart 404s and the
indicator reports "0/N ready". There is also a deliberate **tombstone service worker** (`public/sw.js`
un-registers any SW + clears caches — killed 2026-05-17 over a Firestore-IDB recovery loop), so there's
no transparent cache-first net. Fix is small: an idle-time `prefetchSetlistPDFs(songFileIds)` on Perform
entry **and** a visible "Save for offline" button in the Perform header / offline indicator (a musician
who deep-links from a push notification never passes the dashboard). *Convergent: Perform-agent GAP-1/GAP-5, library-agent "offline pre-loading passive".*

**F2. MusicXML key label + capo grid in the transposer**
Band + Daniel · HIGH · S–M · NEW · **code-confirmed (INFERENCE on exact UX string).**
MusicXML is the strategic format, and OSMD (`SmartScoreViewer`) transposes the rendered score correctly
via `Sheet.Transpose`. But `TransposerMenu` derives the **key label + capo "Play As" grid** from
`detectedKey = estimateKey(allChords)` where `allChords` comes from `aiState.pageData` — i.e. the
**AI chord-OCR scan**, which fires on the PDF path, not on OSMD. OSMD's native `<key>` element is never
read. Net: open the transposer on a MusicXML chart with no leader-set track key → "Detected Key:
Waiting for scan…" forever, empty capo grid, even though the score visually transposes. Mitigation that
exists today: if the track carries a `key`, `setlistKey` wins and the capo math works — so this bites
un-keyed MusicXML charts hardest. Fix: read the key from OSMD's parsed sheet (or run the chord pass on
MusicXML). *Library-agent #1.*

**F3. `get_congregation_context` (+ `get_song_lead_history`) read tool**
Daniel · HIGH · S · KNOWN-DEFERRED (`mcp-claude-first-SYNTHESIS.md` Tier 3 #7; `mcp-claude-first-codebase-FINDINGS.md` Pass-B B-1..B-6,B-11) · **FACT (verified absent — no congregation/rabbi/lead-history MCP tool exists).**
Every Claude-Desktop authoring session is stateless about the congregation: there is no tool returning
the rabbi pool, the vocal-lead pool, instruments, the band roster, recent-songs frequency, or
"who usually leads this song." The UI has all of this (`useCongregation()`, recent-service history, the
rabbi picker, `SongRecentEntry.performedAt`), but Claude must ask Daniel or guess. One read tool —
`get_congregation_context` returning `{rabbis, vocalLeads, instruments, bandRoster, recentSongs[], templates[]}`
— plus `get_song_lead_history(songId)` would close ~8 hidden-context gaps and is the change that most
advances the "Claude knows the congregation" feel. Pure read; low effort.

**F4. Full-text / lyric chart-body search via MCP (`search_chart_content`)**
Daniel · HIGH-med · S–M · KNOWN (`mcp-claude-first-SYNTHESIS.md` Tier 4 #11; codebase-FINDINGS A-23) · **FACT.**
`search_library` matches titles only (titleSpecificity / normalizedName / stem / titleContextHints).
Server routes `/api/library/search-content` and `/api/charts/search` exist and search inside chart
bodies, but **no MCP tool wraps them.** For liturgy the natural query is by lyric/incipit ("the Adon
Olam with the Hirsch melody", "the chart that has 'Ki Heim Chayeinu'") — exactly how Daniel
disambiguates 4–6 versions of the same song. Wraps existing server code; modest effort.

### TIER 2 — high value, larger effort or needs investigation first

**F5. In-service live-edit propagation to band iPads ("setlist changed" refresh; optional conductor page-sync)**
Band + band_leader · HIGH · M (+ investigation) · KNOWN-DEFERRED (`cycle-7-recon-A-USER-FLOWS.md` J6, §4 blind-spot #9 — *never tested*) · **FACT on the no-op; INFERENCE on live behavior.**
`setCurrentPosition` in `useSetlistPerformance` is an explicit no-op (`() => {}` — "live stepping
removed"), and `api/setlists/notify-updated` writes in-app notifications, not a push to active viewers.
The Dexie/Firestore snapshot listener updates the *background* setlist rows, but a musician with an
**open** `PDFOverlay` when Daniel swaps track 12 mid-service sees no banner, no refresh, no
auto-nav — the open chart stays stale. There's also no "follow conductor" so Randy/Daniel can advance
all 6 iPads together. This is the headline differentiator over paper and it has **never been exercised
end-to-end in any cycle.** Recommend an investigation spike first (what does the snapshot listener
actually do under add/remove/reorder vs key-only?), then a minimal "setlist updated — tap to refresh"
banner; conductor page-sync is a larger follow-on (needs a `position` field + writer + subscriber).
*Convergent: Perform-agent GAP-3/GAP-6, backlog-agent "in-service live-edit propagation".*

**F6. Band-facing "who's playing tonight" within the live Perform/iPad context**
Band · HIGH (band-readiness) · S–M · partially-KNOWN (`cycle-5` C5C-014/C7I1-006; `/schedule` route unprobed per recon-A §3) · **FACT (nuanced).**
Per-track **vocal lead** *is* shown today (`SetlistRow` renders `track.leadMusician || track.performer`).
The MCP roster tools (`list_musicians_on_date`, `list_service_personnel`, `suggest_band`) are live and
serve Daniel/David via Claude. **What's missing is the band's in-Perform view of the full ensemble** —
who's on bass/drums/guitar tonight — without leaving Perform. `/schedule` exists and subscribes to
assignments (`subscribeToAllUpcomingAssignments`) but is a separate route with **zero cycle coverage**
and unknown iPad ergonomics. Recommend a compact "tonight's band" strip reachable from the Perform
setlist surface. *Backlog-agent "who's playing tonight".*

**F7. Change-since-last-week diff surface (for the band, and as a publish summary)**
Band · HIGH · M · NEW (not in any TRIAGE) · **INFERENCE.**
The weekly flow is ~90% identical week-to-week, yet when a setlist is published the band has no "what
changed vs last Friday" view — they must re-scan 15–30 rows. A diff (added/removed/swapped/key-changed
tracks), surfaced both in-app on the setlist and as the `publish_setlist` notification body, lets
musicians reading partly from memory focus only on the deltas. Pairs naturally with the clone flow
(clone already knows its source). *Backlog-agent "change-since-last-week diff".*

### TIER 3 — solid medium gaps

**F8. Phonetic / transliteration-tolerant Hebrew search **and** dedup**
Daniel + David · HIGH-med · M–L · KNOWN-DEFERRED, *awaiting Daniel's decision* (`cycle-7` C7I1-012 search → escalated `cycle-9` C9I3-003 to the dedup side) · **FACT.**
Prefix-bucketing splits transliteration variants: "Hashkivenu" vs "Hashkiveinu" returned disjoint
result sets in a cycle-9 prod probe (3 vs 3, zero overlap); "Lecha Dodi / L'cha Dodi / Lcha Dodi" are
three disjoint sets. The **dedup angle is the dangerous one**: a near-phonetic upload never enters the
0.85 fuzzy window, so a silent duplicate is created that no later search or dedup sweep ever pairs.
Over time this contaminates the catalog, gig packets, and authoring. This was explicitly deferred to a
Daniel decision — surfacing it because the library is now the system of record and the band is
onboarding. *Convergent: library-agent #3, backlog-agent.*

**F9. Chart replace-in-place / version history (rename + rebind-all)**
Daniel + David · MED · M · NEW (+ codebase-FINDINGS A-20/A-21) · **FACT.**
To correct a chart today: upload new file → new fileId → `swap_chart` on every setlist row that
referenced the old one. There is no replace-bytes-at-same-fileId, no chart-level version history, no
"rebind all setlists from fileId X→Y", and no MCP `rename_chart` / `update_chart_metadata` (rename
without re-bonding). Strategically important because MusicXML charts (transpose/key-fix) get corrected
far more often than PDFs. Note: `salvage_chart_bytes` already re-uploads bytes onto an existing fileId
for *orphan healing* — a `force`/replace mode could extend it to intentional corrections. *Convergent:
MCP-agent rename_chart, library-agent version-history.*

**F10. Soft-delete + restore for charts and setlists (MCP)**
Daniel · MED · S–M · KNOWN-DEFERRED (`mcp-claude-first-SYNTHESIS.md` Tier 2 #6 — 72h window decided, never built) · **FACT.**
`delete_chart` (hard, refuses if bonded) and `delete_setlist` (hard cascade) have no undo via Claude.
The UI defaults charts to `status:'archived'` (soft) with a separate permanent delete. A `softDelete`
flag + `restore_*` + `includeDeleted` filter (mirroring the existing `status:'duplicate'` soft-hide
pattern) gives Claude-Desktop library/setlist cleanup the same safety net the UI has. *MCP-agent.*

**F11. Bulk Drive-folder import via MCP (`import_from_drive_folder`)**
Daniel + David · MED · M · NEW · **FACT.**
`import_chart_from_drive` is one file at a time. The automated David drop-folder cron is fixed to one
folder ID. There's no on-demand "import every file in this folder ID into collection X" — so restocking
a collection is 20+ individual calls. Loops existing `importChartFromDrive` with per-file results +
dedup + dry-run. *Library-agent.*

**F12. `start_weekly_setlist` composite tool + `move_track` single primitive**
Daniel + David · MED · M · KNOWN-DEFERRED (`cycle-9-sweep-TRIAGE.md` §5 C9I2-E03 → cycle-10 scope) · **FACT.**
The weekly flow today chains `list_setlists` → `clone_setlist[_from_template]` → several edits →
`assign_musician` → `publish_setlist`. A composite ("start this week from Randy's usual template,
dated Friday") collapses 5+ named tools into one — the "easy & intuitive 3-step flow" Daniel asked for.
`move_track` (reposition one row without a full `reorder_setlist`) is the small companion primitive.
*Backlog-agent.*

**F13. `get_chart_preview` (first-page text / thumbnail) via MCP**
Daniel + band_leader · MED · M · KNOWN (`mcp-claude-first-SYNTHESIS.md` Tier 4 #10) · **FACT.**
With 4–6 versions of a song, `search_library` returns title-only metadata rows; the only way for Claude
to tell them apart is `download_chart` (full base64, 20 MB cap, token-heavy). A lightweight preview
(first-page text for text charts, low-res thumbnail for PDF/MusicXML) answers "which Lecha Dodi is
this?" cheaply. *MCP-agent.*

**F14. MCP document→outline→setlist import**
Daniel · MED · L · KNOWN (`mcp-claude-first-SYNTHESIS.md` Tier 3 #9) · **FACT.**
The in-app ImporterModal turns an order-of-service doc (.docx/PDF) into a setlist; there's no MCP
equivalent. Not blocking for the 90% clone case, but B'nai Mitzvah / High Holiday services often arrive
as documents from clergy, forcing a UI fallback. Three-tool layered design (import→resolve→create)
wraps mostly-existing server code. *MCP-agent.*

### TIER 4 — low / onboarding polish

**F15. Mount the existing first-run hints on the Perform route**
Band (onboarding) · LOW · S · NEW · **FACT.**
`PerformanceIntro.tsx` and `SwipeOverlay.tsx` exist with localStorage one-time-show logic but are
**not mounted** in `perform/setlist/[id]` or `perform/layout`. New musicians get no hint that swipe
navigates songs or that the drawer gives an overview. Cheap onboarding win for shared iPads. *(Note:
`PerformanceStatusStrip.tsx` is likewise built-but-unmounted — ambient song-position/key pill.)* *Perform-agent GAP-9/GAP-10.*

**F16. Per-musician annotation persistence on shared iPads**
Band · LOW–MED · M · KNOWN, *likely intentionally deferred* (cycle-9-instance-1 "out of scope") · **INFERENCE.**
No freehand/markup layer for a musician to keep private capo/fingering/notes on a chart; per-track
`transposition` is shared across all 6 iPads (Firestore track doc), not per-device. Vs paper this is a
real loss for a shared-device model — but it may conflict with the max-density philosophy
([[feedback_no_cover_art]]) and was called out-of-scope before. Flagging for a Daniel decision, not pushing. *Perform-agent GAP-7.*

**F17. `suggest_band` instrument normalization**
Daniel/David · LOW–MED · S · KNOWN (`cycle-9-sweep-TRIAGE.md` C9I4-004) · **FACT (borderline defect).**
Free-text `instrument` values ("Guitar"/"guitar"/"Acoustic Guitar") don't count toward `suggest_band`
slot coverage, so it under-counts and over-suggests. Borderline bug; listed for completeness.

---

## §C — Seam handoffs to coder-5 (robustness/security — NOT my scope, surfaced for routing)

These came up during ingestion but are reliability/integrity, not missing capabilities — routing to
coder-5's product-gap-robustness lane to avoid duplication:
- **Broken-bond ghost rows in `search_library`** (active rows whose bytes 404 — `cycle-9` C9I2-001) +
  `reconcile_library` shortcut misclassification (C9I3-002) + `storageUrl` suffix bug (C9I3-004):
  data-integrity / "charts silently unrenderable at service time."
- **trackCount drift** (C8I2-003) — non-atomic counter.
- **Screen wake-lock reliability on iOS Safari** (Perform-agent GAP-8) — API present-but-can-fail; a
  resilience concern, not a missing feature.
- **`list_musicians_on_date` legacy ISO-string `eventDate`** (C9I4-001) — appears already addressed
  (`roster.ts` ISO-match shipped @ `a5fcc3132` per claims.md); it's a defect, not a capability gap.

---

## §D — Verified NOT gaps (already shipped at `a5d35f47f`) — corrects stale memory/agent claims

Recorded so the supervisor synthesis doesn't re-derive these, and to flag where memory/sub-agents drifted:
- **Roster + scheduling MCP** — LIVE. `registerRosterTools` is wired in `route.ts` (one of **8**
  `register*` calls, not 4); `list_musicians_on_date`, `list_service_personnel`, `suggest_band`,
  assign/unassign all present. *(MCP sub-agent wrongly reported these absent — it miscounted route.ts.)*
- **Template CRUD** — LIVE. `list/get/create/update/delete_template`, `clone_setlist_from_template`,
  and `create_template_from_setlist` all in `index.ts`.
- **`clone_setlist`, `salvage_chart_bytes`, `dump_collection_size`, `get_web_vitals_summary`** — all LIVE.
- **Pinch-zoom** — UNLOCKED. Root layout `viewport.maximumScale = 5` (not 1). *(Perform sub-agent's
  "blocked globally" read was stale — P2-012/C6B-012 fixed it.)*
- **QR sign-in for shared iPads** — LIVE on `/login`. `LoginClient.tsx` imports + renders `<QRSignIn/>`
  with an explicit "shared-device (iPad) sign-in" comment (fix-onboarding-qr @ `d303a69ca`). *(Perform
  sub-agent's "buried in dashboard only" read was stale.)* Residual: WebKit/expiry/user-switch behavior
  is untested — that's a robustness/UAT item (coder-5 / iPad UAT harness), not a missing feature.
- **`list_setlists` eventDate sort + `publishedAt`** — SHIPPED (C5C-010/011): `sort:'recent_event'`
  orders by `eventDate`, and the row carries `publishedAt`.

---

## §E — FACTS vs INFERENCES summary

**FACTS (verified against deployed code at `a5d35f47f` or read directly in a corpus file):**
F1 (no `prefetchSetlistPDFs` caller; no precache on Perform entry; SW tombstone), F3 (no congregation
MCP tool), F4 (search-content server route exists, not MCP-exposed; `search_library` is title-only),
F5 (`setCurrentPosition` no-op), F6 (per-track lead shown; no in-Perform ensemble roster; `/schedule`
unprobed), F8 (prod-probe disjoint result sets), F9/F10/F11/F13/F14 (tool absence by inventory),
F15 (components unmounted), F17 (C9I4-004), and all of §D.

**INFERENCES (code-shape strongly suggests, but not behaviorally proven here):**
F2 (key-label path is chord-scan-dependent — needs a live MusicXML transposer check to confirm the
"Waiting for scan…" string), F5 live-refresh behavior (needs a real 2-device test — the headline
unknown), F7 (no diff surface — argued from absence + the 90%-same-week fact), F16 (annotation layer
absence likely intentional).

**Recommended fast follow-ups to convert the top INFERENCES to FACTS:** (1) open the transposer on a
MusicXML chart on an iPad and read the key label/capo grid; (2) two-device live-edit test (Daniel edits,
band iPad watches) — this is the single most load-bearing untested behavior in the product.

---

*Recommendations only; no implementation. Docs-only lane → FF-push → master-tip → SHIP-NOTICE.
— coder-6*
