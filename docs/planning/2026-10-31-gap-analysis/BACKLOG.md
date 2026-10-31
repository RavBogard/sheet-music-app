# Gap-analysis backlog: 2026-10-31

Evidence for every id is in `research/<area>.md`, and the decisions are in `STATE.md`. Ids are
stable: MCP-, PERF-, WEB-, MIXER-, TF- and TEL-. Status is one of `wave-1/<PR>`,
`wave-2/<PR>`, `bet-N`, `backlog`, `ops` (the lead does it by hand) or `dropped`.

## Wave 1: quick safe wins (three builders in parallel, disjoint files)

### PR A: draft correctness (`src/lib/profiles/`, `src/lib/history/`, `draft-service.ts`)
Logic fixes only. No new readback phrasing apart from the warnings below.
- **MCP-01:** "usual" is computed over the profile's last 5 **services** (non-special, one per
  date), not over the last 5 uses of a chart. A slot is usual only when its chart appears in 3 or
  more of those services. Regression test: history A,A,A then B,B means A is not usual.
- **MCP-07:** collapse the eligible setlists to one per (eventDate, serviceType, rabbiSlot), the
  newest version winning, before counting uses.
- **MCP-12:** classify specials more strictly. Holiday words (Sukkot, Shavuot, Yizkor, Simchat,
  Rosh Hashanah, Yom Kippur, Pesach), camp, celebration, retirement and the `shir\s+(\w+\s+)?shabbat`
  variant count as special or as their own type. **B'nei Mitzvah is its own service type and its
  own profile** (Daniel). A B'nei Mitzvah name beats a stored `shabbat_morning` serviceType when
  classifying history for the regular profile.
- **MCP-09:** exclude orphaned or archived charts from fill. When an archived chart has a
  `canonicalFileId`, recall the canonical one. Add a draft warning `dead_chart` for any row
  still affected.
- **MCP-08:** `draft_service` returns `existing:[{setlistId,name}]` when a setlist already exists
  on that date and type, and the readback says it first. This WARNS and never blocks (Daniel).
- **MCP-11:** add `writtenKey` to draft rows. Add a warning `key_mismatch` when the played key
  differs from the written key on a non-MusicXML chart. Warn only.
- **MCP-13:** strip the file extension and underscores from labels and phrases (`tiers.ts`
  `phrase()`, `seed.ts`).
- **MCP-22:** change the `get_service_profile` not-found hint to "call draft_service once; it
  creates the profile".
- **MCP-17 (part):** rewrite the `clone_setlist` description to "for one-off copies; for a weekly
  service use draft_service". Mark `profile__*` docs `kind:"profile"` and hide them from
  `list_templates`, `update_template` and `delete_template`.

### PR B: Perform reliability (`src/app/perform/`, `src/components/performance/`, `public/perform-shell-sw.js`, `src/hooks/use-setlist-performance.ts`)
- **PERF-01:** on an offline miss for `/perform/setlist/<id>/track/*`, the SW falls back to the
  cached `/perform/setlist/<id>`. The page also asks the SW to cache the track URL after
  `replaceState`. Fix `e2e/perform-offline-reload.spec.ts` to go offline in a way that holds for
  service workers (`context.setOffline`).
- **PERF-02:** the SW keeps the previous cache generation and deletes only those older than N-1.
- **PERF-03:** precache, the save count and the offline N/M use `!!t.fileId` (every openable row).
- **PERF-07:** when signed out and the SSR frame is empty, call `fetchTracksForSetlistClient`
  once, and again on `online`/`visibilitychange`.
- **PERF-08:** add Retry plus a bounded render watchdog to the MusicXML (SmartScore) and Text
  viewers, and `putFile` the bytes on a successful network fetch.
- **PERF-16:** show only one offline pill on the setlist page.
- **PERF-18 (part):** call `navigator.storage.persist()` on Perform mount.
- **PERF-17:** delete `PerformanceIntro`, `RehearsalToolbar`, `PerformanceStatusStrip` and
  `Metronome.tsx` along with their i18n keys and the dead live-stepping props. Keep
  `ServiceFlowCard` for wave 2.
