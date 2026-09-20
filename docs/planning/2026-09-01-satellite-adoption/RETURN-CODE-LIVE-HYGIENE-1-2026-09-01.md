# RETURN → `live-cw`: `L1` wave 1 — the instruments, repaired

Lane: **live (Code)**, host-side · Order: `HANDOFF-CODE-LIVE-HYGIENE-1-2026-09-01.md`
Authority: **R-0901-live-cw-1 §3 · §4** · R-0901-vision-8 §1 · R-0831-guards-2 · R-0901-corpus-4
Status: **W1 SHIPPED (in two commits — the second corrects a defect the first introduced) ·
W2 SHIPPED (with one guard flagged) · W3 DIAGNOSED then FIXED in wave 1b (see ADDENDUM) · W4 NOT EXECUTED — its premise is
inverted.**
Verified-against `ba119f1415`: **CONFIRMED host-side at open** (`git log --oneline -1`, branch
`master`, shallow clone). Shipped at **`7d5b5c3e2a`**, **`52b5b4f235`** and — after Daniel ruled
the W3 question in-lane — **`ca7fca91ce`**. All three live and verified on the deployed surface.

**Instrument, stated once so every number inherits it.** Live figures are
`[measured: live centralreform.live MCP over HTTPS from the host, 2026-09-01T22:0x–23:2xZ]`,
read through the CRC bearer and — for the tenant question — the Brothers Lazaroff bearer.
Local figures are `[measured: host]`. Where a number is a simulation it says so and states what
validates it.

**No ruling ids were spent (rule 1).** Two things here were ruling-shaped. **W4's reversal is
still returned, not decided.** **W3's fix Daniel ruled on directly in this lane** and it is now
shipped — see the ADDENDUM — but that decision still carries no ruling id and wants one at the
next `live-cw` sitting.

---

## Two things to read first

**1. The hygiene tools scanned another tenant's library, and the dedupe plan was largely Brothers
Lazaroff rows.** That is W3's cause — not a counting curiosity but a cross-tenant write exposure.
Diagnosed in wave 1 (§W3); **fixed in wave 1b after Daniel ruled** (ADDENDUM). Brothers Lazaroff
fileIds visible in the CRC plan: **14 → 0**.

**2. W4's premise is inverted.** The eleven `.doc`/`.docx` rows are genuine PDFs. Correcting the
mime as ordered would have broken eleven live charts. Nothing was written. §W4.

---

## W1 — the dedupe normalizer strips the file extension  ✅ SHIPPED

**The change.** `dedupeNormalize` strips the trailing media extension before the punctuation pass.
**Order of operations matters and is documented at the call site:** the strip runs AFTER separator
collapse and BEFORE `[^\p{L}\p{N} ]`, which would otherwise delete the `.` the regex anchors on.

### The correction, and how it was caught

The first cut reused the shared, parity-tested `STRIPPABLE_EXTENSION_RE` — the constant
`recompute-index-name-fields.ts` and `library-upload.ts` already apply to the persisted
`normalizedName` / `stem`. Reuse over a second private list was the right instinct and **it was
wrong here**, because that set contains `mp3`/`m4a`/`wav`.

**I did not catch this in review. I caught it by reading the live `dryRun` the order told me to
re-run** — the plan came back keeping `Adon Olam.mp3` as canonical over two real `Adon Olam`
charts. Measured on the deployed plan at `7d5b5c3e2a`:

- **5 groups mixed a recording with a chart.**
- In **3** of them the canonical picker kept the **recording**, so a `force: true` would have
  marked **4 real chart rows `duplicate` behind an audio file**:
  `Adon Olam.mp3` over two `Adon Olam` charts · `Mizmor Shiru L'adonai .mp3` over
  `Mizmor Shiru Ladonai.pdf` · `Sim Shalom.mp3` over `Sim_shalom.pdf`.

The shared set is correct for the job it was built for — **stem identity**, where `Adon Olam.mp3`
and `Adon Olam.pdf` *are* the same song. Dedupe asks a different question — **is this the same
artifact?** — and a recording is not a duplicate of a lead sheet. `52b5b4f235` therefore gives
dedupe its own `DEDUPE_STRIPPABLE_EXTENSION_RE` = the shared set **minus the audio tokens**, with
a test pinning that exact relationship so a token added upstream cannot quietly change what dedupe
treats as packaging.

