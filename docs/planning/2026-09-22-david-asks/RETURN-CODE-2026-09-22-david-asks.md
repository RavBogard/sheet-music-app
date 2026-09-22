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

## Item 4: temporary swap (in progress)

Not yet deployed; recorded here when it ships.
