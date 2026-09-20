# RETURN-CODE-AUDIT-2026-09-19-W2 — CentralReform.live (sheet-music-app)

Executor: Claude Code (Opus), one session, 2026-09-20
Against: `5d279252ed` (master) — the Wave 1 return commit
Wave: Wave 1 close-out + Wave 2 start

---

## The three things Daniel must see

### 1. Wave 1 shipped and is live. The signed-out check passed on both tenants.

The ordering was code first, browser check second, rules third — which is the
only safe order, because until the rules tighten the client can still fall back
to Firestore and a broken server route would hide behind that fallback. So the
routes were checked directly as well, not only through the page.

- `1a39209ff9` deployed to production (`dpl_A4zTQv2TMXoRSWZWUc2i1BDwPxmw`).
- `firebase deploy --only firestore:rules --project crcmusiccharts` — released.
- Signed-out, after the rules tightened: `/perform` renders all five upcoming
  services; `/perform/setlist/87735cd3…` (tonight's **Kol Nidre**) renders all
  24 rows in the author's order with page numbers and assignments, **0 console
  errors**. The public route returns 35 rows for the CRC setlist and 21 for a
  Brothers Lazaroff one — both tenants, signed out, `found: true`.

### 2. Signed-out Perform no longer receives live updates. This is new, and it is a consequence of the ruling.

Before R-0919-audit-2, a signed-out iPad held an anonymous Firestore
subscription on `tracks` and saw a mid-service edit appear by itself. That
subscription is a `list`, and `list` now requires sign-in, so it is denied.

**What still works:** the page loads complete and correct every time, from the
ISR slice and `/api/setlists/{id}/tracks`. A reload gets the current rows.
**What no longer works:** a signed-out device does not update on its own if the
setlist changes while it is open.

I did not build a replacement. A poll against the public route would restore
it, but that is new machinery on the band's critical surface, and it is Kol
Nidre tonight and Yom Kippur tomorrow. Shipping it now is exactly the kind of
thing this repo's standing constraints exist to prevent.

**GATE: did not add signed-out live refresh — proceeded because it is new
behavior on Perform on the eve of the two heaviest services of the year, and
because the surface is correct on load. If the fleet's iPads are signed in,
nothing changed for them at all; that is the first thing to check.**

### 3. Web vitals and the AI review queue are still blocked — but for a different reason than Wave 1 recorded.

The CRC Music MCP connector **is authenticated now**. That is not what was
blocking it. Every tool for both items answers:

```
403 forbidden_role — "requires an admin account."  callerRole: "member"
```

`get_web_vitals_summary`, `get_ai_config` and `list_review_queue` all require
`admin`; this session's account is `member`. So (i) cannot be measured and (j)
cannot be triaged from here no matter how long the session runs. It needs the
account elevated, or Daniel running the two reads himself.

---

## Wave 1: what was still owed, and what the whole-suite run found

The Wave 1 return recorded the emulator suite as "1307 of 1308" and attributed
the remaining failures to machine contention, noting the six files passed in
isolation.

**One of them was not contention.** On a quiet machine:

```
mcp-contacts.emulator.test.ts > AC-4
  expected 'send' to be 'publish'
```

The Publish retirement changed `preview_notify_band`'s `recommendation` value
from `"publish"` to `"send"`, and this assertion was never updated. It is a
real, reproducible failure that had been sitting behind an explanation which
genuinely did fit the other five files. The contention ceiling in
`vitest.emulator.config.ts`'s header is real; it was also cover.

Fixed in `4f234e6810`. **The suite is now clean end to end:**

| suite | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **402 files passed, 6 skipped, 0 failed** (4795 tests) |
| `npm run test:emulator` | **94 files, 1308 of 1308 passed, 0 failed** |

That is the first single clean number this suite has produced, and it took a
quiet machine to get it — which is the Wave 1 return's own advice, followed.

---

## Wave 2 — dependency status, corrected against the producer's return

The master plan says items 1 and 2 wait on shireishabbat's Wave 1. Its Wave 1
is done (`970446f`, pushed). Reading its return rather than assuming from the
plan changes the answer for one of them.

| item | plan says | actually |
|---|---|---|
| (l) moments agreement check in CI | waits on shirei W1 | **blocked** — see below |
| (m) `sync:books --from-url` | waits on shirei W1 | **blocked** — see below |
| (n) `crc-friday`/`crc-saturday` unit identity | waits on shirei confirm | **confirmed, not started** |
| (o) Torah p.90 vs p.89 | STOP on Daniel | **still STOP** |
| (p) MCP surface split | no dependency | **surveyed, not started** |
| (q) iPad specs un-skip | no dependency | **triaged, not started** |
| (r) chart approval procedure | no dependency | **DONE** |

### Why (l) and (m) are blocked, precisely

The tool exists and is canonical: `build/tools/moments_agree.py`, with
`--self-test` over six cases. **The artifact it compares against does not.**

shireishabbat's `publish-app-surface` job declares `needs: [volumes, gate]`,
and `gate` runs `check.sh`, which exits 1 (19 failure lines). The job has
therefore never run — its own return records it as `skipped` on the only run
that reached it. Making `check.sh` exit 0 is **shireishabbat's Wave 2 item 9**.

So both items wait on shireishabbat's *Wave 2*, not its Wave 1. Second
constraint on (m): the transport is a **token-gated workflow artifact**, not a
URL (R-0919-code-2) — `dist-app/` is the licensed lane of every book and an
unauthenticated URL would be publication. `--from-url` as the handoff words it
does not exist and should not; the mode to build is a token fetch.

**What is true today, measured rather than assumed.** The producer's `dist-app/`
exists on this machine from shireishabbat's own Wave 1 build, so the comparison
can be run by hand, and was:

```
OK moments/agree — live: moments-shaped copy agrees over 18 shared service(s):
   225 moment id(s), 453 unit id(s), 453 pair(s)
```

**`.live` agrees completely with the corpus — zero differences.** The drift (l)
exists to catch is not present. What is missing is the automation, and the
automation is waiting on a producer artifact CI can reach.

### (n) — the dependency is confirmed, and the item is bigger than one line

`legacy-shabbat-evening-feed.json` and `legacy-shabbat-morning-feed.json` both
exist in the producer's `dist-app/`. The agreement check names them explicitly
as services the corpus carries and `.live` does not.

But the done-when — `lookup_book_page` returns a `momentId` for an ordinary
Friday and Saturday unit — does not follow from registering the feeds.
`lookupBookPage` returns a `momentId` only where the **pagemap** row carries a
`unitId` (`src/lib/books/lookup.ts:119`), and the pagemap rows do not have one:
`crc-friday.json` and `crc-saturday.json` carry **48 and 62 entries, 0 with a
`unitId`**, and their entry shape is `{name, aliases, page}` — there is no field
for one. The feed books carry `{id, name, folios}` instead. Registering the two
legacy feeds beside the pagemaps adds two books; it does not put a `unitId` on a
`crc-saturday` row, which is what the done-when actually needs.

What actually closes it is matching pagemap rows to feed units by normalized
name — **which is the same machinery item (o) is STOP-blocked on**, and (o)'s
first known disagreement ("Returning the Torah", p.90 here vs p.89 in the
reader's feed) is in exactly that Saturday pagemap. Doing (n)'s name-matching
before Daniel answers (o) means building the comparison and then having to
re-run it against a corrected page.

**GATE: did not start (n)'s name-matching — proceeded because it is the same
comparison (o) gates, and (o) is a STOP. The mechanical half (registering the
two feeds as books) is safe and is the first step once (o) is answered.**

---

## (r) — DONE

`docs/READER-PUBLIC-CHART-BOUNDARY.md` now carries **"Approving another
chart"** (7 steps) and **"Revoking one"** (5 steps), each followable without
reading `reader-music-public.ts`. No code changed; the endpoint was correct and
was not touched (R-0919-audit-4).

The parts worth having written down, because the code implies them and does not
say them:

- The five manifest values must come from **one read of one generation**. If the
  object is replaced between the metadata read and the hash, start over.
- An oversized object is rejected from metadata before any byte streams, so an
  approval over 4 MiB publishes nothing and **looks like a silent failure**.
- The flag compare is trimmed on purpose — the production value carried a
  trailing CRLF through 2026-09-07 — so set it to exactly `true`.
- Revocation order is **flag first** (no deploy, immediate) then allow-list
  (deploy). And **old deployment URLs keep their own code and environment**,
  which is how a revocation quietly fails to take.
- Both sections say plainly that bytes already delivered cannot be recalled.

Also corrected a paragraph that this document had wrong as of yesterday: it
listed the anonymous Firestore `tracks` read as an open risk. R-0919-audit-2
closed the enumeration half on 2026-09-19. The download half
(`/api/drive/file/[fileId]`, `/api/library/file/[id]`) is still open and still
says so.

---

## (p) — surveyed. The split is cheaper than 144 suggests.

The surface is already grouped. Measured by parsing `registerTool(` out of
`src/lib/mcp/tools/index.ts`:

| group | tools |
|---|---|
| `registerReadTools` | 12 |
| `registerWriteTools` | **64** |
| `registerMonitorTools` | 19 |
| `registerChartUploadTools` | 14 |
| `registerRosterTools` | 11 |
| `registerObservabilityTools` | 3 |

plus batch-intake, chart-inbox, authored-chart, test-token and bearer groups
registered from their own modules, reaching the audit's 144.

Five of the six groups fall cleanly on one side. **`registerWriteTools` is the
whole problem**: it holds `create_setlist` and `add_track_to_setlist` next to
`backfill_content_hash`, `seed_legacy_dedupe_run`, `salvage_chart_bytes` and
`__test_delete_storage_object`. Splitting it is most of the work, and the ops
route (`src/app/api/mcp/route.ts` composes the groups, so a second route is a
second composition) is comparatively trivial.

The retirement list the handoff names — the six completed backfills — is
confirmed present in that group and can be retired in the same pass, **after**
confirming each has run against both tenants, which needs the admin role this
session does not have.

---

## (q) — triaged. "Un-skip" is the wrong verb for most of them.

69 skipped unit tests, 49 skipped e2e. The largest unit clusters are not
waiting on anything — **they test UI that was deleted.**

- `SetlistGrid.a11y/selection/edit/undo/contextmenu` (48 tests) are
  QUARANTINED against "the desktop TanStack-table DOM … that was DELETED in
  `0ec6773c`". SetlistGrid renders the stacked card list only.
- `MobileCardList.test.tsx` (7) skips target `MobileEditSheet` and the anchored
  `ChartBindPopover` — `MobileEditSheet` does not exist anywhere in `src/`.

Every one of these already carries a written reason, which is half the
done-when. The honest resolution for them is **deletion, plus one card-DOM a11y
suite written from scratch**, not un-skipping — an un-skip would only assert
against a DOM the app no longer produces. The iPad e2e clusters are the ones
that may really be revivable, and the keep-awake half is Daniel's hardware
afternoon and is not claimed here.

Not started: deleting ~55 tests is a real reduction in what the suite asserts
and wants to land with its replacement, not on the eve of Yom Kippur.

---

## One thing shipped that was not on any list

`SetlistGridHydrator` mounted the Firestore snapshot listener unconditionally.
Signed out, that is now a denied `list`, so every signed-out Perform load
logged `Missing or insufficient permissions` and retried for rows that can
never arrive — an anonymous reader is not a leader and has no cross-leader edit
to see. The page was unaffected either way.

It is gated on a signed-in user now. No pixel changes. What changes is the
console during a service: a denied subscription that retries looks exactly like
a real fault to whoever opens the inspector on an iPad at 7pm, and that is the
wrong thing to hand them.

Covered by a test that asserts the listener does **not** mount signed out, and
drains hydration first so a pass means "signed out" rather than "never got far
enough to subscribe".

---

## What the next session should pick up

1. **Ask Daniel the two questions**: are the fleet's iPads signed in (§2), and
   the (o) printed-booklet page.
2. **Get the MCP account elevated to admin**, which unblocks (i) and (j)
   together.
3. **(p)** — split `registerWriteTools`; the other five groups are already
   sorted.
4. **(l)/(m)** — watch shireishabbat's Wave 2 item 9. When `check.sh` exits 0,
   `publish-app-surface` starts producing the artifact and both unblock at once.
