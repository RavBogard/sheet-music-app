# ORDER → Code: pin the book sync, then hide the extension at display

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Tier: CLOSED — edits `src/**` and `scripts/**` and deploys. **No data write of any kind.**
Verified-against: `1bbded15f5` [inherited: `RETURN-CODE-LIVE-SEARCH-JOIN-2026-09-02.md`].
**Confirm host-side at open.**

Authority: **R-0902-live-cw-1 §2** · R-0831-live-pagemap-1 · R-0901-vision-8 §1 · rule 5 · rule 6 ·
R-0831-guards-2 · field note 12
Grounding: `FINDINGS-L2-MOMENTS-GROUNDWORK-2026-09-02.md` §A (this root).

NEXT: pin `sync-books.mjs` to `dist-app/` with a failing gitSha guard (P1), then hide the
trailing media extension at display from one shared path (P2), then deploy and re-assert the
Rosh Hashanah guard.

**P1 first.** It is the one with a deadline behind it.

---

## P1 — `sync-books.mjs` reads the unpinned build, and would put the dead page space back

`scripts/sync-books.mjs` resolves its input as `join(repo, "dist")`. The app carrier is
`dist-app/`. This desk **observed** both, at HEAD `1cdd4f7425`, 2026-09-02T02:0xZ:

| source | machzor `printing.gitSha` | units it writes | `pages` it writes |
|---|---|---|---|
| `dist/` | `8ab7be6` | **130** | **248** |
| `dist-app/` | `21417d9-LICENSED` | **122** | **182** |
| `src/data/books/shirei-tshuvah.json` today | — | 122 | 184 |

`21417d9` is the press commit; the satellite's file matches `dist-app/` and not `dist/`. So
`npm run sync:books`, run by anyone today, **reinstates the 248 page space two deploy cycles were
spent removing** — nine days before Rosh Hashanah. Its only guard is `schemaVersion === 1`, which
both builds pass, so nothing stops it.

**The work.**

1. Read `dist-app/`, not `dist/`.
2. Record a pin per volume in the repo — the `printing.gitSha` each book's committed snapshot was
   generated from — and **fail** when the feed on disk disagrees. A printed volume's pin is its
   press commit, never HEAD (R-0831-live-pagemap-1).
3. **Assert an identity, not a number** (field note 12): the script already computes `pages` from
   `maxFolio` and then tells the operator to update `registry.json` by hand. Make it check that
   `registry.json` agrees with what it just computed and fail if not, rather than printing a
   reminder. A reminder is not a guard.

**Show the fail branch (R-0831-guards-2):** point the pinned reader at a feed whose `gitSha`
differs and prove it refuses. A pin whose refusal has never run is a comment.

**Do not re-sync the books in this order.** The current snapshots are correct and pinned; this
wave makes them un-clobberable, it does not regenerate them. If the pinned read reproduces the
committed files byte-for-byte, say so — that is the strongest evidence the pin is right.

## P2 — the extension is packaging, and both surfaces hide it (R-0902-live-cw-1 §2)

`library_index.name` is the raw filename; the old `songs.title` was a cleaned copy, so search had
been showing tidied names while the browse showed the file's. Now that both read the same field,
both show the extension. This desk **observed**, by exhaustive `list_library` paging at HEAD
`1bbded15f5` on 2026-09-02T02:1xZ: **411 of 687 visible rows end in a media extension, 410 of them
`.pdf`**, and stripping it at display **collides on exactly 1 group in 687**.

**The work.** Strip a trailing media extension from the **displayed** name, in **one shared code
path** used by both the browse and search. **No stored name changes.**

**One path, not two — this is the point, not a style note.** §5 repaired a defect that existed
because two surfaces resolved a name differently. A second, parallel stripper rebuilds it. If the
shared helper cannot be reached from both call sites, stop and return rather than duplicating it.

**Match, don't hide.** As with the old-name key, the extension must remain **matchable** — a
search for `Hashkivenu.pdf` still finds the row. Stripping is display-side only.

## Guards

**Rosh Hashanah (R-0901-vision-8 §1), asserted after the deploy and quoted in the return.**
`list_books` → `shirei-tshuvah` **184 pages, tier `feed`**. This desk **observed** that value at
HEAD `1bbded15f5`, 2026-09-02T02:1xZ, before writing this order. P1 touches the very path that
produces it, so this guard is doing real work in this wave rather than ceremony.

**`src/data/books/*.json` must be byte-identical after this wave.** P1 changes how they are
produced, not what they contain.

**Not touched:** chart bonds, setlists, `moments`, `siblingsInCatalog` (parked for `L3`), and
every stored name.

Checks the executor runs and records — **no observed value is supplied here, deliberately:**

```text
git log --oneline -1                              # confirm the Verified-against sha
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
git status --porcelain src/data/books/            # must be empty after P1
```

## Checklist

- [ ] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] P1 reads `dist-app/`; per-volume pin recorded in the repo
- [ ] P1 fails on a `gitSha` mismatch — fail branch demonstrated, not described
- [ ] P1 checks `registry.json` against the computed folios instead of printing a reminder
- [ ] P1 leaves `src/data/books/*.json` byte-identical; say whether the pinned read reproduces them
- [ ] P2 one shared display path, both surfaces; extensions still matchable
- [ ] Build gate green; deployed
- [ ] RH guard re-asserted after the deploy and quoted
- [ ] `RETURN-CODE-LIVE-PIN-AND-DISPLAY-*.md` at this root; `Lane: live (Code)` on every commit

## Stop conditions

Stop and return, do not decide, if: the pinned read does **not** reproduce the committed book
snapshots — that means the pin or the snapshots are wrong and it is a ruling, not a fix; the
display strip cannot be done from one shared path; stripping changes what a query matches; or the
`registry.json` check fails on the current tree. **`live` never spends a ruling id (rule 1).**

Claude records; Daniel decides.
