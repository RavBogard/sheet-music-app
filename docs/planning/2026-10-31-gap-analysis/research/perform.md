# Research: Perform (band iPads), 2026-10-31

Scope: `/perform/*` on the band's 11" iPads (820×1180, Safari/WebKit, Home-Screen PWA), plus the
components, hooks, service worker and e2e specs behind it. This was a code and docs read only. No
browser was run and no prod data was touched, so there is no `test-gap-` data to clean up.

## 1. How it works today

- **Entry.** `/perform` is a force-dynamic SSR list of upcoming setlists (`src/app/perform/page.tsx:52-84`).
  The layout returns 404 unless the tenant has the `perform` flag (`src/app/perform/layout.tsx:17-20`).
  The setlist view `/perform/setlist/[id]` is a server component. It reads the setlist, its rows and
  tonight's overrides with the Admin SDK (`initial-frame.ts`) and passes them in as the first frame
  (`[id]/page.tsx:36-51`).
- **Data after load.** `useSetlistPerformance` (`src/hooks/use-setlist-performance.ts`):
  - A **signed-in** device mounts a Firestore snapshot listener that writes into Dexie and live-queries
    it (`:158-187`), and it follows tonight's swaps live (`:239-252`).
  - A **signed-out** device does not subscribe to rows (`:160`) or to swaps (`:242`). It keeps the SSR
    frame until a reload, by ruling R-0919-audit-19.
  - Setlist metadata comes from a public `get` listener (`:139`).
  - Dexie wins whenever it has rows; otherwise the SSR frame stands (`:229-230`).
- **Chart view.** Tapping a row mounts `PDFOverlay` (`SetlistPerformClient.tsx:452-470`), and the URL
  is rewritten with `replaceState` to `/track/<trackId>` (`:173-187`). `resolveViewerKind` picks the
  viewer: PDF (react-pdf), MusicXML (OSMD `SmartScoreViewer`), text, image or audio
  (`resolveViewerKind.ts:103-134`). The queue is every row with a `fileId` (`PDFOverlay.tsx:90-108`).
  Song-to-song moves go through the bottom toolbar's prev/next (`SongNavigation.tsx`) or the setlist
  drawer. Pages within a chart scroll vertically, with a page pill (`PDFViewer.tsx:357-381`).
- **Offline.**
  - Chart bytes go into IndexedDB `crc-offline`, keyed by fileId (`src/lib/offline-idb.ts`). Three things
    fill it: a precache on entry (`use-perform-entry-precache.ts`), the "Save offline" button
    (`SaveOfflineButton.tsx`), and a prefetch of the next two charts (`PDFOverlay.tsx:292-341`).
  - The page shell comes from `public/perform-shell-sw.js`: NetworkFirst for `/perform` HTML and
    CacheFirst for `/_next/static`, with the cache versioned by commit SHA. It is registered once per
    tab (`perform-shell-sw-register.ts`).
- **Keep-awake.** One `KeepAwakeProvider` serves the whole route tree. `<KeepAwakeAutoArm/>` arms it on
  mount, and a banner shows when the lock is not held (`PerformClientLayout.tsx:176-190`).
- **Leader extras.**
  - Long-press on a chart opens change key, swap chart or insert song (`LiveDirectorGesture`).
  - Each row has a "Swap for tonight" control (`TonightSwapSheet`).
  - The edit pencil links to `/setlists/<id>`.
- **CI.** Only `e2e/smoke.spec.ts` on Chromium runs in CI (`.github/workflows/ci.yml:299-326`). Every
  iPad/WebKit Perform spec is run by hand.

## 2. Findings

Severity: S1 service-breaking · S2 weekly pain · S3 annoyance · S4 polish. Effort: XS <1h · S <1 day ·
M a few days · L a week or more. **QW** = quick safe win.