The canonical picker's own contract already said this from the other side: it demotes only
Google-Apps mimes, and its comment states that when a non-chart artifact reaches it, *"the
upstream skip is the bug to fix, not the picker tiebreak."* This is that upstream fix.

### The `dryRun` plan the order asked for

| pass | groups | `wouldMark` | audio+chart mixed | eligible | universe |
|---|---|---|---|---|---|
| shipped at `ba119f1415` (no strip) | **8** | **8** | 0 | 908 | 943 |
| `7d5b5c3e2a` — W1+W2, shared set | 95 | 99 | **5 (3 dangerous)** | 928 | 943 |
| **`52b5b4f235` — W1 corrected + W2** | **91** | **92** | **0** | **928** | **943** |

**Under the 113-row union — no over-grouping, so no stop condition fires.**

The eligible set is 928 rather than 908 because W2 put the 20 archived rows into scope; the two
waves compound, which is why the final number is not the 79/81 the W1-only simulation predicted.
Both the 95/99 and the 91/92 figures were predicted locally **before** deploy and then confirmed
against the live tool to the row.

The simulation is trustworthy because it **reproduces the live tool exactly on the unchanged
normalizer**: 943 total, 908 eligible, 8 groups, 8 losers, `filteredOut {duplicate: 15,
archived: 20}` — every field identical to what `dedupe_library` returned live at `ba119f1415`.

### The fail branch is SHOWN, not promised (R-0831-guards-2)

`src/lib/mcp/__tests__/dedupe-normalize-extension.test.ts` carries a **verbatim copy of the
pre-wave normalizer** and asserts, for each real live pair, that it does NOT group under the old
one and DOES under the shipped one. The pairs are read off the live catalog, not invented — the
census §B list plus one it did not name:

| bare row | `.pdf` row |
|---|---|
| `Achot ketana` | `Achot ketana.pdf` |
| `Dodi Li` | `Dodi Li.pdf` |
| `V'Shamru` | `V'Shamru.pdf` |
| `V'Shamru (Old Skool)` | `V'Shamru (Old Skool).pdf` — not in §B |

All four appear as groups in the live post-deploy plan. **Mutation-proved twice** (before and
after the audio correction): deleting the one added line turns **8 tests red**, and the survivors
are exactly the legacy-side and narrowness assertions that should survive. The four audio/chart
pairs are pinned as *must-not-group*.

**`.txt` / `.doc` / `.docx` are still not stripped.** Widening is entangled with W4 — eleven live
rows carry a `.doc`/`.docx` name over genuinely PDF bytes, so an extension there is a naming
defect, not packaging, and folding it in the dedupe key would paper over it. Pinned by test,
returned.

---

## W2 — `archived` leaves the browse and enters the hygiene scan  ✅ SHIPPED

Both sides moved, as ruled:

- `list_library`'s default browse now hides `archived` alongside `duplicate` / `orphaned`.
- `dedupe_library` no longer filters `archived` out of its scan.
- `reconcile_library` no longer filters `archived` out of its scan.
- `includeNonChartHealthy: true` still reaches everything and **now surfaces `archived` too**, so
  nothing became unreachable by any tool. The arg docstring and four MCP tool descriptions were
  updated — including `archive_nonchart_artifacts`, whose description asserted that archived rows
  "vanish from `reconcile_library` scans". True this morning, false now; leaving it would have
  been a lie in the surface agents read.

### The guard that is NOT in the order, and why it exists

Putting archived rows into **reconcile's** scan created a status transition nobody ruled on.

Archived rows are non-chart soft-deletes with **no chart bytes by construction**. So the moment
reconcile scanned them, every one probed dead — and a `force: true` run would have flipped
`archived → orphaned` on all of them. **Nothing in the toolset flips `orphaned` back**; this
file's own comment says unmarking it "requires explicit operator action (manual re-upload)". That
would have destroyed a deliberate, reversible classification on rows Daniel archived on purpose,
on the first force-run after this deploy.

The order asked for archived to **enter the scan**, and it has: those rows are counted, probed and
**reported** in the orphan bucket. It did not ask for a new status transition, and `live` does not
mint one. So `commitOrphanBatch` holds archived rows and returns `heldArchived` — visible, not
silent. **This is judgment beyond the order's text; it is conservative, reversible, and it wants
ratification.**

