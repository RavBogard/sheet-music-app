# Setlist memory, release 4: Beit Mitzvah siddur pages — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A B'nei Mitzvah setlist gets real page numbers from the Beit Mitzvah siddur. When a family uses its own printed booklet, it gets no page numbers instead of wrong ones.

**Architecture:**
- Register `legacy-beit-mitzvah` as a feed-tier book in `src/data/books/`, from the shireishabbat feed.
- Folios come from each unit's `printedFolio`, the same way `legacy-shabbat-evening` and `legacy-shabbat-morning` were registered.
- Point the B'nei Mitzvah profile at that book.
- Teach the agent guide to ask which book a B'nei Mitzvah uses.

**Spec:** `DESIGN.md` §5.6; Daniel's ruling in §7 ("Beit Mitzvah → new Beit Mitzvah siddur or the family's custom booklet").

## Global Constraints

- **Measure, never guess pages.** A wrong page is worse than none (§5.6).
  - The printed book is `research/current-siddurim/Beit-Mitzvah-Siddur-6.0.pdf` in shireishabbat.
  - Its call numbers are the PRINTED numbers (R-0901-vision-2). shireishabbat's `volumes.json` records that this book's corpus `src: pN` is the printed number, at offset 0.
- **shireishabbat is read-only for this release.** Another session has uncommitted work there.
  - Do not edit, build into or commit in that tree.
  - Read files, and run read-only scripts or `emit_live_books.py --check` against its committed state if needed.
  - If a rebuild of the feed is needed, stop and report. Do not build.
- No liturgical text in this repo: unit ids, names and integers only.
- No Windows paths in committed files.
- Never hand-edit a derived registry row. Use the producer's output, or a script whose source is committed and whose provenance goes in the registry row's `source`, as the two legacy rows do.

## Review Focus

1. **The feed is stale against the corpus.** The feed was built at `7f34b63+dirty` on 2026-09-20, and the content changed on 2026-09-22 (`8ba46a1`). Any unit whose `src: pN` changed after the feed was built must not be registered with the old number. Diff the corpus `src: pN` values at HEAD against the feed's `printedFolio`. Any mismatch → stop and report.
2. **Pages don't match the printed book.** The feed's `printedFolio` maxes at 63, but an earlier note says the book is 86 pp. Measure the PDF's highest printed folio and use that for `pages`. Note the gap in `source` if units stop short of it.
3. **A unit with no `printedFolio`** is dropped, never guessed (as `legacy-shabbat-morning` did with frontmatter).
4. **Tenant rules:** BrosLaz is unaffected. A book is global data, not tenant data.

---

### Task 1: Register `legacy-beit-mitzvah`

**Files:**
- Create: `src/data/books/legacy-beit-mitzvah.json`
- Modify: `src/data/books/registry.json`
- Check: whatever `src/lib/books/` needs for a new feed book (titles, lookup, `list_books`). Follow how `legacy-shabbat-evening` was added: `git log -p -- src/data/books/legacy-shabbat-evening.json` and its commit.

Steps:
- [ ] **Measure.** Do the checks in Review Focus 1 and 2 and record the numbers in the commit message. If Focus 1 finds any mismatch, stop with nothing written.
- [ ] **Write a failing test.** A registry test that `getBook("legacy-beit-mitzvah")` exists with `tier: "feed"` and the measured `pages`. Also that `lookup_book_page` resolves a known moment (for example the Bar'chu unit) to its `printedFolio`.
- [ ] **Generate the book file and registry row.** Title: `"CRC Beit Mitzvah Siddur (feed)"`. `source` states the feed path, its build sha, the field used (`printedFolio`), the measured page count, and any units dropped.
- [ ] **Verify.** `npx tsc --noEmit -p .` plus the books tests (`src/lib/books/**/__tests__`) pass. There is also a books-producer check in CI ("Books Agree With Producer"): find its script and run it locally. If it compares against shireishabbat output this book can't satisfy without a rebuild, report that rather than weakening the check.
- [ ] **Commit.**

### Task 2: B'nei Mitzvah profile book, and the guide question

**Files:**
- Modify: `src/lib/profiles/keys.ts` (the `bnei_mitzvah_saturday` row: `book: "legacy-beit-mitzvah"`)
- Modify: `.paul/AGENT-GUIDE.md` and its golden copy (`docs/planning/2026-10-12-multitenant/golden/http-before/crc/mcp_instructions.txt` — regenerate it, do not hand-diff it)
- Test: the existing keys and profile tests

Steps:
- [ ] **Profile book.** Set the book. Then check that `draft_service` for `bnei_mitzvah_saturday` binds rows to it the way it does for `crc-saturday`; there is an existing emulator test to extend.
- [ ] **Guide.** In "Building a service", add one rule: for a B'nei Mitzvah, ask "Beit Mitzvah siddur, or the family's own booklet?". For the family's own booklet, set the setlist's `book` to null with `update_setlist` after creating it, so no page numbers print. A wrong page is worse than none.
- [ ] **Verify.** Run tsc, eslint and the touched tests.
- [ ] **Commit,** push, open the PR, and stop.

## Not in this release

- Beit Mitzvah portal services (`src/lib/beit-mitzvah/`) keep their current book behaviour. That contract is shared with the portal (PRs 16 and 17), and changing it needs the portal's side too.
