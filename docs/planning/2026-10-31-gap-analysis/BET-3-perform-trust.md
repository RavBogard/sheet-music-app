# Bet 3: Perform trust pack (the remaining parts)

Evidence: `research/perform.md` (PERF ids). Already shipped:
- PERF-01, 02, 03, 06, 07, 08, 09, 16, 17 and the persist call (#29);
- the freshness line, the Save button and the not-saved marks (refresh #36/#38).

Daniel's rulings:
- edge tap zones with a per-device off switch;
- personal logins, not device accounts;
- pedal keys, half-page turns and night charts are NOT in scope.

The open-chart note line was decided by the lead, as the recommendation Daniel did not object to.

## PR P1: open-chart experience (`PDFOverlay`, `SongNavigation`, the viewers' scroll container, `src/hooks/use-musician-transposition.ts`, `src/lib/store.ts`)
1. **PERF-05, edge tap zones.**
   - A single tap in the right third of the chart area scrolls forward by about 85% of the viewport. At the bottom of the last page it goes to the next chart.
   - A tap in the left third does the reverse: back a screen, and at the top it goes to the previous chart.
   - The middle third does nothing new.
   - It ignores taps that are drags or scrolls (movement over 10px, or over 300ms), double-taps and pinch-zoom, and taps while zoomed in past fit-width.
   - It is suppressed while a leader long-press is pending, or while a popover or sheet is open.
   - It works for PDF, MusicXML, text and image viewers through one wrapper around the scroll container. Keep it out of the viewers' internals.
   - It is RTL-aware: use `useReadingDirection`, so in RTL left is forward.
   - **Per-device off switch:** a toggle in the Perform toolbar settings, "Tap edges to turn pages", default ON, persisted in `music-storage`.
   - Remove the dead `PerformanceIntro` leftovers if any remain. Don't add an intro screen.
2. **PERF-11, the note line and "Next".**
   - A slim strip under the top of the chart shows the row's note and its Vocal Lead, only when either exists. It is one line, and expands on tap.
   - `SongNavigation` shows "Next: <title> (<key>)" under the current song name when there is a next song.
   - Reuse or delete `ServiceFlowCard`.
3. **PERF-14, transposition for signed-out devices.** Persist the transposition and capo per fileId on the device in `music-storage` (as `chartZoom` already is). Signed-in users keep the Firestore preference.

## PR P2: offline integrity and proof (`src/lib/offline-idb.ts`, `prefetch.ts`, `SaveOfflineButton`, `.github/workflows/`, `e2e/`)
1. **PERF-18, versioned cache.**
   - Store the library row's `contentHash` (or its `updatedAt` when there is no hash) with each IndexedDB entry.
   - On Perform entry, when the device is online, compare against the current row (the tracks/initial-frame data already carries the fileId; add the hash or `updatedAt` server-side if it is missing) and re-fetch stale entries in the background.
   - Never delete a cached chart before its replacement is fully stored.
2. **PERF-21, a preflight that names failures.** The save pass records failed fileIds with a reason (`404`, network, or corrupt PDF). For PDFs, run a cheap header check: bytes start with `%PDF`. Perform rows show the existing not-saved line plus a reason ("Couldn't download", "File damaged"). Retrying is the existing Save button.
3. **PERF-20, nightly WebKit CI.**
   - A new scheduled workflow, nightly at 09:00 UTC (not per-PR), runs the bearer-free WebKit Perform specs against production: the corrected `perform-offline-reload`, `pwa-fresh-install` and the stuck-spinner probe.
   - It uses `npx playwright install --with-deps webkit`.
   - On failure it opens or updates one GitHub issue titled "Nightly Perform WebKit failing". There are no emails.

## Rules for both
- Perform must stay bulletproof, so prefer small, defensive changes.
- Keep every `data-testid`.
- Do not change chart rendering itself (PDF canvas, OSMD). Wrappers only.
- i18n in English and Hebrew, with translator notes in `src/i18n/notes`.
- Unit tests for the gesture logic (as a pure function: tap classification and zone), the strip, and the cache-staleness logic.