Found by the emulator, not by reasoning — the pre-existing skip test went red on `orphan.count`.

---

## W3 — DIAGNOSED, NOT FIXED (as ordered). The cause is tenant scope.

**`list_library` filters by tenant. The three hygiene tools do not.**

```
src/lib/mcp/tools/library.ts   .filter((d) => rowOrg(d.data().orgId) === org)   // v11-02-02
```

`dedupe_library`, `backfill_library_index` (`library.ts`) and `reconcile_library`
(`reconcile-library.ts`) contain **zero** references to `rowOrg` or `orgId`. They call
`db.collection("library_index").get()` and take the whole collection.

**Measured, and it closes exactly:**

| surface | `coverage.total` |
|---|---|
| `list_library` via the **CRC** bearer | **891** |
| `list_library` via the **Brothers Lazaroff** bearer | **52** |
| | **891 + 52 = 943** |
| `dedupe_library` / `reconcile_library` / `backfill_library_index` | **943** |

The 52-row gap the census could not explain is the Brothers Lazaroff tenant, to the row.

### This is a write exposure, not a reporting gap — and it is already in the live plan

I intersected the live `dryRun` groups against that tenant's **complete** 52-row id set
(exhaustive, not sampled). At `ba119f1415`, with only 8 groups in the plan:

- **7 of 8 groups were entirely Brothers Lazaroff rows** — `Talk Til' Yer Blue`,
  `You're My Heaven (Tonight)`, `Time's Quickly Fleeting`, `Pink Supermoon`, `Breathe With You`,
  `We Still Stand`, `Everything Stopped`.
- **14 of the 16 fileIds** in a CRC admin's dedupe plan belonged to the other tenant.
- Only `Adon Olam` was CRC's.

So `dedupe_library({force: true})` from the CRC surface — a normal, F-05-sanctioned operation —
would write `status: "duplicate"` onto **7 Brothers Lazaroff charts**. Those pairs are
*legitimate*: each is a lead-sheet PDF beside its lyric-chart `text/plain`, which that band
presumably wants both of. `reconcile_library` has the same unscoped reach over its own write path.
All seven groups are still present in the post-W1 plan.

**Uploader uid is not a tenant discriminator here** — every BrosLaz row and the CRC `Adon Olam`
row share `uploadedBy: HTks9a8YRiVCQ5lVipUJcBsWjnB3`. That is why this was settled against the
tenant's enumerated id set rather than inferred from metadata.

**Not fixed, per the order, and the order was right to say stop anyway.** Scoping the hygiene
tools by `rowOrg` is a one-line-per-tool change, but it decides which rows leave whose reach and
whether an admin is ever meant to sweep across tenants. That is a ruling.

**It does not move Daniel's catalog either way** — his browse is already org-filtered, so scoping
the hygiene tools takes another tenant's rows out of *his tools'* reach, not out of his library.
That is why this did not trip the order's "rows would enter or leave Daniel's catalog" stop
condition, and why W1/W2 could ship over it.

**But it hard-gates wave 2.** W1 raises the plan from 8 rows to 92. Under the corrected normalizer
there are **0 cross-tenant groups** (7 BrosLaz-only, the rest CRC-only), so the blast radius is
the 7 pre-existing BrosLaz groups rather than anything W1 introduced — but "0 today" is a fact
about current names, not a guard.

---

## W4 — NOT EXECUTED. The premise is inverted, and executing it would have broken 11 live charts.

The order says the 11 rows carry `mimeType: application/pdf` with `.doc`/`.docx` names, that the
stored mime is wrong, and to correct it.