| ID | Type | Persona | Sev | Evidence | Recommendation | Effort | QW |
|---|---|---|---|---|---|---|---|
| PERF-01 | bug | musicians (any device mid-chart) | S1 | Opening a chart rewrites the URL with `history.replaceState` (`SetlistPerformClient.tsx:184-186`). That makes no request, so the SW never caches `/perform/setlist/<id>/track/<trackId>`. Its NetworkFirst matches the exact request URL and returns `Response.error()` on a miss (`perform-shell-sw.js:126-150`). So an **offline reload while a chart is open** most likely shows the browser's "no internet" page. The spec that claims to prove otherwise (`e2e/perform-offline-reload.spec.ts:98-150`) goes offline with `page.route(...abort)` (`e2e/helpers/gestures.ts:57-63`). Playwright's `page.route` does not see requests a service worker makes, so the reload probably went to the network and passed. **PLAUSIBLE, strong.** It needs one real iPad check (airplane mode, then reload on a chart). | In the SW's `networkFirst` catch: on a miss for any `/perform/setlist/<id>/track/*`, fall back to the cached `/perform/setlist/<id>` (and to any cached `/perform/setlist/<id>*`). Separately, `cache.add()` the track URL from the page after each `replaceState` (post a message to the SW). Fix the spec to use `serviceWorkers:'block'`-aware offline (`context.setOffline` plus a blob-safe assertion), or assert via CDP network emulation. | S | yes |
| PERF-02 | risk | all iPads after a deploy | S2 | On `activate`, the SW deletes every older `perform-shell-v*` cache and claims open pages (`perform-shell-sw.js:45-74`). The version is the commit SHA (`perform-shell-sw-register.ts:getSwVersion`). Daniel deploys several times a day. An iPad that loaded the setlist before a deploy and picks up the new SW loses the cached HTML and chunks of the page it is running. A later offline reload then has nothing to serve, and lazily loaded old-hash chunks (OSMD, viewers) are gone too. **PLAUSIBLE.** | Keep the previous generation for 48h (delete only caches older than N-1), or key the HTML cache without the SHA and refresh it on each online navigation. | S | yes |
| PERF-03 | bug | musicians reading prayers/readings | S2 | The precache list and the offline counter take **song rows only**: `.filter(t => (!t.type \|\| t.type === "song") && t.fileId)` (`SetlistPerformClient.tsx:209-211`). Yet bonded prayer and reading rows open as charts (`PDFOverlay.tsx:78-90`, `SetlistRow.tsx:86`). So "Saved N/N" can read complete while the bonded Bar'chu or Torah-service charts are not cached. Offline, they fail unless one was the next-two prefetch. | Use the same `hasChart` predicate (`!!t.fileId`) for `songFileIds`, so precache, the "Save offline" count and the offline N/M all cover every openable row. | XS | yes |
| PERF-04 | gap | musicians, pedal users | S2 | Perform has **no keyboard handler** apart from Escape (`PDFOverlay.tsx:352-364`). `ArrowRight/ArrowLeft/PageDown/PageUp/Space` appear nowhere in `src/components/performance` or `src/components/music` (grep). Bluetooth page-turners (AirTurn, PageFlip, Donner) send exactly those keys. `useReadingDirection().forwardKey` exists for this purpose (`src/i18n/client.tsx:23,121-140`) but only the grid uses it. Body scroll is locked (`PDFOverlay.tsx:227-233`), so the keys do nothing. | Add one `keydown` listener in `PDFOverlay`: PageDown/Space/ArrowDown scroll the chart scroller by about 85% of its height, and at the bottom go to the next chart. PageUp/ArrowUp do the reverse. `forwardKey`/`backKey` go to the next/previous song, RTL-aware. Skip when focus is in an input or a popover is open. Add a unit test plus one WebKit e2e. | S | yes |
| PERF-05 | gap | musicians | S2 | No tap-zone page turns and no swipe between songs. `PerformanceIntro.tsx` still tells users to "swipe left for next song / tap centre for toolbar / pull down to exit" (`:22-65`), but no touch handler exists (grep `onTouchStart\|swipe` finds nothing in the viewers) and the component is not rendered anywhere (it is imported only by an i18n test). The only way to change song is the 56px prev/next buttons in the bottom toolbar or the drawer. | Edge tap zones in the chart scroller: the right or bottom third goes down a screen, then on to the next song; the left third goes back. Keep it off for leaders while a long-press is pending. Delete `PerformanceIntro` or ship it together with the gestures. | M | no (gesture choice is a product call) |
| PERF-06 | gap | signed-out musicians | S2 (when the setlist changes after load) | Signed-out iPads never refresh rows or tonight's swaps (`use-setlist-performance.ts:158-173, 239-252`). Daniel accepted this in Sept (R-0919-audit-19, `RULINGS-AUDIT-2026-09-19.md:198-200`) because "none is actively used these days". Today's alignment says adoption is partial and Perform reliability is a main pain (STATE.md). A Friday-afternoon MCP edit, or a leader's swap mid-service, never reaches a signed-out iPad, and nothing on screen says so. The setlist doc is public `get` (`firestore.rules:203-204`) and is already live on that device (`use-setlist-performance.ts:139`). Every MCP write bumps its `version`. | Do not build polling. When the live setlist doc's `version`/`updatedAt` moves past what the SSR frame carried, show a non-blocking "Setlist updated: tap to refresh" strip, or silently refetch `/api/setlists/{id}/tracks` while no chart is open. **Reopens a ruling, so it is a question below.** | S | no (ruling) |
| PERF-07 | bug | signed-out musicians | S2 (rare trigger) | If the SSR Admin read fails, `fetchInitialFrame` returns `{setlist:null, tracks:[]}` (`initial-frame.ts` catch). The client then has the public setlist doc but no rows: signed out it never calls the `/api/setlists/{id}/tracks` fallback, which only `fetchTracksForSetlistClient` uses and the Perform hook does not (`client-tracks.ts:60-110`). The page shows "No tracks yet" (`SetlistPerformClient.tsx:473-483`), which is the blank-setlist class of failure W2B fixed for the other path. | In `useSetlistPerformance`: when signed out and the SSR frame is empty, call `fetchTracksForSetlistClient` once, then again on `online`/`visibilitychange`. | XS | yes |
| PERF-08 | bug | musicians | S3 | The MusicXML and text viewers have **no Retry and no watchdog**. On failure they show a static message (`SmartScoreViewer.tsx:608-613`, `TextScoreViewer.tsx:139-150`). PDF has a render watchdog and Retry (`PDFViewer.tsx:258-319`) and image has Retry (`ImageScoreViewer.tsx:83`). A shul-WiFi blip on the strategic format (MusicXML) leaves a dead chart until the musician leaves and comes back. A MusicXML fetched from the network is also never written to IDB (no `putFile` in the viewers), so a chart viewed online is cached only if the precache got it. | Add the same Retry plus a bounded render watchdog to SmartScore and Text, and `putFile` on a successful network fetch. | S | yes |
| PERF-09 | risk | musicians on musician/public iPads | S3 | `resolveViewerKind` gives the library row's mime/name priority, but `useLibrary` runs only for leaders (`SetlistPerformClient.tsx:206, 384, 514-517`). On band iPads the kind comes from `track.mimeType`, then `fileName`, then the `fileId` extension, then **defaults to PDF** (`resolveViewerKind.ts:118-133`). Writes stamp `mimeType` now (`setlist-write.ts:765-766, 917-918`), but older rows bonded before that, carrying an octet-stream MusicXML, would open in PDFViewer as "Failed to load PDF" for musicians while working for Daniel. **PLAUSIBLE**: depends on how many legacy rows lack `track.mimeType`. | Have `initial-frame`/the tracks API attach `mimeType` from `library_index` when the row lacks it (server-side, cheap). Run a one-off read-only count of rows with a `fileId`, no `mimeType` and a non-PDF library mime. | S | yes |
| PERF-10 | gap | musicians ("why stay on paper") | S2 | There is **no freshness or version trust signal**. The view never shows when the setlist was last changed, which version this is, or that this device has the latest. No `updatedAt`/`version` appears in `SetlistPerformClient`, `SetlistView` or `SetlistRow` (grep). Offline readiness is shown only as the header "Save offline" state; the N/M pill appears only **after** going offline (`PerformanceOfflineIndicator.tsx:96-104`). Per row there is no "cached ✓" or "chart missing" mark (`SetlistRow.tsx:81-86`). | Add a slim status line under the header: "Updated Fri 4:12pm · 24/24 charts on this iPad". Add a per-row dot for not-cached or failed-to-fetch. This needs wording, so it goes in the wording batch. | S | no (wording) |
| PERF-11 | gap | musicians, Vocal Leads | S2 | The leader's **row notes and the Vocal Lead disappear once a chart is open**. `track.notes`, `leadMusician` and `bpm` show only in the list (`SetlistRow.tsx:225-249`). The overlay toolbar shows only the title and "N of M" (`SongNavigation.tsx:44-52`), with no key, no notes and no "next: <title>". An "Up next" card already exists, unused (`ServiceFlowCard.tsx`, `upNext` prop, referenced only by an i18n test). | Show a one-line note and Vocal Lead strip at the top of the chart when the row has a note, and add "Next: <title> (<key>)" under the song name in `SongNavigation`. Reuse `ServiceFlowCard` or delete it. | S | no (layout/wording) |
| PERF-12 | gap | musicians in dim stage light | S3 | There is **no dark or stage mode for chart content**. The chrome follows the theme, but PDF pages render white on `bg-muted dark:bg-zinc-900` (`PDFViewer.tsx:475`) and MusicXML is forced `text-black` on a white card (`SmartScoreViewer.tsx:590-591`). There is no invert or night toggle (grep `invert\|night\|stage`). | Add a per-device "Night charts" toggle: CSS `filter: invert(1) hue-rotate(180deg)` on the PDF canvas and an OSMD dark colour set. Persist it in `music-storage`. | S | yes (a behaviour toggle; only its label needs wording) |
| PERF-13 | gap | musicians, pencil users | S3 | **No annotations.** The `PDFOverlay` docblock still advertises "transpose, annotate, zoom, metronome" (`PDFOverlay.tsx:130`) and the rules keep `users/{uid}/annotations/{fileId}` (`firestore.rules:141`), but no annotation UI or storage code remains (grep `annotat` returns only comments). Paper players keep their pencil marks; iPad players cannot. | Big bet B3 below. Fix the stale docblock now. | L | no |
| PERF-14 | gap | signed-out horn and guitar players | S3 | Personal transposition sticks per song only when signed in (`use-musician-transposition.ts:56-160` guards on `user`). The capo is render-time only and not persisted (`store.ts:119-129`, `partialize` keeps only `chartZoom`/`audio`, `:366-370`). A signed-out Bb player re-transposes every chart every week. The SetlistRow key badge for public view shows the concert key only (`SetlistRow.tsx:66`). | Persist per-device `{fileId → transposition, capo}` in `music-storage` for signed-out users, as `chartZoom` already does. Signed-in users keep the Firestore preference. | S | yes |
| PERF-15 | gap | multi-part MusicXML readers | S3 | OSMD renders every part. No instrument or part selection exists (no `Instruments[..].Visible`/part filter in `src/components/music`). This matters for the strategic MusicXML direction: a full score on an 11" iPad is unreadable. | Add a per-device part picker for MusicXML with more than one part, remembered per fileId. Big bet B4. | M | no |
| PERF-16 | bug | everyone offline | S4 | **Two offline pills** stack at the same fixed top-centre position. The layout renders `<PerformanceOfflineIndicator/>` without ids ("Offline mode") (`PerformClientLayout.tsx:181`) and the setlist page renders a second one with ids ("N/M charts ready") (`SetlistPerformClient.tsx:362`). Both are `fixed top-safe ... z-splash` (`PerformanceOfflineIndicator.tsx:82`). | Render the layout one only when the route is not a setlist, or drop it from the setlist page and pass ids via context. | XS | yes |
| PERF-17 | dead-surface | (maintainers) | S4 | The following are dead or left over: <br>• `PerformanceIntro`, `RehearsalToolbar`, `ServiceFlowCard`, `PerformanceStatusStrip` and `Metronome.tsx` are imported nowhere in product code; their only importers are i18n tests (grep). <br>• `currentTrackIndex = -1` and `setCurrentPosition = () => {}` ("live stepping removed", `use-setlist-performance.ts:286, 342`) still flow through `SetlistView`'s `onLeaderSetPosition`. <br>• `public/sw.js` is a tombstone. | Delete the dead components and their i18n keys, and remove the dead props. Keep the `sw.js` tombstone. | S | yes |
| PERF-18 | risk | all iPads | S3 | Storage is never made persistent. `navigator.storage.persist()` is never called (grep finds only `estimate()` in `offline-manager.ts:43`). In a plain Safari tab (not the Home-Screen app), WebKit's 7-day cap on script-written storage can wipe IDB charts and SW caches on an iPad unused for a week, which is the weekly cadence. The IDB entries also carry no version or ETag (`offline-idb.ts:18-160`), so a same-fileId heal-in-place (reconcile mirror, shortcut-target resolve, finalize-heal) is never seen by an iPad that already cached the old bytes; `hasFile` short-circuits (`prefetch.ts:73`). **PLAUSIBLE.** | Call `navigator.storage.persist()` on Perform mount. Store the library row's `contentHash`/`updatedAt` with each IDB entry and re-fetch when the server's differs. Tell the band to use the Home-Screen app (see Q3). | S | yes (persist call); M (versioned cache) |
| PERF-19 | risk | Daniel, band | S2 | The keep-awake fix has **never been verified on hardware**. `docs/IPAD-KEEP-AWAKE-ACCEPTANCE.md` is a 7-step manual protocol still outstanding (`RETURN-CODE-AUDIT-2026-09-19-W2B.md:666-670`). Fable's layer G, fleet telemetry ("are all iPads holding the lock?"), was never built: no keep-alive beacon or `get_keepalive_status` exists (grep). Layer 0 (Auto-Lock Never, iPadOS ≥ 18.4, Low Power Mode off) depends on device setup nobody has audited. | Run the acceptance protocol on one fleet iPad. Fold layer G into big bet B1. | S (manual) | no (needs Daniel and an iPad) |
| PERF-20 | gap | Daniel (testing) | S3 | **No iPad/WebKit Perform spec runs in CI.** CI runs `smoke.spec.ts --project=chromium` only (`ci.yml:326`). The 10+ Perform iPad specs (`perform-ipad*.spec.ts`, `stress-ipad`, `perform-offline-reload`, `tonight-swap-ipad`, `live-director-gesture`) need a manual `--project=ipad-webkit`, and several need `MCP_BEARER`. PERF-01 shows a manual spec giving a false green. | Add a nightly (not per-PR) workflow running the bearer-free WebKit Perform specs against prod, starting with offline-reload (corrected), pwa-fresh-install and the stuck-spinner probe. | S | yes |
| PERF-21 | friction | musicians | S3 | **No preflight on the device.** Precache failures are swallowed ("Silent fail — best-effort", `prefetch.ts:87-89`). "Save offline" reports a partial count but not **which** chart failed (`SaveOfflineButton.tsx:206-224`). A chart that 404s or will not render is found only when tapped, mid-service. | Have the save pass record failed fileIds and mark those rows (ties to PERF-10). Optionally render page 1 of each PDF off-screen during idle to catch corrupt bytes. | S | no (row mark needs wording) |