- **PERF-06:** signed-out devices: when the live public setlist doc's `version`/`updatedAt` moves
  past the SSR frame, show a slim strip, "Setlist updated, tap to refresh" (wording approved
  2026-10-31). Never auto-reload while a chart is open.
- **PERF-09:** `initial-frame` and the tracks API attach `mimeType` from `library_index` when a
  row lacks it.

### PR C: web app trims (`src/app/(main)/`, `src/app/(v2)/`, `src/components/` outside performance and monitor, `proxy.ts`)
- **WEB-08:** delete v2: the footer link, `src/app/(v2)`, `src/components/v2`, the
  `[data-theme="v2"]` tokens, the Geist font if only v2 uses it, the `v2.*` i18n keys and the
  `/v2` branch in `proxy.ts`.
- **WEB-07:** take Schedule out of the top nav (keep the route for one release).
- **WEB-09:** remove the footer Changelog link.
- **WEB-16:** delete the `/admin` alias. The library-review redirect explains "admin only".
- **WEB-01:** the editor shows the row position `index+1`, not the stored order. Never re-sort.
- **WEB-02:** consistent count labels: "N songs" means rows with a chart, matching Perform. Fix
  `songCount_one`.
- **WEB-03 (part):** strip the extension wherever a title is derived from a file name.
- **WEB-12:** add a Perform link to the editor header.
- **WEB-13:** 44px hit areas for the drag handle, row icons and checkboxes (padding only).
- **WEB-17:** an h1 on `/setlists` and `/monitor` (visually hidden is fine).
- **WEB-15:** hide `[TEST]`/`test-` accounts from the People list.
- **WEB-06:** normalise the rabbi chips for the filter only (trim, decode entities, split on / and &).
- **WEB-19:** a smaller, two-line title in the Perform viewer footer.
- **WEB-05 (part):** fold per-instrument and "(Copy)" setlists under their parent service in
  `/setlists` with an expander (Daniel: fold, keep the copies).
- **TEL-01:** exclude Drive folders (`application/vnd.google-apps.folder`) from library list and
  search, and have `/api/drive/file/[id]` answer a folder with a clear 400, not a 403.
- **TEL-02:** an in-app page counter added to the existing `/api/web-vitals` beacon (route plus
  surface, daily counters in Firestore). No third party (Daniel).

## Wave 2: mechanical MCP + tenant fixes (one builder, after PR A merges; shares `agent-guide.ts`, `tools/index.ts`)
- **MIXER-18:** sweep "IEM"/"in-ear" to "wedge" in MCP strings and errors.
- **MIXER-06:** for a privileged caller with no bus, the `get_mix` error lists the buses and
  says "pass busIndex".
- **MIXER-08:** add `audible`, `db` and the `onlyActive` filter to `get_mix`.
- **MIXER-17:** `get_command_status` filters by uid unless the caller is privileged.
- **MIXER-07 (guide):** add a mixer section to the agent guide.
- **MIXER-20 (part):** a Saturday 15:00 UTC `bridge-watch` cron.
- **MIXER-11:** the bridge-watch push also reaches the sound-engineer flag holders and Michael
  (Daniel approved). `get_bridge_health` accepts privileged-monitor callers.
- **TF-05 (message):** the band-mode `draft_service` error text no longer mentions rabbis.
- **TF-06:** BL wording: "Generated by Brothers Lazaroff", BL packet subject and chart footers.
  CRC stays the legal operator (Daniel).
- **TF-07:** hide the matrix/calendar view's parasha and the Friday/Saturday toggle for band
  tenants. Delete `handleCreateFromCalendar`.
- **TF-15:** `bookSlugsFor` defaults to every registered book for CRC when the stored list is
  stale. Check live `list_books` first.
- **TF-17/TF-11:** contract tests (the Overlays field list against a built `get_setlist`; the BM
  `contract.ts` against a golden pair).