**The first half is exactly right. I confirmed all 11 independently** (the census's §E listed none
of them by id, and a `.docx` search surfaced a 12th row the census did not count —
`L'chai olamim English English.docx`, a Drive-id row outside `uploads`, therefore outside the
order's scope and left alone). The 11 in `uploads` are precisely as described.

**The second half is backwards. I read the bytes** — all eleven, no sampling:

```
%PDF-  application/pdf  65197  All Along The Watchtower.docx   Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  57867  Friend Of The Devil.doc         Producer=Skia/PDF m151 Google Docs Renderer
%PDF-  application/pdf  51299  If I Needed You.doc             Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  35969  It Takes A Lot To Laugh.docx    Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  54867  Never Can Tell.doc              Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  48523  Queen Jane Approximately.docx   Producer=Skia/PDF m151 Google Docs Renderer
%PDF-  application/pdf  38179  She Belongs To Me.docx          Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  58375  Tangled Up In Blue.docx         Producer=Skia/PDF m152 Google Docs Renderer
%PDF-  application/pdf  94231  The Weight (lyrics).docx        Producer=Skia/PDF m151 Google Docs Renderer
%PDF-  application/pdf  44377  Three Little Birds.docx         Producer=Skia/PDF m151 Google Docs Renderer
%PDF-  application/pdf  50807  You Ain't Goin' Nowhere.doc     Producer=Skia/PDF m152 Google Docs Renderer
```

One carries its own provenance in its PDF metadata:
`/Title (It Takes A Lot To Laugh.docx) /Producer (Skia/PDF m152 Google Docs Renderer)`.

**These are Word lyric sheets opened in Google Docs and exported to PDF.** The export kept the
source document's filename as the title. The bytes are PDF, the stored `mimeType: application/pdf`
is **correct**, and the `.doc`/`.docx` in the *name* is the stale part.

Had I written a Word mime onto these rows: they would have been classed non-chart by mime as well
as by name; `inferChartExt(mimeType)` would have resolved their Storage path to
`library/<id>.docx` while the object sits at `library/<id>.pdf`, so `download_chart` and Perform
would 404; and eleven renderable charts would have gone dark.

**Both moves available to me are blocked**, which is why this is a return and not a decision:
correcting the mime is wrong on the evidence, and correcting the *name* — the move the evidence
supports — is forbidden by the order's own "do not rename".

**FOR COWORK (live-cw), the shape of the fix as I read it:** the mime needs nothing. If these rows
should stop hiding from the browse, the lever is the name (drop the trailing `.doc`/`.docx`,
packaging from a document that no longer exists) or `isNonChartArtifactShape`'s name-based
extension test. Either is reversible; neither is mine to choose. **Nothing was written to any of
the eleven.**

---

## Post-deploy — measured on the live surface at `52b5b4f235`

**Rosh Hashanah guard (R-0901-vision-8 §1), re-asserted AFTER the deploy:**
`list_books` → **`shirei-tshuvah` 184 pages, tier `feed`** ✅ — unchanged from the value observed
at lane-open and from the satellite-deploy return. `crc-friday` 48 · `crc-saturday` 102 ·
`shabbat-maariv` 69 · `shabbat-shacharit` 145, all unchanged.

**W2 on the live browse:** `list_library` total **762 → 742**, exactly the 20 archived rows, and
the browse's own `coverage.filteredOut.byStatus` now reports `archived: 20` beside
`duplicate: 12`. `coverage.total` still 891 — the tenant-scoped universe is unchanged, only the
hidden set moved.

**W1 + W2 on the live hygiene scan:** `dedupe_library({dryRun: true})` → `scanned: 928`,
`groupsFound: 91`, `wouldMark: 92`, `coverage.filteredOut.byStatus: {duplicate: 15}` — `archived`
no longer filtered, exactly as ordered. `committed: 0`, `dryRun: true`. **No writes.**

Each of these matched a prediction computed locally before the deploy.

---

## Guards

**`src/lib/books/**` was not touched.** Neither were chart bonds, setlists, `moments`, or any
other repo. The whole diff is 7 files under `src/lib/mcp/`.

**The build gate this repo has and was not running — RUN, and green on both commits:**

```
git log --oneline -1                              # ba119f1415 at open — confirmed
npx tsc --noEmit                                  # clean
SKIP_ENV_VALIDATION=1 npx next build --webpack    # exit 0
```

**Emulator suite: 78 files / 1071 tests green**, run on both commits. This is the suite that
caught the reconcile status-clobber.

### The unit suite is RED at `ba119f1415`, and it was red before I arrived

`npx vitest run` reports **15 failed / 3952 passed across 6 files**. **None are mine.** I verified
this the only way that settles it: I set my changes aside, restored the six files to clean
`ba119f1415`, re-ran them — **identical 15 failures** — then restored my work.

```
src/lib/books/__tests__/lookup.test.ts                     (2)
src/lib/books/__tests__/registry.test.ts                   (1)
src/lib/mcp/tools/__tests__/books.test.ts                  (3)
src/components/performance/__tests__/perform-cls.test.tsx  (2)
src/components/performance/__tests__/public-view.test.tsx  (4)
src/lib/__tests__/sync-engine-songs-mirror.test.ts         (3)
```

**FOR COWORK (live-cw): the books failures are worth a look before Sept 11.** They are folio and
`lookup_book_page` assertions — the surface the RH guard protects. The guard itself is green on
the live surface, so this reads as test-vs-data drift rather than a live defect, but a red suite
around the machzor path eleven days out should not go unnamed. I did not touch it: it is outside
this order and inside `src/lib/books/**`, which the order explicitly walls off.

**Housekeeping:** `src/build-info.json` was already modified in the working tree at lane-open (a
generated file, stale in git at `93e76c39e0`/`feat/mcp-residuals-and-dedupe`). It is not my scope
and is deliberately not in either commit; it is still uncommitted.

---

## Checklist

- [x] Verified-against sha confirmed host-side at open; family row opened under `live` with claims
- [x] W1 normalizer change + a fail-branch test taken from the return's §B pairs
- [x] W1 `dryRun` plan re-run; new group count in the return
- [x] W2 both filters moved; `includeNonChartHealthy` still reaches everything
- [x] W3 cause diagnosed and RETURNED; no behaviour change shipped for it
- [ ] **W4 eleven mimes corrected** — NOT DONE, deliberately. Premise inverted; see §W4.
- [x] Build gate green; deploy; **RH guard re-asserted after the deploy and quoted above**
- [x] `RETURN-CODE-LIVE-HYGIENE-1-*.md` at this root; `Lane: live (Code)` on both commits (rule 13)

## Stop conditions — how each landed

- *W3 cause implies rows enter/leave Daniel's catalog?* **No.** His browse is already org-scoped;
  the fix changes his tools' reach, not his library. Shipped over it, returned the ruling.
- *Dedupe plan exceeds the 113-row union?* **No — 92.** No over-grouping.
- *Anything wanting to touch `src/lib/books/**`?* **No.** (The red books tests are named, not
  touched.)
- *A ruling looks needed?* **Yes, twice — W3's scoping and W4's reversal. Both returned, neither
  decided, no ruling id spent.**

## Queue

**FOR COWORK (live-cw), in the order they gate things:**
1. **W3 scoping is a hard precondition on wave 2's `force: true` run.** Do not run it first.
2. **W4 wants a ruling** — the mime is right; the name is the lever, and renaming is currently
   forbidden by your own order.
3. **The W2 reconcile guard wants ratification** — archived rows scanned and reported, status not
   rewritten.
4. Whether to widen the dedupe extension set to `.txt`/`.doc`/`.docx` (worth ~3 more groups, and
   entangled with item 2). The audio tokens should stay out; that one is argued in code.
5. The 15 pre-existing unit failures, 3 of them on the machzor lookup path.

**FOR DANIEL — nothing to do, two things to know.** Nothing was written to any chart, setlist or
library row in this wave: the dedupe run itself is wave 2, and the one data task in this order
(W4) I stopped on rather than guess, because the eleven files turned out to be fine as they are.

The thing worth your attention is that your library-cleanup tools can currently see and write to
the Brothers Lazaroff catalog, and the cleanup they would propose today is mostly their charts,
not yours. That is now blocked behind a ruling rather than sitting one `force: true` away.

---

# ADDENDUM — `L1` wave 1b: W3 FIXED. Shipped `ca7fca91ce`.

**Daniel ruled the W3 question directly in this lane on 2026-09-01: scope the hygiene tools to
`rowOrg`.** Implemented, deployed and verified on the live surface.

**FOR THE LEDGER (rule 1): this is Daniel's decision and it carries NO ruling id.** `live` does
not mint one. It wants an id at the next `live-cw` sitting to be formally settled, and this
addendum is the record until then.

## It was four tools, not three

The census named `dedupe_library`, `reconcile_library` and `backfill_library_index`. Sweeping for
the defect rather than the list turned up a fourth: **`archive_nonchart_artifacts`** — zero
`orgId` handling, and it WRITES `status:'archived'` off a full-collection scan. Same defect class.
Fixing three of four would have left the exposure open on the one tool that soft-deletes rows.

| tool | what was scoped |
|---|---|
| `dedupe_library` | scan + `coverage.total` |
| `backfill_library_index` | scan + `coverage.total`, **and its internal self-call** |
| `reconcile_library` | scan + `coverage.total` |
| `archive_nonchart_artifacts` | scan **and** the explicit `fileIds` path |

Two of those deserve naming because they are the ones a list-driven fix would have missed:

- **The `fileIds` path bypasses the scan entirely.** Passing a cross-tenant id directly would have
  archived another tenant's folder no matter how well the scan was filtered. It is now refused
  into `notMatched`, exactly like the existing non-folder/sheet mime refusal.
- **`backfill_library_index` calls itself** to build the `force_required` `dryRunPlan`, and did not
  pass `org` — so a non-crc caller hitting that branch got a crc-scoped plan back in the envelope.
  Found by sweeping every caller for one that would silently default to crc.

Follows the house seam (`org: OrgId = DEFAULT_ORG_ID`, `rowOrg(row.orgId) === org`) that
`list_library` and `search_library` already use.

## Measured on the live surface after the deploy

| | before (`52b5b4f235`) | after (`ca7fca91ce`) | predicted |
|---|---|---|---|
| `dedupe_library` `coverage.total` | 943 | **891** | 891 |
| …`eligible` | 928 | **876** | 876 |
| …`groupsFound` | 91 | **84** | 84 |
| …`wouldMark` | 92 | **85** | 85 |
| **Brothers Lazaroff fileIds in the CRC plan** | **14** | **0** | 0 |
| `list_library` `coverage.total` | 891 | 891 | — |

**The four hygiene tools and the browse now agree at 891** — which is what cycle-3 DATA-002 built
that uniform `coverage` field for, and the disagreement the census flagged as "a defect in the
contract's own purpose" is closed.

**Nothing was orphaned.** Called through the Brothers Lazaroff bearer, `dedupe_library` returns
`coverage.total: 52`, `groupsFound: 7` — their seven pairs are still fully reachable, now by them
rather than from CRC. **84 + 7 = 91**, the exact plan the unscoped scan produced: a clean
partition, no rows lost from anyone's reach.

**RH guard re-asserted after this deploy too:** `list_books` → `shirei-tshuvah` **184 pages, tier
`feed`** ✅. Browse total 742, unchanged.

## The fail branch, shown

Five emulator tests seed two tenants with deliberately colliding names. **Neutralising the org
filters turns four of them red**; the fifth stays green on purpose — a row with no `orgId` must
still be treated as crc (`rowOrg`'s contract), so legacy Drive-scan rows do not fall out of
Daniel's own hygiene scan. That one is the guard against over-correcting.

## Not fixed, and named rather than left silent

`searchLibrary`'s `loadLibraryW02Map` computes `siblingsInCatalog` and stem counts across **all**
tenants — a cross-tenant read-side leak into the very confidence signal L3 will depend on. It is
read-only, and **measured at 0 cross-tenant stem collisions today**, so it has no present effect.
Out of this order's scope; returned rather than widened into. **FOR COWORK (live-cw):** worth
folding into L3's design, since §A of the census already argues that confidence is computed in the
wrong scope.

`cleanup_all_test_data`'s orphan sweep also scans the full collection, but it is gated on
owner-bonded test accounts — a different axis from tenancy. Left alone deliberately.

## Gates

`tsc` clean · emulator **78 files / 1076 tests green** (1071 + 5 new tenant tests) · unit suite
still **exactly the 15 pre-existing failures across the same 6 files**, no new breakage ·
`SKIP_ENV_VALIDATION=1 npx next build --webpack` **exit 0**.

## Queue, revised

**FOR COWORK (live-cw):**
1. ~~W3 scoping gates wave 2~~ — **DONE.** Wave 2's `force: true` run is no longer blocked by the
   cross-tenant exposure. It still wants a ruling id for the ledger.
2. **W4 still wants a ruling** — the mime is right; the name is the lever, and renaming is
   forbidden by the order as written.
3. **The W2 reconcile `heldArchived` guard still wants ratification.**
4. Whether to widen the dedupe extension set to `.txt`/`.doc`/`.docx` (~3 more groups; entangled
   with item 2). The audio tokens should stay out — argued in code.
5. The W-02 sibling-count cross-tenant leak, above — L3-relevant.
6. The 15 pre-existing unit failures, 3 on the machzor `lookup_book_page` path.

**The wave-2 dedupe run, when it comes, is now an 85-row plan over Daniel's own catalog** — no
other tenant's charts in it, and no recording standing in for a chart.

Claude records; Daniel decides.
