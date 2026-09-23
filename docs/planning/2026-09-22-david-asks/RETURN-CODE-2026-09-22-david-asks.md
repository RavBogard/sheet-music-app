# Return — David's four asks

2026-09-22. Executed from `HANDOFF-CODE-2026-09-22-david-asks.md` with the
clarifications in `COORDINATION-ADDENDUM.md`. Overlays was not touched.

## Starting point

- Local `master` at `ec04291d` (the handoff and the duplicates report,
  committed locally and not yet pushed), `origin/master` at `7e7a2aec`.
  The addendum was untracked; it was committed as `eff3af51`. Nothing else
  was staged or modified, so nothing needed preserving beyond those commits.
  No pull was needed: local was ahead of origin, not behind.
- The duplicates report (`DUPLICATES-REPORT-2026-09-22.md`) **was present**
  when this session started, so item 3 was run in order rather than skipped.
- MCP: this session used the admin root bearer from `.env.local`
  (`SUPERVISOR_PROD_BEARER`, uid `93Xn3DbS…`), and read-only Admin SDK
  surveys through the established firebase-CLI-token → temporary ADC recipe
  (temp file deleted on exit). Survey scripts live in `out/david-asks/`
  (git-ignored).

## Item 1 — chart preview while bonding: DEPLOYED

| check | result |
|---|---|
| Page 1 thumbnail on every candidate row, all three pickers (in-cell popover, centred dialog, "+ Song") | PASS |
| Tap/click enlarges page 1; closing returns with search text and highlight intact; nothing bound | PASS (unit + iPad e2e) |
| Keyboard: Ctrl/Cmd+Enter previews the highlighted row | PASS (unit) |
| Only on-screen rows fetch; off-screen rows abort; fast scroll fetches nothing | PASS (unit; e2e asserts rendered ≪ rows) |
| Non-PDF rows: "No preview", never an endless spinner (15 s render timeout) | PASS (unit) |
| No private bytes into any shared cache (reads offline-idb, writes nothing) | by construction |
| e2e `e2e/chart-preview-ipad.spec.ts` on ipad-webkit + landscape, against production | **4/4 passed** at `4d0c4e43` |

Shas: `8f18eb62` (feature), `70762172` (empty-list re-read + e2e helper repair),
`4d0c4e43` (probe-harness query trace, test de-flake). All deployed to production.
Full unit suite at `8f18eb62`: 4873 passed / 31 skipped. `tsc` clean, lint clean
(two pre-existing warnings in `e2e/helpers/auth.ts`), build clean when the three
public Firebase config vars are supplied (the W1-recorded local env gap).

Found on the way:
- The e2e helpers had not worked against production since the MCP split and the
  Publish retirement (`create_test_account` is ops-only; `publish_setlist` is gone).
  Repaired in `70762172`; every seeded spec in the repo depended on them.
- A picker opened while a cold device's songs listener was still filling could show
  "No matches." with rows in Dexie. The list now re-reads while empty. The trace
  added in `4d0c4e43` is for pinning down the remaining cause if it recurs; the
  last four production runs passed.
- Harness only: signing the Web SDK in after the setlist page mounts leaves its songs
  listener denied for good. Real iPads have their session before mount. The spec
  handles it; it is not a product change.
- Not changed, flagged for Daniel: the pickers' pre-existing "Recent" group orders
  by recency, and the unmounted legacy `AddSongsModal` has a "Suggested" row. The
  handoff says no recency ordering in the bond picker; removing a Daniel-built
  feature is his call.

## Item 2: pickers scoped to the site (deployed)