- **TF-14:** fix the CLAUDE.md note: Shirei Tshuvah is printed at 184pp (Daniel).
- (MCP-20 moved to bet 1, because it shares `readback.ts`.)

## Ops (the lead, by hand)
- Approve Drew Brodsky's pending request (Daniel approved).
- Assign bus 5 also to the account Claude Desktop uses (Daniel approved).
- TEL-01 back-fill: mark existing folder rows in `library_index`, dryRun first (F-05).
- Re-seed the three probe-seeded profiles after bet 1 (or PR A) lands.
- PERF-19: the keep-awake acceptance protocol on a real iPad, which needs Daniel and a device.
- PERF-01 confirmation: one airplane-mode reload on a real iPad.

## Big bets (ordered)
1. **bet-1, service memory rebuild** (Daniel: first):
   - MCP-02: moment-keyed slots.
   - MCP-03: re-learn the running order from the last N regular services; B'nei Mitzvah gets its
     own preset.
   - MCP-04: name risky filled rows ("fill it but say it").
   - MCP-05: `vsLast` diff.
   - MCP-06: `recall` on open rows plus `useRecall`.
   - MCP-14: collapse part rows.
   - MCP-15: Randy fallback from the legacy template; `clone_setlist` takes rabbiSlot.
   - MCP-21: carry open items forward.
   - MCP-23: performed-history overlay.
   - MCP-25: visible seed plus `reseed_service_profile`.
   - MCP-16: bond confidence flags.
2. **bet-2, chart lineage:**
   - MCP-10: revisions affect the future only, keep played keys, and migrate standing choices.
   - `revisionOf` on every intake path.
   - MCP-19: the dedupe refusal offers "new version of X?".
   - MCP-18: one key rule on a chart change.
   - WEB-03: the chart chip in the editor.
   - WEB-04: song page with variants.
3. **bet-3, Perform trust pack:**
   - PERF-05: edge tap zones with an off switch.
   - PERF-11: note + Vocal Lead line and "Next: title (key)".
   - PERF-10: freshness line and cached dots.
   - PERF-21: the preflight names failed charts.
   - PERF-14: signed-out transposition persists.
   - PERF-18: versioned IDB cache.
   - PERF-20: nightly WebKit CI.
   - B5: changes since last time.
4. **bet-4, wedge safety and memory:**
   - MIXER-03: Drew-set ceilings, enforced in the bridge, a bridge release.
   - MIXER-01: saved mixes (auto snapshot plus named presets).
   - MIXER-05/15: engineer console with plural buses.
   - MIXER-09: bridge-down wording.
   - MIXER-10: late-replay guard.
   - MIXER-12/13: heartbeat launch reason and blank error.
5. **bet-5, Brothers Lazaroff band mode:**
   - TF-01/02: gig block with venue, address, load-in/soundcheck/start/end and set lengths with
     a total.
   - TF-05: band-mode `draft_service` from a named setlist.
   - TF-08: BL agent guide.
   - TF-09: contact parts.
   - TF-03/04: segues and per-singer keys.
6. **bet-6, family spine:**
   - TF-12: advisory `weekKey` emitted additively in `today.json`; tell Overlays first.
   - TF-13/16: Beit Mitzvah card on the setlist, names allowed (Daniel).

## Backlog (not chosen now)
- PERF-04: pedal keys.
- Half-page turns.
- PERF-12: night charts.
- PERF-13: annotations.
- PERF-15/B4: MusicXML part picker.
- B1: fleet readiness board (personal logins chosen).
- MIXER-02/04: undo and change log.
- MIXER-07: the one-call `adjust_my_mix`.
- MIXER-14: request a bus.
- MIXER-16: server-clock online check.
- WEB-04/14: song page and review density (partly in bet-2).
- WEB-10: hydration #418.
- WEB-11: confirm the tracks-subscription permission error with a real musician account.
- WEB-18: one home.
- TF-09/10: contacts and BL-only members.
- Per-part single setlist: Daniel chose folding instead.
- Pending People: Meir Bargeron (templecav) is undecided.
