# ORDER → Code: stop deriving `pages` from the last unit, then pin

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE** · Supersedes P1 of `HANDOFF-CODE-LIVE-PIN-AND-DISPLAY-2026-09-02.md`,
whose premise your stop correctly refused. P2 of that order stands as shipped.
Tier: CLOSED — edits `scripts/**`, deploys. **No data write; no `src/data/books/*.json` edit.**
Verified-against: `86865948a4` [inherited: your own CLOSED row, 2026-09-02 02:3xZ].
**Confirm host-side at open.**

Authority: **R-0902-live-cw-2 §1 · §3 · §4** · R-0831-live-pagemap-1 · rule 5 · rule 6 ·
R-0831-guards-2 · field note 12

NEXT: make `sync-books.mjs` assert `pages` instead of overwriting it (V1), then pin the feed source
with a failing gitSha guard (V2), then deploy and re-assert the Rosh Hashanah guard.

---

## Your stop was right, and here is what the printed book said

Daniel supplied `Shirei Tshuvah 1.0 printed.pdf`. This desk **observed**, reading it against
`dist-app/shirei-tshuvah-feed.json` at HEAD `86865948a4` on 2026-09-02T02:4xZ: four unnumbered
front-matter pages, then printed 1–184. PDF p6 = printed **2** = Candle Lighting + Shehecheyanu,
the feed's folio 2. PDF p186 = printed **182** = Yaknehaz, the feed's last unit. PDF p187–188 =
colophon and closing title page, printed **183–184**, correctly not units.

**So your finding (b) inverts: `pages: 184` is correct.** It is the printed page count. It is not
derivable from `maxFolio`, because a book continues past its last prayer.

And it is every volume, not the machzor: this desk **observed** committed `pages` against
`dist-app/` maxFolio as **69/68**, **145/143**, **184/182** at the same sha and time.

**Also, correcting this desk's own premise, which is why V2 changed shape:** the `L2` findings doc
said the satellite's books match `dist-app/` and not `dist/`. **True only for the machzor.** This
desk **observed** `dist/` yielding maxFolio **69** and **145** for the two Shabbat volumes —
exactly their committed values — so those snapshots came from the **unpinned** build and agree with
the printed count by accident of that build's pagination. You compared produced files; this desk
compared summary figures. Yours was the right instrument.

## V1 — `sync-books.mjs` asserts `pages`; it does not compute it

`trim()` currently sets `pages = maxFolio`. Re-running the sync today would write **182** over
**184**, and the equivalent on both Shabbat volumes.

1. **Stop writing `pages` from `maxFolio`.** The recorded value in `src/data/books/<slug>.json` /
   `registry.json` is authoritative for now (R-0902-live-cw-2 §3).
2. **Assert instead of overwrite.** Minimum useful check: **`maxFolio <= pages`**, per volume,
   failing loudly. That is an identity, not an absolute (field note 12), and it stays true as books
   change. Fail if a volume has no recorded `pages` at all.
3. **Delete the "update `registry.json` by hand if any value changed" console line.** A reminder is
   not a guard; this replaces it.

**Show the fail branch (R-0831-guards-2).** Feed the assertion the machzor's `dist/` build, whose
maxFolio is **248** against a recorded 184, and prove it refuses. That is the exact regression this
guard exists to stop, and it is available on disk — no synthetic fixture needed.

**Do not touch the three recorded values.** R-0902-live-cw-2 §5: they are already correct.

## V2 — pin the source, now that a pin can reproduce

With `pages` no longer derived, the remaining fields must reproduce. Record a per-volume pin — the
`printing.gitSha` each committed snapshot is generated from — read `dist-app/`, and **fail on
mismatch**. A printed volume's pin is its press commit, never HEAD (R-0831-live-pagemap-1).

**Expect the two Shabbat volumes to need re-generation from the pinned feed, and STOP if they do.**
Their committed folios came from `dist/`; `dist-app/` gives maxFolio 68 and 143 against their
committed 69 and 145. Whether their *unit folios* also differ is not something this desk has
measured, and if they do, re-syncing them changes page numbers on a printed book nine days before
Rosh Hashanah. **Measure it, report it, change nothing.** That is a ruling, not a fix.

The machzor is the volume that must reproduce cleanly from `dist-app/` once `pages` is left alone.
If it does not, stop — that means the pin or the snapshot is wrong.

## Guards

**Rosh Hashanah (R-0901-vision-8 §1), asserted after the deploy and quoted in the return.**
`list_books` → `shirei-tshuvah` **184 pages, tier `feed`**. This desk **observed** that value at
HEAD `86865948a4`, 2026-09-02T02:4xZ. R-0902-live-cw-2 §2 records that this guard is the assertion
that catches the very regression V1 removes — it is doing work, so quote it, do not tick it.

**`src/data/books/*.json` and `registry.json` must be byte-identical after this wave.**

Checks the executor runs and records — **no observed value is supplied here, deliberately:**

```text
git log --oneline -1                              # confirm the Verified-against sha
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
git status --porcelain src/data/books/            # must be empty
```

## Checklist

- [ ] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] V1 `pages` asserted, never written; `maxFolio <= pages` per volume, failing
- [ ] V1 fail branch demonstrated against the machzor's `dist/` build (248 > 184)
- [ ] V1 the hand-update reminder line is gone
- [ ] V2 per-volume pin recorded; `dist-app/` read; mismatch fails
- [ ] V2 machzor reproduces from the pinned feed — or STOP and report
- [ ] V2 Shabbat volumes: report whether their unit folios differ. **Change nothing either way**
- [ ] `src/data/books/` clean; build gate green; deployed
- [ ] RH guard re-asserted after the deploy and quoted
- [ ] `RETURN-CODE-LIVE-PAGES-AND-PIN-*.md` at this root; `Lane: live (Code)` on every commit

## Stop conditions

Stop and return, do not decide, if: the machzor does not reproduce from the pinned feed once
`pages` is left alone; the Shabbat volumes' unit folios differ from their committed snapshots;
the assertion fails on the current tree; or a ruling looks needed. **`live` never spends a ruling
id (rule 1).**

Claude records; Daniel decides.