**What leaked.** All three pickers read the device's local `songs` table, which the
songs listener filled with an unscoped `collection('songs')` query. The `songs`
read rule was `isMember()`, and nearly every account (David's included) is a member
of both `crc` and `brotherslazaroff`. So on brotherslazaroff.live the picker listed
**907 rows, 844 of them CRC charts**. Nothing else leaked. The admin All-sites
switch belongs to the /library page, and the legacy `AddSongsModal` is not mounted.

**What changed** (`4a622288`):
- The songs listener subscribes to `where('orgId','==',hostOrg)`, where the host org
  comes from `useOrg()` (the site being served), not the account's memberships. It
  also drops any delivered row from another org.
- The table is scoped to site and account. A device that last served another site or
  account starts empty. On first run an old device keeps its own-site rows and loses
  the foreign ones. A delivery that arrives after unsubscribe writes nothing.
- Every writer that creates a `songs` doc now stamps its `orgId`: the Drive-sync
  mirror, the archive and rename routes, and chart-heal. The 990 existing docs
  already carried it: 927 crc and 63 BL, matching `library_index`.
- Rules: a songs read needs `isMember()` and the doc's org in the caller's orgs.
  Admins pass; a doc with no orgId counts as `crc`. This is defence in depth. The
  host-org client query is what actually scopes, because membership is not scope.
- Pickers hide `archived`, `duplicate` and `orphaned` rows; before, they hid
  `archived` only, and 101 duplicates showed.
- Collection chips appear only where the site has two or more collections. CRC gets
  CRC Charts, Shireinu, Nava Tehilah and Uploads, starting on CRC Charts; tap the
  active chip to lift the filter. BL has one collection, so it gets no chip bar.
- Admins get an "Other sites" switch, off each time the picker opens. It lists other
  tenants' charts in their own group.
- MCP `search_library` takes `collection` (`core` | `supplemental` (Shireinu) |
  `nava` | `uploads`).

| Check | Result |
|---|---|
| BL picker, account in both tenants | 907 rows before → **63** after, equal to BL `list_library.total` |
| CRC picker | 907 rows before (84 BL rows plus duplicates) → **744** across all collections |
| e2e `chart-picker-tenant.spec.ts` against brotherslazaroff.live, band leader in both orgs | **passed**: Library count = `list_library.total`, no chip bar, no Other sites |
| e2e `chart-preview-ipad.spec.ts` against centralreform.live (item 1 regression) | **passed** |
| live `search_library` "Lecha" | 12 unfiltered (core, nava, supplemental); `core` → 5 core; `supplemental` → 1 |
| Emulator: songs tenant rules 6/6, orgscope 20/20, search filter 15/15; full emulator suite 95 files / 1317 tests | passed |
| Unit suite | 4884 passed / 31 skipped. Three failures under full-suite load only (text-score-viewer, a Recent-group wait, one new scope wait); all pass alone. The two waits in files this item touched got longer timeouts. |
| `tsc`, lint, build | clean (lint: the two pre-existing warnings) |
| Rules | deployed after the code: `firebase deploy --only firestore:rules` released |

## Item 3: duplicates (applied where verified)

Revalidated against current bytes, per Astra's review. The report's LIKELY label rested
on file sizes. Each chart was fetched through `/api/drive/file` and hashed (sha256),
and page renders were compared. Renders are in the git-ignored
`out/david-asks/pages/<group>.png` and were not committed; chart content stays out
of the repo.

| Group | Evidence | Disposition |
|---|---|---|
| **L1** V'Shamru: `1WusU1xlwOKQvKu2kemrowh6oZ16S9UeR` plain, **0** setlists / `1cqxulkFHUjA0-w6tmUwK6t4TnPgLWbpx` Old Skool, **4** setlists | bytes differ (sha daf1af8a / e907cbc0) but every page renders pixel-identical at 150 dpi and the text layer is identical; the difference is the PDF creation timestamp | **merged**. Survivor Old Skool (most setlists). The plain row had no bonds to move. |
| **L2** Avinu Malkeinu (Janowski): `upload-a73d8721-3f66-4b3c-aac8-295717ffabdc` / `1J6H_F6Ba02_rMRQEJbi_lBbMXCBag6SQ` | **byte-identical**, sha e5122eac…, 2 pages | **merged**. Tie at 1 setlist each; canonical rule picks `upload-a73d8721` (active, Storage bytes, has uploadedAt), not the report's pick. |
| **L3** Summertime, C lead | different bytes and text (408 vs 392 words) | **kept both** → POSSIBLE |
| **L4** Modah Ani (Halpert) G#m | different bytes and text (218 vs 199 words) | **kept both** → POSSIBLE |
| **You're My Heaven (Tonight)** `upload-13f00526…` / `upload-e992b170…` (plus PDF `upload-4351dd4a…`) | the two text charts are byte-identical (660a1a58) | **untouched**. Daniel's canonical-row hold stands; the PDF is a separate format. |

**Dry run** (plan before commit):
1. `mark_chart_status` L1 plain → `duplicate`, canonical Old Skool: plan OK, no bonds.
2. `mark_chart_status` L2 loser → refused `mark_refused_row_is_bonded`, naming its one
   bond: *Erev Rosh Hashanah — September 11*, setlist `5ae5595e-405e-4a05-a3fb-0185c907615a`,
   track `3ef98d6e-a300-49f3-a0b1-e0b36d058e47` (order 23). So the swap comes first.

**Committed** (2026-09-22 ~19:28Z):

| Step | Undo |
|---|---|
| `swap_chart` track `3ef98d6e…` → `upload-a73d8721…`, `syncMetadata:false`. Title, order 23, notes and lead unchanged; fileName is now the survivor's. | swap back to `1J6H_F6Ba02_rMRQEJbi_lBbMXCBag6SQ`; the full pre-swap row is saved in `out/david-asks/l2-setlist-before.json` |
| `mark_chart_status` `1J6H_F6Ba02_…` → duplicate | `undo_dedupe_group` **`human-mark-2026-09-22T19-28-40-114Z-1J6H_F6Ba02_`** |
| `mark_chart_status` `1WusU1xl…` → duplicate | `undo_dedupe_group` **`human-mark-2026-09-22T19-28-45-346Z-1WusU1xlwOKQ`** |

Verification: `find_setlists_referencing_chart` returns **0** on both retired ids.
Neither group has more than one active row. Both marks mirrored into `songs`, so the
pickers hide them.

**POSSIBLE groups, unmarked.** Full ids were resolved (P2's second id is
`1r2GLfKEj0PZSPn0XbPO9sXfmzhJfcRTu`), and page 1 of every group is rendered side by
side. No pair among L3, L4 and P1–P16 is byte-identical. P6's two rows share text,
but one is a 164-byte text chart and the other a PDF, so they are different formats.
P16's morning words differ, as the report says. All of these are for Daniel and
none is marked:
L3, L4, P1 Shalom Rav, P2 V'shamru, P3 Hava Nagilah, P4 Elohai N'shamah, P5 Eil Malei,
P6 Bar'chu Walkdown, P7 Modah Ani, P8 L'cha Dodi (Nava), P9 L'cha Dodi (Ben Barak),
P10 Yedid Nefesh, P11 Hal'luyah, P12 Modeh Ani, P13 Shehecheyanu, P14 Friend of the
Devil, P15 Hinei Mah Tov, P16 Mi Chamocha.

Test data: the e2e accounts were revoked in `afterAll` and took their setlists with
them. `sweep_orphan_test_data` dry run finds 0 orphans, `list_test_accounts` is
empty, and no `ZZ` setlist remains.

## Item 4: swap a chart for tonight (deployed)

**For David:** In Perform, tap **Swap** on the row, then pick the chart. Every iPad
on the setlist follows within seconds. To go back, tap Swap again and pick the chart
marked "Planned" at the top, or tap **Reset to plan** to put every row back. The
saved setlist is not changed unless you tick "Also save to setlist".

**What changed** (`b047151b`):
- **Swap control.** Each chart-bearing Perform row has a Swap button for band leaders
  and admins only; musicians and signed-out iPads never see it. It appears only when
  the setlist has a service date.
- **The sheet**, in this order:
  - **Planned** comes first, labelled as the plan. Picking it is undo.
  - **Same moment**: charts that other rows bound to the same liturgical moment use.
    There is no chart↔moment binding in the library yet, so the evidence is setlist
    rows with that `momentId` or the moment's unit ids, intersected with this site's
    library.
  - **Same title**: the `bareStem` matches.
  - **Search**: over this site's library, which is scoped the same way as item 2.
  - Every section is alphabetical by title, then collection, then id. There is no
    ranking, badge, count, recency or key ordering. Each candidate shows the item-1
    page-1 thumbnail.
  - **"Also save to setlist"** is off by default. When it is ticked, the existing
    permanent `swapTrackChart` edit runs instead, and any swap already on that row is
    cleared first so it cannot sit over the new plan.
- **The plan is never written by a swap.** `tracks/*` and `setlists/{id}` stay
  untouched. The e2e checks this: `get_setlist` tracks are identical before and after,
  byte for byte.
- **Propagation:**
  - Signed-in iPads listen to the overrides doc, the same way they follow the tracks.
  - Signed-out iPads get the overrides in the server-rendered frame, and from
    `/api/setlists/{id}/tracks`, on their next load. **They do not follow live.**
    No anonymous realtime access was added (addendum §4).
  - An iPad with the swapped row open in the chart view switches the chart under it.
    Other rows are unaffected; Perform stores no per-row page position.
- **Setlist edit page:** a swapped row shows "Tonight: X (planned: Y)".
- **Expiry:**
  - An override applies only while the setlist's service day (America/Chicago) is
    today or later, and only if the doc was written for that same day. A setlist
    re-dated for a later service does not inherit the old swaps.
  - A date-only `eventDate` is that calendar day, never UTC midnight.
  - A missing or invalid date means no override applies, and no Swap control shows.
  - Open devices re-check once a minute.

### Schema, for reuse in the Overlays bridge

`setlists/{setlistId}/performance/overrides`:

```
{ rows: { [trackId]: { fileId, songId, title, key|null, mimeType|null,
                       plannedFileId|null, swappedBy, swappedAt } },
  eventDay: "YYYY-MM-DD",  // America/Chicago service day
  rev: int,                // +1 per commit, enforced by the rules
  updatedAt: ms, updatedBy: uid }
```

`setlists/{setlistId}/performedDeviations/{eventDay}-{rev:6}-{trackId}` is
append-only:

```
{ rowId, kind: "swap"|"undo"|"reset",
  plannedFileId, plannedTitle,   // the plan
  beforeFileId, beforeTitle,     // what the row showed just before
  performedFileId, performedTitle, // what it shows after (the plan's, for undo/reset)
  at: ms, by: uid, eventDay, rev }
```

- **Read path:**
  - The effective chart is `applyTonight(plannedRows, overridesDoc, eventDayOf(setlist.eventDate), now)`
    in `src/lib/performance/tonight.ts`. It is pure, and the web, SSR, API and
    reconcile all use it.
  - It never adds, removes or reorders rows. Only a swapped row's
    fileId/songId/title/key/mimeType change, and the row gains
    `tonight: {plannedFileId, plannedTitle, swappedAt}`.
  - If the doc is missing, malformed, unreadable, slow, for another day or past its
    day, the result is the plan unchanged.
- **Consistency:**
  - Every swap, undo and reset is one Firestore transaction: it reads the overrides,
    plans the write, and sets the overrides plus deviations.
  - **Stale:** if the row no longer shows what the operator saw, nothing is written
    and the sheet says what it shows now.
  - **Noop:** asking for what the row already shows writes nothing, so a retry after a
    lost acknowledgement does not add a second event.
  - The rules enforce all of this:
    - `rev` must equal the previous rev + 1.
    - Each deviation must land in the same commit as the overrides rev it names
      (`getAfter`).
    - Deviations are create-only, and deviation ids are deterministic.
    - The field set is closed, and `updatedBy`/`by` must equal the caller.
    - Writers are band leaders and admins of the setlist's tenant (unstamped = crc).
    - Overrides can be read by any signed-in user; deviations only by the tenant's
      leaders.
    - Deletes are server-only; a later cron may clear past days. None exists yet.
- **Reconcile:**
  - `reconcile_service` replays the deviations for the service day with
    `replayDeviations`.
  - Each planned row gains `chart: {source:"band-swap", plannedFileId, plannedTitle,
    performedFileId, performedTitle, swapped, sequence[], events}` next to the cue
    evidence, which is untouched. `diff.chartSwaps` counts rows that ended on a
    swapped chart.
  - A row the cue log matched keeps its cue basis and timestamp, and gains the chart.
    A repeated cue for the same prayer cannot cancel a swap.
  - A swapped row with no cue (skipped or untracked by cues alone) becomes
    `performed` with basis `chartSwap`, because the chart choice is the evidence.
  - A→B→C→plan and Reset end on the plan (`swapped:false`), keep the full sequence,
    and nothing claims an override is still active.
  - The promoted "(as performed)" clone re-bonds swapped rows to the chart actually
    played. That is on the clone only; the plan is never written.
  - Nothing here reaches Overlays; a chart swap is not overlay evidence (addendum
    "Temporary swaps and history").

### Checks and release

- Code `b047151b` is live (`/api/version` 11.7.0). The Firestore rules were released
  afterwards with `firebase deploy --only firestore:rules --project crcmusiccharts`,
  code first and rules second.
- Local, before the commit:
  - tsc clean.
  - Lint: 0 errors (6 pre-existing warnings).
  - Build exit 0.
  - Emulator: 96 files / 1327 tests. The tonight rules are 10/10, including a 12-row
    reset in one commit.
  - Unit: 4922 passed / 34 skipped / 1 load flake (route-auth), which passes alone.
    The item-4 tests are 69/69.
- **Production two-iPad e2e** (`e2e/tonight-swap-ipad.spec.ts`, ipad-webkit, a minted
  band leader and a minted musician). Four runs:
  - **Verified on production.** Run 3 reached the undo step:
    - The leader swapped in two taps, with "Also save to setlist" off by default.
    - The musician's row followed within 5 s with no reload and showed the tonight note.
    - The musician has no Swap control.
    - `get_setlist` tracks were byte-identical before and after.
    - A signed-out context saw the swap after a reload and had no Swap control.
    - The setlist page showed "Tonight: X (planned: Y)".
  - **Run 1: the leader's own row did not update** within the default 5 s check,
    while the musician's did. That page logged "Could not reach Cloud Firestore
    backend" right after its sign-in reload. In run 3 the leader followed in 16 ms.
    - Follow-up, not shipped: after a successful commit, the hook should adopt the
      committed doc when its rev is newer, so the leader who swapped always sees it even
      while their listen stream reconnects. The transaction already returns the doc.
  - **Run 3: a test bug, now fixed.** The Swap button's label names the chart now
    showing, so the locator for undo has to use the swapped title.
  - **Run 4, after the fix:** sign-in in the test harness failed in both contexts
    (session-cookie sync "Load failed", Firestore offline) before any swap. So undo and
    reset on production are **not yet e2e-verified**. They are covered by unit tests
    (A→B→C→plan, multi-row reset) and the emulator rules test (a 12-row reset in one
    commit).
  - The item-1 preview regression (`chart-preview-ipad.spec.ts`) failed twice this
    session:
    - An empty library list right after sign-in.
    - Once, a navigation redirected to /library.
    - Both look like the same sign-in instability. Rerun it after the reboot before
      calling item 1's regression green.
- **Owed:** a clean production rerun of both specs, and real-iPad acceptance, which
  automated tests cannot claim.


## Item 4 follow-up: reruns after the reboot, and the leader-row fix (committed, not deployed)

Assignment C2-DAVID-4 revision 2. Production stayed on `b047151b` (11.7.0)
throughout. Nothing was deployed.

### Production reruns

- **Item-1 preview regression** (`chart-preview-ipad.spec.ts`): **green**, 2 of 2
  runs (39 s, 34 s). The earlier empty-library failures did not recur.
- **Swap spec** (`tonight-swap-ipad.spec.ts`): 9 runs against production.
  - **Musician iPad:** both the swap and the undo arrived within 5 s in runs 3, 5
    and 6. The signed-out reload and the setlist-page note passed again. The saved
    tracks were byte-identical.
  - **Leader-row lag, reproduced (a product bug).** In runs 5 and 6 the leader's own
    row took about 30 s (30048 ms and 30108 ms) to show their own swap. After undo,
    the leader's row missed its 5 s check. Run 3 showed 19 ms, so the lag is
    intermittent, not constant.
  - **Reset to plan on production: still not e2e-verified.** Every run stopped
    before the reset step. That includes two runs with the leader's waits
    temporarily raised to 60 s (the change was reverted and is not committed).
- **Harness vs product.**
  - The "Session cookie sync … Load failed" and "auth/network-request-failed"
    warnings are harness noise. The spec's `page.reload()` cancels the in-flight
    `/api/auth/session` POST. A standalone probe showed:
    - the Web SDK user comes back within about 10 s of the reload;
    - `/api/auth/session` then returns 200;
    - the session stays signed in for more than 60 s.
  - The remaining failures are **Firestore delivery stalls** in Playwright WebKit on
    Windows. Evidence from the new `probe()` in the spec:
    - Runs 4, 7 and 8: the leader was signed in, but the Firestore profile (the
      role) never loaded, so the nav showed only "Setlists" and there was no Swap
      control. This is the same shape as the earlier empty-library failures.
    - Run 9: the server had `rev=1` with the swapped chart, and both pages were
      signed in, yet the musician's listener did not deliver it within 5 s.
  - Whether real iPads see these stalls is **unknown**. Automated runs cannot tell.
    Real-iPad acceptance is still owed.

### The fix (`src/lib/performance/tonight-client.ts`)

- **What changed.** When `runTransaction` resolves with a `write` plan, the client
  adopts `plan.next`: the exact doc the rules accepted. `subscribeTonight` merges
  those committed docs with its listener, and it never shows a lower `rev` than one
  it has already shown.
- **How the merge behaves:**
  - The leader who swapped sees the swap, undo or reset at once, even while their
    listen stream is behind.
  - A late snapshot from before the commit cannot move the row back.
  - A newer doc from another leader (higher `rev`) still wins.
  - `rev` goes up by one on every write, and the rules enforce that across service
    days too. So "higher rev wins" is safe.
- **What stays the same:**
  - Role checks and rules are unchanged, and a doc is adopted only after the commit
    resolved.
  - Stale, noop and failed commits adopt nothing.
  - Expiry: `overridesApply` / `applyTonight` still gate every render.
  - Saved-plan: `tracks/*` and `setlists/{id}` are still never written.
  - Both `useSetlistPerformance` and `useTonightTitles` get the fix through
    `subscribeTonight`, and their APIs are unchanged.
- **Scope limit.** This fixes only the committing tab. A stall on *another* iPad's
  listener (run 9) is not addressed. That is Firestore transport, and the
  signed-out reload path is the fallback.
- **Tests.** `src/lib/performance/__tests__/tonight-client.test.ts`, 8 new tests:
  - adopt on commit with no echo;
  - no step back on a late pre-commit snapshot;
  - undo and reset shown at once;
  - another leader's newer doc wins;
  - stale and noop adopt nothing;
  - a late mount starts from the committed doc;
  - a failed commit keeps the plan;
  - unsubscribe stops delivery.
- **Spec changes** (`e2e/tonight-swap-ipad.spec.ts`):
  - The leader's post-swap wait is back to 5 s, which is the acceptance bar for the
    fix.
  - On failure, `probe()` logs the server's overrides rev and row, and each page's
    Web SDK uid, and saves screenshots of both pages.

### Checks for the commit

- tsc: clean.
- Lint: 0 errors. There are 12 warnings, none in touched files.
- Unit tests: 414 files and 4934 tests passed, 31 skipped, 0 failed. The tonight
  tests are 39/39.
- Build: exit 0, with `SKIP_ENV_VALIDATION=1`. This checkout's `.env.local` holds
  only the harness keys, so env validation fails without it. The generated
  `src/build-info.json` was restored.
- Emulator rules tests: not rerun, because the rules are unchanged.
- No browser check of the fix yet. It needs a deployment, and a local build cannot
  serve against production without the Firebase env.

### Remaining gaps

- **After Astra reviews:** deploy (code only; no rules change), then rerun
  `tonight-swap-ipad.spec.ts` on production. The leader row should now pass at 5 s.
  Reset still needs its first production pass.
- **Real-iPad acceptance** (two devices), including a check for listener stalls on
  a non-committing iPad.
- **Test-data residue.** `revoke_test_account` deletes the seeded test setlists but
  not their `performance/overrides` and `performedDeviations` subcollections. Every
  e2e run leaves a few small orphaned docs that nothing reads. The cleanup tool
  needs a recursive delete. Not changed here.
- **Holds unchanged:** You're My Heaven and the uncertain duplicates are untouched.
  There is still no ranking, no Publish, no notifications and no Overlays edits.

## Item 4 follow-up: Astra's 21:56 review of 00bf5ff8 (revised, not deployed)

Both review points were real defects in 00bf5ff8. The revision is a new commit on
top of it; 00bf5ff8 itself is unchanged. Nothing is pushed or deployed.

### 1. Revision ordering

- **Defect confirmed.** In `show()`, any listener doc at or above this tab's
  committed rev set `shownRev` unconditionally. So after this tab's rev 2 and
  another leader's rev 4, a delayed rev 3 was shown: a step back.
- **Fix.** One rule for both paths (listener and own commit): a doc whose rev is
  not above the highest rev already shown is never shown.
- **Deletion.** A missing (or malformed) doc from the listener shows the plan, and
  the next doc at any rev shows again (a recreated doc starts at rev 1). The one
  exception is while this tab's own adopted commit is still ahead of the listener.
  There a missing doc is the stream catching up from before the write, which is
  the case that caused the 30 s lag.
- **Reset to plan** is a normal write (rev + 1, no rows), not a deletion, so it
  goes through the ordinary rule.
- **Known edge, documented in code.** If the server deleted the doc while this
  tab's commit was still ahead of the listener, the tab would keep showing its
  commit until the next write. No code path deletes the doc today: the rules allow
  delete only from the server, and no server path does it.

### 2. Cache and session lifetime

- **Defect confirmed.** 00bf5ff8 kept the last committed doc per setlist in a
  module-level map that outlived every subscription. A later subscription,
  including one opened after sign-out or by another account in the same tab, got
  it at once, before any authorized listener delivery.
- **Fix: nothing is cached.** The module keeps only the set of open subscriptions.
  A committed doc goes to a subscription only when all of these hold:
  - the subscription is open when the commit resolves;
  - it was opened by the same Firebase uid that started the commit;
  - that uid is still the one signed in when the commit resolves.
- **Why showing it before the listener's first delivery is still appropriate.**
  The committing transaction itself read and wrote this doc as this user, under
  the rules (read: signed in; write: band leader or admin of the setlist's
  tenant). So the doc is data this session may already see; nothing crosses a
  session boundary. Tenant does not gate reads of this doc, and a tenant or
  account change resubscribes through the hook's `user` dependency.
- **Sign-out, account change, unmount.** The subscription closes and leaves the
  set. A commit resolving afterwards reaches nobody, then or later.
- **Read failure (for example permission-denied).** The subscription closes and
  shows nothing more, not even its own commits. The caller keeps showing the plan
  or the server-rendered frame, as before.
- **Signed-out behavior is unchanged.** There is no realtime access and no
  adoption; the frame from the server shows on reload.

### Tests

`tonight-client.test.ts` now has 17 tests: the original 8, with the late-mount
case inverted to "nothing is cached", plus 9 new ones:

- rev 2 (own) → rev 4 (other) → delayed rev 3 and a late rev 2 echo: the page shows
  revs 1, 2, 4;
- a commit resolving below a newer listener doc is not shown;
- a real deletion shows the plan, and a recreated rev 1 shows again;
- Reset to plan is a newer write, not a deletion;
- a commit resolving after unsubscribe reaches nobody;
- sign-out or account switch mid-commit adopts nothing;
- another account's open subscription never gets this user's commit;
- a signed-out subscription follows the listener only;
- after a read failure, nothing more is shown.

Against 00bf5ff8's client, 8 of the 17 fail (the ordering, deletion and every
lifetime case). Against the revision, 17 of 17 pass.