## 3. Big bets

**B1. Fleet readiness board ("are the iPads ready?").**
- *Problem:* nobody knows before candle-lighting whether each iPad has the latest setlist, every chart
  cached, the wake lock held and the right OS. Trust breaks the first time one iPad is wrong.
- *Sketch:*
  - Each Perform device has a persistent label ("Piano iPad") and sends a small heartbeat on load,
    every 60s and on visibility change: `{label, setlistId, setlistVersion seen, chartsCached/total,
    failedFileIds, wakeLock held, displayMode, iPadOS version, online}`.
  - The heartbeat goes to a rate-limited API, and from there to Firestore.
  - A new MCP tool, `get_fleet_readiness`, lets Daniel ask Claude "is the band ready for tonight?".
  - The leader's Perform header shows "5/6 iPads ready".
  - This absorbs Fable layer G.
- *Risks:* writing a device label raises a privacy note (device labels, not people); write volume
  (limit to 1/min); a new public write endpoint, which must be per-setlist and rate-limited.
- *Effort:* M.

**B2. Stage-grade chart navigation (pedal + tap zones + half-page turns).**
- *Problem:* paper players turn a page without thinking. On the iPad, moving takes a precise scroll or
  a toolbar button.
- *Sketch:*
  - PERF-04 key handling, plus tap zones (PERF-05).
  - A "half-page turn" mode: the bottom half of the screen shows the top half of the next page or
    chart, so the musician reads ahead.
  - Auto-advance to the next chart at the end of the last page.
  - A per-chart remembered scroll position.
