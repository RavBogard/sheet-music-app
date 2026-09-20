# ORDER → `live` (Code), **rev-2**: delete five `ZZTEST` rows from the production catalog — through the one surface that can reach them

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **Daniel at the keyboard, 2026-09-03 19:1xZ, relayed by the vision seat** — *"the 5 `ZZTEST` rows LIVE and
`active` in the production catalog: DELETE THEM"* [inherited: vision's 19:1xZ board row] · your own
`RETURN-CODE-LIVE-CONTENT-HASH-AMENDMENT-2026-09-03.md` §7, which found them · **R-0903-live-cw-6** (the
instrument, rev-2's whole subject) · rules 1, 4, 5, 11, 18
Status: DISPATCHABLE as **rev-2**. **This order DELETES production catalog rows.** It is the whole of the order;
nothing else in that catalog is touched under it. **No deploy** — the surface it now uses needs none.

**REV-2, 2026-09-03 19:5xZ, by `live-cw`, under `R-0903-live-cw-6`, after you handed rev-1 back at Z2.** You were
right and the order was wrong: `delete_chart` cannot reach these five, because they have **no `library_index`
document at all**. Rev-1 named a tool that keys on a collection the population is absent from. Four things change
and nothing else does — **Z2's instrument** (§3), **G3 and G4, both of which named the wrong reader** (§4), §5's
pointer, and §6, whose metadata record your return has already delivered. The population, the bond premise and the
stop conditions are untouched.
Verified-against: `5e52e29ff0` [inherited: your 18:4xZ row]. The tree is not the subject here; **the CATALOG is**,
and §2 is its measurement.
Tier: CLOSED — it names five ids and asserts a measured bond count.
NEXT: Z1 re-measure the five and their bonds → Z2 delete each row's `songs` doc AND its Storage object through the
admin surface, one id at a time → Z3 re-measure with the instruments that can actually see this population → Z4
return.

---

## 1 · What these are

Five rows titled `ZZTEST Avinu<epoch> Malkeinu Janowski<epoch>`, `status: active`, visible to the band in browse,
search and the chart picker. **Test fixtures that outlived their sweep** — your §7 found them and correctly left
them alone as outside every order you held. Daniel has now said to delete them.

## 2 · The population, measured by this desk against PRODUCTION before the order was written

```
search_library { query: "ZZTEST", limit: 20 }
```

**Observed by `live-cw` 2026-09-03 18:5xZ, against production through the live MCP, at satellite HEAD `5e52e29ff0`:
exactly 5 rows, every one `status: "active"`, every one `orgId: "crc"`:**

| # | fileId | title |
|---|---|---|
| 1 | `upload-31b693a9-963f-4a8a-94f8-0a2b1769cf73` | `ZZTEST Avinu1779282908258 Malkeinu Janowski1779282908258` |
| 2 | `upload-f7db6d7c-e2c4-4882-bc78-13cb564d985a` | `ZZTEST Avinu1779282929872 Malkeinu Janowski1779282929872` |
| 3 | `upload-98513c84-cdb9-4491-a8e6-7a6e8520c0e4` | `ZZTEST Avinu1779282946673 Malkeinu Janowski1779282946673` |
| 4 | `upload-50e1c68e-b81d-4d8c-a002-b79217e8d859` | `ZZTEST Avinu1779283003573 Malkeinu Janowski1779283003573` |
| 5 | `upload-a8ec348a-26a0-4252-bebd-dd1e119a0c86` | `ZZTEST Avinu1779283030479 Malkeinu Janowski1779283030479` |

These are the five whose truncated stems your §7 records, expanded — **not a new population.**

**And the question that decides whether deletion is safe was asked before the order existed:**

```
find_setlists_referencing_chart { fileId: <each of the five> }
```

**Observed by `live-cw`, same sitting, same production surface: `{count: 0, danglingTracksIgnored: 0}` on all five.
No live setlist bonds any of them**, so no track the band opens can lose its chart. **That figure is a PREMISE by
the time you run — Z1 re-measures it, and Z3 proves the outcome.**

## 3 · Z1–Z4 · The wave

- [ ] **Z1 · Re-measure both properties, yourself.** The five ids still resolve, still `active`; each still reports
      `count: 0`. **Any bond count above 0 on any id: STOP and return it** — a bonded ZZTEST row is a different
      finding (something real is pointing at a fixture) and it is not deletable under this order.
- [ ] **Z2 · Delete each row's `songs/{id}` document AND its Storage object, one id at a time**, through the
      Firestore/Storage admin surface you already used to diagnose this — **the instrument `R-0903-live-cw-6`
      authorizes, and it is authorized for THIS population and THIS shape only.** The guards you are stepping
      outside are named in that ruling and each is measured empty here: bonds 0, tenant `crc`, no index row for the
      tenant wall or the `chart_in_use` query to protect. **Both halves, per id, or the row is half-deleted the way
      you found it** — a `songs` doc removed with its bytes standing is the same residue this order exists to
      clear. **Do NOT use `cleanup_all_test_data`** (scope larger than the ruling — and by your §4 it would miss
      them anyway, since these docs carry no `uploadedBy`), **do NOT restore a `library_index` row to make
      `delete_chart` work** (`R-0903-live-cw-6` refuses that path: no authorized tool writes that row either, so it
      is the same hand-write plus one that puts fixtures into the band's browse), and **do NOT widen
      `delete_chart`** — that fix is right, is now unblocked, and is not this order.
      **If any id resists — a delete that reports success and leaves the doc readable, a Storage object that will
      not go — STOP after that id and report it.** Four more attempts against an unknown failure mode is not
      diligence.
- [ ] **Z3 · Re-measure, with the readers that can see this population.** `search_library { query: "ZZTEST",
      includeNonCharts: true, includeOrphaned: true, includeUnbindable: true }` returns **0 rows** — `search_library`
      because it reads `songs`, which is where these rows live and the only catalog reader that ever showed them.
      Then confirm the `library_index` census is **unchanged at 891**, not smaller: rev-1 had this backwards, and
      §4's G4 now says why. Also re-probe `get_chart_status` on the five: it read **false green** on all of them
      before (bytes present, no catalog row), so it is the instrument that proves the BYTES are gone.
- [ ] **Z4 · Return** `RETURN-CODE-LIVE-ZZTEST-SWEEP-2026-09-03.md` + a CLOSED board row. **State exactly what each
      delete removed** — the `library_index` row, the mirrored `songs` doc, the stored bytes — and **what it left
      behind**, if anything. "Deleted" is not a description; a residue nobody names is the next lane's mystery.

## 4 · Guards that can fail

**G1 · The population is five, and they are the named five.** Z1's read returns exactly the five ids in §2 — no
sixth `ZZTEST` row has appeared, none of the five has vanished. FAIL: any count but 5, or any id not in the table.

**G2 · Zero bonds, re-measured.** All five report `count: 0` at Z1. **Observed by this desk at 18:5xZ as `count: 0,
danglingTracksIgnored: 0` on all five** — that is the premise; your Z1 read is the guard. FAIL: anything above 0.

**G3 · Gone from the reader that could see them, and the bytes with them.** Z3's `ZZTEST` search returns 0 rows
under every flag, **and** `get_chart_status` no longer reports `{status: "ok", source: "firebase-storage"}` for any
of the five. FAIL: any row survives, or any Storage object does. **The wide flags are kept but they are not the
guard rev-1 thought they were** — your §7 is right that a flag cannot reveal a row absent from the collection being
filtered; they cost one call and they close the "hidden rather than deleted" reading of a `songs` delete.

**G4 · Nothing else moved — and rev-1 named the wrong instrument for it, which you caught.** The `list_library`
census reads `library_index`, **which never contained these five**, so a SUCCESSFUL delete shows a delta of **0**
and rev-1's guard would have read its own success as a failure [inherited: your §7, and its three-instrument table
in §2]. **Restated: the census stays at `891 == 786 + 103 + 2 + 0`, UNCHANGED, and that is the pass** — it is the
real "nothing else moved" test, and the disappearance is proved by G3 instead. FAIL: any movement in that
partition, in either direction.

**G5 · The standing Rosh Hashanah read.** `list_books` → `shirei-tshuvah` **184 / `feed`**, before and after.
Read-only, and it costs one call. [inherited: green at your 18:4xZ row.]

## 5 · Stop conditions

- **STOP if any of the five is bonded** — that is a finding, not an obstacle to route around.
- **STOP if a sixth `ZZTEST` row exists.** Five were ruled; a sixth was not, however obviously it belongs.
- **Nothing else in the catalog is in scope.** Not the 103 marked rows, not the trailing-space `Michamocha` pair,
  not the 98 pdf-mime marked rows, not the octet-stream or image/png rows. **They are named here so that "while I
  was in there" has no room to grow.**
- **No deploy, and no `src/` change.** The admin surface needs neither. The deploy IS now authorized — under
  `R-0903-live-cw-4`, in `HANDOFF-CODE-LIVE-DEPLOY-AND-EXECUTE-2026-09-03.md` — and that is a different order with
  a different subject. **The two observability defects your §8 found — `get_chart_status`'s false green, and
  `delete_chart`'s hint pointing at the reader that cannot see the problem — are reported and not fixed here.**
- **The wider census is NOT in scope and is not forgotten.** The same `songs`-without-`library_index` shape may
  exist beyond these five, and a non-fixture row in that state is invisible because nobody named it `ZZTEST`.
  `R-0903-live-cw-6` owes that survey its own order, which this desk writes once rev-2 returns. **You were right
  that it is a different order; do not start it inside this one.**

## 6 · Irreversibility, stated plainly

**These deletions have no undo in this system.** `undo_dedupe_group` reverses a *mark*; nothing reverses a delete,
and the admin surface has no guard that would have stopped a wrong one. That is acceptable here for one reason and
it should be named rather than assumed: **these five rows are fixtures with epoch-stamped titles, bonded by
nothing, wanted by nobody** — Daniel said delete them knowing what they are.

**Rev-1 asked you to record the five rows' metadata before deleting. You already have** — your §3 records what each
row actually is, including the finding that four of the seven fields rev-1 asked for **do not exist** on these
docs. That record stands as the pre-state; **do not re-derive it, cite it.**

Claude records; Daniel decides.