### Checks for the revision

- tsc: clean.
- Lint: 0 errors. There are 12 warnings, all pre-existing and none in touched files.
- Focused: `tonight-client.test.ts` 17/17. The tonight hook tests passed in the full
  run.
- Full unit run: 4910 passed, 9 failed, 55 skipped, across 417 files (12 files
  failed).
  - None of the failing files touches this change or imports the tonight client.
  - Rerun alone, 10 of the 12 files passed. The other 2 (`text-score-viewer`,
    `SetlistGridHydrator`) each failed a different test that time, then both passed
    (33/33) on a second rerun.
  - So these are load or order flakes, most likely the Dexie
    "DatabaseClosedError" seen in the reruns, and not regressions. The same suite
    had 0 failures at 00bf5ff8.
- Build: exit 0, with `SKIP_ENV_VALIDATION=1`. The regenerated
  `src/build-info.json` was restored and is not committed.
- Rules: unchanged, so the emulator tests were not rerun.
- No browser check yet. It needs the deploy, which is held for review. After an
  accepted review: deploy code only, then run `tonight-swap-ipad.spec.ts` on
  production, including the first reset pass.

## C2-RELEASE-VERIFY revision 1: gate, release, production e2e

### Full-suite gate: green

This was a single serial run, not a retry: `npx vitest run --maxWorkers=1
--no-file-parallelism` at `264761fe`.