- *Risks:* conflicts with the leader's long-press, with zoom/pan at 200%, and with RTL. It needs a
  WebKit e2e on real pedals (keyboard events).
- *Effort:* M.

**B3. Personal annotations layer.**
- *Problem:* the pencil is the strongest paper habit.
- *Sketch:*
  - Apple Pencil/finger ink on a transparent canvas over each PDF page and the OSMD SVG.
  - Strokes stored per user per fileId in `users/{uid}/annotations/{fileId}`; the rule already
    exists. Signed-out devices store them in IDB.
  - A "show leader's marks" layer: the leader's annotations are visible to all.
- *Risks:* coordinate drift on zoom or fit-mode, and on MusicXML re-render after transposing (anchor
  marks to measures for MusicXML); storage; and charts replaced by a new fileId lose their marks
  (offer to carry them over).
- *Effort:* L.

**B4. MusicXML as a true "my part" chart.**
- *Problem:* MusicXML is the strategic format, but today it renders as a full score with only
  transpose.
- *Sketch:*
  - A per-device instrument profile (Bb, Eb, guitar with capo, bass clef). Picking it auto-selects the
    part, the written-key transposition and the clef.
  - Chord-symbol-only "lead sheet" rendering for rhythm players.
  - Large-print mode.
- *Risks:* OSMD part-hiding and layout performance on iPad, and MusicXML files with poor part
  metadata.
