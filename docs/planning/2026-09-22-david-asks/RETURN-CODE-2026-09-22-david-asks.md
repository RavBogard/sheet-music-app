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

## Where this session stopped (resting point, 2026-09-22)

- **Item 2** (tenant scope): surveyed, not yet coded. Evidence so far: all 990
  `songs` docs carry `orgId` (927 crc, 63 brotherslazaroff), matching
  `library_index` exactly, so a plain `where('orgId','==',hostOrg)` is correct on
  current data. The leak is the unscoped client query plus `songs` read rule
  `isMember()`. David (uid `HTks9a8Y…`) is **admin with orgIds [crc,
  brotherslazaroff]**, as are almost all users — so rules alone cannot stop the
  leak; the client must scope to the HOST org. Writers that can create an
  unstamped songs doc: Drive-sync mirror (`sync-engine.ts buildSongsMirrorPayload`),
  archive/rename routes, `chart-heal.ts`. Pickers also show 101 `duplicate` rows
  (they filter only `archived`). Chips need `collection`, which songs docs lack —
  plan is to join from the host-scoped library listing by id.
- **Item 3** (duplicates): read Astra's `DUPLICATES-REVIEW-ASTRA.md`. Hash
  revalidation (read-only, `library_index.contentHash` sha256):
  L1 V'Shamru — same size, **different hashes → not a duplicate, move to POSSIBLE**;
  L2 Avinu Malkeinu — **identical hash**, eligible; L3 and L4 — different hashes →
  POSSIBLE. You're My Heaven pair identical, **hold stands**. By the handoff's tie
  rule (1 setlist each) L2's survivor is `upload-a73d8721…` (active, Storage bytes,
  has uploadedAt), not the report's Janowski pick. Still to do before any
  mutation: re-hash both L2 files from live bytes, dry-run `swap_chart` + 
  `mark_chart_status` (it writes its own `dedupeRuns` undo record and refuses bonded
  rows). **No mutation has been made.** P2's second id resolves to
  `1r2GLfKEj0PZSPn0XbPO9sXfmzhJfcRTu`.
- **Item 4**: design read (Perform path, live-director swap, reconcile), not coded.
- Test setlists `ZZ Chart Preview UAT — …` were created by the e2e runs under
  minted test accounts (revoked in afterAll); sweep with the ops test-data tools.