- Files: 414 passed and 3 skipped, of 417.
- Tests: 4943 passed, 31 skipped, 0 failed.
- Time: 1837 s, exit 0.

The 9 parallel-run failures did not reproduce serially, which fits the load
hypothesis. The log is kept locally in the session scratchpad and is not
committed.

### Release: code only

- Before the push, `origin/master` was `6384d6b2`. `HEAD` had only the reviewed
  `00bf5ff8` and `264761fe` on top of it.
- Pushed `6384d6b2..264761fe` to master. GitHub printed "2 of 2 required status
  checks are expected" and accepted the push; nothing was rejected or bypassed.
- Production `/api/version` at 20:08 CDT: sha `264761fe8a9e…`, version 11.7.0.
- No Firestore rules deploy.

### Production e2e: `tonight-swap-ipad.spec.ts`

All runs used ipad-webkit, simulated iPads in Playwright, not hardware.

This commit adds test-only timing logs to the spec for swap, undo and reset. There
are two runs; I stopped there rather than retry until green.

| Step | Run 10 | Run 11 |
|---|---|---|
| Musician has no Swap control | pass | pass |
| Leader swap: musician follows | **fail**: server rev 1 had the swap, musician still showed the plan at 5 s | pass, 167 ms |
| Leader's own row after the swap | showed the swap by the probe, although its Firestore logged "client is offline" | pass, 33 ms after the musician |
| Saved plan byte-identical | not reached | pass |
| Signed-out iPad after reload | not reached | pass |
| Setlist page "Tonight: X (planned: Y)" | not reached | pass |
| Undo: leader / musician | not reached | pass, 467 ms / 481 ms |
| Second swap: musician follows | not reached | **fail**: the leader showed it (so the commit was accepted), musician still showed the plan at 5 s |
| Reset to plan | not reached | not reached |