- *Effort:* L.

**B5. Changes-since-last-time diff for musicians.**
- *Problem:* each week is 90% the same as last, and musicians distrust the iPad because they cannot
  see what changed.
- *Sketch:* on open, a dismissible card lists what is new since this device last saw the setlist
  (new rows, swapped charts, key changes, moved rows), worked out from the setlist history the device
  last cached. Signed-out devices get the same through the version check in PERF-06.
- *Risks:* history access for signed-out users (the server must compute a public-safe diff); wording.
- *Effort:* M.

## 4. Questions for Daniel

1. **Signed-out iPads and live changes (reopens R-0919-audit-19).** Should a signed-out iPad at least
   *notice* that the setlist changed after it loaded? The plan is a "Setlist updated, tap to refresh"
   strip driven by the already-public setlist doc. It adds no polling and no new access.
   *Recommended:* **yes, as a strip with no silent auto-reload while a chart is open.** It is cheap,
   and it addresses the "is this the current version?" doubt that keeps people on paper.
2. **Should the fleet iPads be signed in?** Signed in gives live rows, live swaps, sticky
   transposition and the profile instrument default. Signed out gives none of these. *Recommended:*
   **sign in each fleet iPad as a shared `pe`-role device account per instrument position** (e.g.
   "Piano iPad"). This makes PERF-06 and PERF-14 nearly moot for the fleet and enables B1. Personal
   iPads stay as they are.
3. **Home-Screen app or Safari tab?** The wake-lock bug affects the Home-Screen app below iPadOS 18.4.
   The 7-day storage cap affects the Safari tab (PERF-18). *Recommended:* **use the Home-Screen app on
   iPadOS ≥ 18.4, and add a one-time device setup checklist.** Older iPads that cannot reach 18.4 use a
   pinned Safari tab.
4. **Page-turn gestures.** Should edge tap zones turn pages (PERF-05)? Taps on the chart do nothing
   today except the leader's long-press. *Recommended:* **yes:** right or bottom third goes forward,
   left third goes back, with a per-device off switch.
5. **What a musician sees on the open chart (PERF-11).** Should the row note, the Vocal Lead and
   "Next: title (key)" show over the chart? *Recommended:* **yes, as a single slim line**, hidden when
   the row has no note.