**Reading.**

- The leader-row fix works in the browser on production. In both runs the
  committing leader showed its own swap at once, including when that page's
  Firestore connection was offline.
- The failures are on the musician, the iPad that does not commit.
  - In both runs, its listener stayed open (no "overrides unavailable" error) but
    did not deliver an accepted write within 5 s.
  - Run 9 showed the same thing on the pre-release code (`b047151b`). So this
    release did not introduce it, and this release does not address it.
  - The musician's subscription path in `264761fe` shows any rev above the one
    shown, so its logic cannot drop rev 3 after rev 2. The failing step came
    right after a delivered rev 2.
- Whether real iPads stall like this is unknown. It is either Playwright-WebKit
  Firestore behavior on this Windows host or a real listener stall. Only hardware
  can separate them.

**Cleanup.** Both runs revoked their minted accounts in `afterAll` with no errors.
As before, `revoke_test_account` leaves the deleted test setlists' `overrides` and
`performedDeviations` docs orphaned. I added no broader delete.

### Still owed

- **Reset to plan on production**: still not reached in any run.
- **Non-committing iPad latency.** Two of three post-release swaps reached the
  musician within 5 s (runs 10 and 11); one did not. Needs a real-iPad check or a
  decision on a diagnostic run. For example, measure how long the musician takes
  rather than failing at 5 s, reported separately and not as a relaxed pass.
- **Real two-iPad hardware acceptance.**

## C2 musician propagation diagnostic and independent reset (run 12)

Production 264761fe (11.7.0), ipad-webkit on Windows, simulated browser iPads,
not hardware. One bounded run, 20:34–20:36 CDT, no retry. There was no product
code change, no rules change and no deploy.

### Tally, reconciled (post-release, the musician iPad that did not commit)

The earlier line "two of three post-release swaps" was wrong: it counted the undo
as a swap. The corrected counts:

| Kind | Run 10 | Run 11 | Run 12 | Within 5 s |
|---|---|---|---|---|
| Swap | fail | swap 1 pass (167 ms), swap 2 fail | swap 1 fail (30.4 s), swap 2 fail (30.3 s) | 1 of 5 |
| Undo | not reached | pass (481 ms) | fail (30.3 s) | 1 of 2 |
| Reset | not reached | not reached | pass (UI 293 ms, measured 397 ms) | 1 of 1 |

The run 12 delays are measured, and each is recorded as a failure. The leader
(the iPad that committed) showed every step within 0.3 s: swap 1 at 294 ms, undo
at 227 ms, swap 2 at 217 ms and reset at 231 ms.

In run 12, Playwright reported the leader at about 30.6 s for both swaps. That is
a measurement artifact: the spec timed the second iPad only after the first iPad's
wait ended. The in-page trace has the correct values. The spec now times both
iPads concurrently. That change is test-only and has not been re-run.

Run 12 ran the two tests in parallel (two workers, `fullyParallel`), so four
signed-in iPads were open at once. Earlier runs had one test and two iPads.

### What the trace shows

Instrumentation was test-only:
- `e2e/helpers/listen-trace.ts`, injected with `addInitScript`;
- it summarizes the Firestore fetch/XHR traffic and polls the row DOM every 50 ms;
- it records no URLs, headers or raw bodies, and a secret scan of the saved traces
  was clean.

The traces are in the local scratchpad (`run12-traces/`).

For every musician step, the timeline was as follows:

1. **The server accepted the write.** The leader's commit returned 200 in
   100–180 ms, and a server probe showed the new rev.
2. **The data reached the musician's listen stream on time.** The overrides doc
   with the new rev arrived 0.1–0.3 s after the commit: swap 1 at rev 1, undo at
   rev 2, swap 2 at rev 3.
3. **The Firestore SDK did not raise a snapshot for that doc until the next
   global consistency marker arrived.** That marker is a `targetChange` with no
   type or targetIds and a readTime, and it arrived about 30 s later together with
   the stream's `noop` heartbeat.
4. **The musician's row changed 40–70 ms after that marker, every time.** The UI
   never ignored a snapshot that had arrived.

Pass and fail follow the marker exactly:
- When a marker followed the doc promptly, delivery was quick. In the reset step
  the doc and marker came in one 835-byte read, and the UI changed 40 ms later.
- When no marker followed, the doc waited for the ~30 s heartbeat.

The leader's own listener shows the same thing: at 8.55 s it got a marker and
then the doc, and the next marker came at 38.55 s. That is the original ~30 s
leader-row lag, which 00bf5ff8 now hides by adopting the leader's own commit.

The session stayed healthy throughout:
- auth: the test user was present on both iPads the whole time;
- `navigator.onLine` was true, with no offline, online or visibility events;
- there were no listen-stream errors, aborts or target `cause`s;
- the listen stream rotated normally at about 70 s with nothing lost;
- the idle Write stream aborted at about 61 s on both iPads, after the steps, and
  does not bear on this.

`fromCache` and `hasPendingWrites` cannot be observed without product code. The
evidence above fits the SDK holding the doc in its watch aggregator, without
raising any snapshot, until a consistent point.

### Classification

The classification is "snapshot arrived late", at the level of SDK events. The
write was accepted, and the UI did not ignore anything.

The trace alone cannot tell apart two ways the ~30 s marker delay could arise:
- **H1.** The backend sends the consistency marker late, only at its heartbeat.
- **H2.** WebKit's fetch-stream reader receives the trailing small frame (the
  126-byte marker) late, until more bytes such as the next noop push it through.
  The "one frame behind" pattern fits this: a marker appears just ahead of each
  doc, and the doc's own marker waits. The app uses the default streaming
  transport; `firebase.ts` notes that long polling used to be enabled.

H2 would matter for real iPads, which also run WebKit.

### Recommendation

The evidence does not yet identify a concrete fix. The next check should settle
H1 against H2, still with no product change:
- run the same traced spec once on a Chromium project (not WebKit) against
  production;
- and/or run a real two-iPad check.

Expected outcomes:
- If the Chromium musician gets markers promptly, the problem is on the WebKit
  transport side. The candidate fix is then a transport setting (auto-detected or
  forced long polling), made as a reviewed product packet.
- If Chromium also waits ~30 s, the delay is on the backend or listen-stream side.
  That calls for a product decision, not a speculative fallback.

### Other results in run 12

- **Independent reset test.** It set up its own override (the server held rev 1
  with the test chart) and waited for both iPads to show it. The musician waited
  29.2 s for that setup, which was not scored. After Reset:
  - the leader showed the plan in 392 ms and the musician in 397 ms, both passing;
  - the server override was cleared at rev 2, and the Reset control disappeared;
  - the saved plan was byte-identical.
- **In the propagation test:**
  - the saved plan was unchanged;
  - the signed-out reload showed the swap;
  - the setlist note passed;
  - the musician had no Swap control.
- **Cleanup.** Each worker's afterAll revoked its own minted accounts and logged
  no errors. The known orphaned overrides/deviations docs remain, and I added no
  broader delete.

## C2 transport comparison: Chromium (run 13)

One run, 00:53–00:54 CDT on 2026-09-23. Production `/api/version` was `264761fe`. The
only code change is test-only: the spec now also runs on the `chromium` project, and
trace filenames include the project name. No product, transport, rules or deploy
change, and no retry.

### Run settings, compared with run 12

| | Run 12 | Run 13 |
|---|---|---|
| Project | `ipad-webkit` (Playwright WebKit, Windows) | `chromium` (Desktop Chrome device, 820×1180, touch, isMobile) |
| Workers | 2 (both tests at once, 4 contexts open) | 1 (`--workers=1`; tests in order, 2 contexts at a time) |
| Timing of the two views | one after the other (leader numbers were an artifact) | at the same time |

Unchanged from run 12: the 5 s pass threshold, the 30 s late window, the
assertions and the trace.

### Result: 2 passed, every delivery within 5 s

| Step | Musician | Leader |
|---|---|---|
| swap1 | 872 ms | 872 ms |
| undo | 1888 ms | 1888 ms |
| swap2 | 367 ms | 367 ms |
| reset | 364 ms | 364 ms |

- These are Playwright's measurements. It polls, and each step's clock starts at the
  click, so the in-page numbers are smaller. For example, on undo the musician's
  DOM changed about 1.09 s after the click.
- The server confirmed each write: revs 1, 2, 3 and 4, each commit returning 200 in
  130–300 ms.
- Sign-in and online state stayed healthy, with no listen errors or causes.

### Doc frame, marker and DOM (from the saved in-page traces)

| | Doc frame to marker | Marker to DOM |
|---|---|---|
| Run 12 WebKit musician | 30.0 s on 4 of 5 frames. The exception was the reset (0 ms, same frame). | 29–72 ms |
| Run 13 Chromium musician | 0–1 ms on 4 of 4 frames | 38–54 ms |
| Run 12 WebKit leader | 30.0 s on 2 of 5 frames. The leader's own-commit adoption hid these. | n/a |
| Run 13 Chromium leader | 0 ms on 4 of 4 frames | n/a |

- **Doc frame to marker** is the gap between the overrides doc frame reaching the
  stream and the global consistency marker arriving.
- **Marker to DOM** is the gap between that marker and the row's DOM changing.

On Chromium, the doc and its marker reached the page in the same stream read. In the
WebKit run, the doc arrived about 0.3 s after the commit, but the marker arrived only
when the next frame (the ~30 s noop) pushed it through. On both browsers the SDK and
the UI changed the row about 50 ms after the marker, so the UI never ignored an
update that had arrived.

This supports H2: the Playwright WebKit build's fetch stream holds back the trailing
small frame until more data arrives. It does not support H1, a backend that sends
the marker late: on Chromium, the same backend's marker arrived with the doc every
time.

Limits:
- This is one run on each side, and the settings differed (workers, context count).
- Playwright's WebKit on Windows is not Safari on iPadOS. Its networking stack is
  different, so nothing here shows whether real iPads hold back the frame.

### Reset and saved plan

- **The reset test did not create its own override this time.** It ran on the same
  worker, after the propagation test, with the same `beforeAll` setlist. Its setup
  found the server already holding the test-owned override left by swap2 (rev 3, the
  test chart). That is the spec's "unless this setlist already has one" branch. It
  then checked that both views showed the override (4 ms and 3 ms) before Reset.
- **After Reset:** both views showed the plan in 364 ms, which passes. The server
  cleared the override at rev 4, the Reset control disappeared, and the saved plan
  was byte-identical.
- **Propagation test:**
  - the saved plan was unchanged before and after;
  - the signed-out reload showed the swap;
  - the setlist note passed;
  - the musician had no Swap control.

### Other observations

- **Musician console warning.** Chromium logged "[alert-store] globalAlert
  subscription failed: Missing or insufficient permissions" twice. Run 12's WebKit
  log didn't show it. It doesn't affect the tonight rows, and I didn't investigate.
- **Cleanup.** `afterAll` revoked the minted accounts and logged no errors. No
  broader delete.
- **Tool rejections:** none.

### Bounded implementation proposal (not implemented)

If root accepts H2 as the working cause, the smallest product change is one
Firestore transport setting, `experimentalForceLongPolling: true`.
- It goes in the `initializeFirestore` settings in `src/lib/firebase.ts`, in both
  the persistent and memory-cache branches.
- It could be limited to WebKit user agents so Chromium keeps streaming.
- The code comments call the current transport "WebChannel". A code comment
  mentioned earlier says the app once used long polling.

Acceptance for that change:
- Run this traced spec on `ipad-webkit` with one worker. Every doc frame's marker
  should arrive within 1 s, with all deliveries under 5 s on both views.
- Run the spec on `chromium` with no regression.
- The leader's own-commit adoption must still hold.
- Real two-iPad hardware remains the arbiter for Safari.

Cost and risk to review:
- Long polling means more HTTP round trips and battery use on the iPads.
- The login-bundle and import-graph tests read Firestore chunk signatures, so they
  need a check.

The alternative is a real-iPad check before any change. If real Safari delivers
promptly, the WebKit-on-Windows delay is harness-only, and the fix should go in the
harness, not the product.
