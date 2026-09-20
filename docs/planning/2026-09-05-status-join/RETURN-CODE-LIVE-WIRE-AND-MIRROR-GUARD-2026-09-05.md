# RETURN ← `live` (Code): the wire now says what the gate decided, and the mirror guard reaches its own assertion for the first time. **One of the three ungated reds is CLOSED.**

Lane: **live (Code)** · Order: `HANDOFF-CODE-LIVE-WIRE-AND-MIRROR-GUARD-2026-09-05.md` (LIGHT, program wave 7b)
Authority: `R-0905-live-cw-1` §1/§3/§5 · `R-0905-live-cw-3` §3/§4/§5 · `R-0904-live-cw-34` §1/§2 · rule 18 ·
`R-0831-guards-2` · `-30` §3(c) · `-38` (2)
Status: **CLOSED. F1–F3 complete.** One commit, no deploy (none ordered).
HEAD at open: `c581a201ff` · HEAD at close: see §6.

---

## 1 · Precondition and citations — checked as facts, before a byte

**Precondition (observable, not an ordinal — `-38` (2)):** `src/lib/mcp/tools/library.ts:622` holds
`const { enrichment, status: _joinedStatus, ...rest } = w02`. **Present.** The order is written against this tree.

Every F2 citation re-measured at my own HEAD, each named by content per `-39`:

| Cited by content | At `c581a201ff` |
|---|---|
| `junk-filter.ts` `if (mime.startsWith("application/vnd.google-apps.")) return true` | **exact**, `:35` |
| `sync-engine.ts` `const ingestFiles = allFiles.filter(` | **exact**, `:146` |
| the mapper comment *"`status` is joined for the GATE above and is dropped here on purpose"* | **exact** |
| the filter comment *"R-0904-live-cw-34 §1/§2: gate on `library_index.status`"* | **exact** |

**§1's `bond-corrections.ts` claim verified rather than accepted:** its `searchLibrary` call at `:262` maps exactly
six fields — `songId`, `title`, `key`, `titleSpecificity`, `siblingsInCatalog`, `bondCorrectionHistory` — and reads
no `status`. **No mismatch anywhere, so nothing stopped.** I also swept every non-test `searchLibrary` caller in
`src/`: `bond-corrections.ts:262` and `index.ts:764` (the MCP tool wrapper, which passes the rows through whole).
The wrapper is the agent-facing surface `R-0905-live-cw-1` §2 named as the audience.

## 2 · F1 — the negatives failed first, and on their own terms

Both new cases run against **unmodified** source before the fix (`R-0831-guards-2`, `-38` (2)):

**`2 failed | 12 passed (14)`**

- `reports what library_index says for the reverse-divergence row, not the mirror` —
  `AssertionError: expected 'archived' to be 'active'`
- `reports the joined status for an orphan surfaced by includeOrphaned` —
  `AssertionError: expected 'active' to be 'orphaned'`

Each fails at the assertion its name advertises, not at a setup step — which, given what F2 is about, felt worth
checking rather than assuming. **After F1: `14 passed (14)`.**

The two fall-back cases were green before AND after, which is the half that matters: the erasure guard
(`does not erase songs.status when the library_index row has no status field`) and the untouched `no-w02` early
return (`keeps the songs status on the wire when there is no library_index row`).

**One existing case was INVERTED, not deleted, and it should be named.** Wave 7's file carried
*"leaves the wire status as the songs value — the predicate moved, the shape did not"*, asserting exactly what
`R-0905-live-cw-1` now overturns. It is replaced by `reports the joined status for an orphan surfaced by
includeOrphaned`, same fixture, opposite expectation. **A superseded assertion is a ruling's record; I did not want
it sitting green in the tree contradicting the ruling that replaced it.**

## 3 · F1 — one binding, and where it lives

The fall-back rule now exists in exactly one place, a module-level helper above `searchLibrary`:

```ts
function effectiveStatus(
    row: { id: string; status?: string },
    w02Map: Map<string, LibraryW02Fields>,
): string | undefined {
    return w02Map.get(row.id)?.status ?? row.status
}
```

- **The filter** (`:573`) — `const status = effectiveStatus(s, w02Map)`, replacing the inline `??`.
- **The mapper** (`:643`) — the destructure is **kept** (it is what stops the spread erasing a good `songs` value
  with `undefined`), and `status: effectiveStatus(s, w02Map)` is assigned explicitly, placed **after** the enrichment
  spread so nothing downstream can clobber it.
- **The `no-w02` early return is untouched.** With no index row the wire keeps `s.status` exactly as before wave 7.

`R-0905-live-cw-1` §3's requirement is met literally: the `??` appears once in the file, inside the helper. Both
readers now derive the value from the same line, so the value a caller sees is by construction the value the gate
decided on.

## 4 · F2 — the guard reaches its own assertion for the first time

**Scenario 1, re-cut and renamed.** Old: *"Scenario 1: new Drive shortcut mirrors to songs/\* with raw name (no .pdf
strip, no status)"*, seeded `application/vnd.google-apps.shortcut`. New:
**"Scenario 1: a new chart mirrors to songs/\* with its raw name (no extension strip, no status)"**, seeded
`Lechu Goldman.musicxml` / `application/vnd.recordare.musicxml+xml`.

**Every surviving claim is the one that stood before** — verbatim name with no strip, `normalizedTitle`, `fileId`,
`id`, `createdAt` present on a first write, `merge: true`, and `not.toHaveProperty('status')`. **The fix is the
fixture, not the assertions.** MusicXML rather than PDF for two reasons: the pipeline admits it, and a non-PDF
extension keeps the no-strip claim honest while staying distinct from Scenario 2's verbatim-title check.

**The LEFT-RED comment block was replaced, not just amended.** It stood under `R-0904-live-cw-17` §2 and argued
that re-cutting the mime "would turn it green while testing a shape Drive cannot return". `R-0905-live-cw-3` §3
overturns that, and **a stale rationale left in place above a re-cut test is how the next reader gets misled the
same way.** The new block records what the old fixture actually did (died at its first expect, never reached its own
`no status` assertion), and says plainly what is **not** settled: whether a shortcut-bonded row should reach
`songs/*` at all remains open at `R-0905-live-cw-3` §6.

**The mutation that proves it is a guard (`R-0831-guards-2`).** Google-apps mime put back on the re-cut fixture:

```
FAIL … Scenario 1: a new chart mirrors to songs/* with its raw name (no extension strip, no status)
AssertionError: expected [] to have a length of 1 but got +0
 ❯ src/lib/__tests__/sync-engine-songs-mirror.test.ts:208:49
```

**`:208` is `expect(libraryWritesFor('chart-lechu')).toHaveLength(1)` — the FIRST expect, not the `status` one.**
That is precisely the shape of the original defect, reproduced on demand and then reverted. Fixture restored,
`7 passed (7)`.

**The `contract:` test's population.** Before: three fixtures, of which the ingestion filter dropped two
(`B.pdf` as google-apps, `C.mp3` as audio) — **the sweep's `for` loop iterated over one row**, a contract asserted
against a single example. After: `A.pdf` (existing → merge write), `B.pdf` (new write), `C.musicxml` (non-PDF
chart) — **three admitted fixtures, three songs writes swept.** `expect(allSongsWrites.length).toBeGreaterThan(0)`
kept as ordered.

**The header claim corrected, both halves stated:** the mirror SITE applies no MIME filter of its own (true), and
the PIPELINE drops every non-chart artifact before either batch is built (also true, since the v11.5-04-02 ingestion
filter) — with the reason the distinction matters written down, since believing only the first half is how the dead
fixture got written. **Scenarios 4 and 5 untouched**, as ordered.

## 5 · Suite figures — the delta, and which instrument took it

**`sync-engine-songs-mirror` Scenario 1 is GREEN.** One of the three ungated reds is closed.

Local full (ungated) run at this commit: **`2 failed | 4022 passed | 78 skipped (4102)`**, the two being the
`registry.test.ts` folio pair, which is routed elsewhere (`-27` §4).

**THE SAME-INSTRUMENT CI DELTA, now settled on `fe4082cebf` — this is the figure `R-0905-live-cw-2` §1 asks for:**

| `Unit & Integration Tests` | `c581a201ff` | `fe4082cebf` |
|---|---|---|
| failed | `3` | **`2`** |
| passed | `4016` | **`4019`** |
| skipped | `81` | `81` |
| total | `4100` | **`4102`** |

**Failures `3 → 2`; passed `+3`; total `+2`.** It reconciles to the wave exactly: the two new wire cases add `+2`
passed and `+2` total, and Scenario 1 flips fail→pass for the third `+1` passed and the `-1` failure. **Nothing else
moved.** The two survivors are the `registry.test.ts` folio pair.

**Both REQUIRED checks are green on `fe4082cebf`: `Build Check` `success` and `Gated Unit Suite` `success`**
(`Emulator Tests` `success` too). `Lint & Type Check` and `E2E Smoke` remain `failure`, both pre-existing and both
wave 9's.

**The local figure is kept above rather than smoothed away, because the two instruments disagree in a way a reader
should see:** my local run skips 3 FEWER than CI (78 vs 81 — CI gates three emulator cases this machine runs), so
its passed count is 3 higher and a naive local-vs-CI subtraction would invent a delta the wave never made. The
arithmetic
reconciles exactly: `4016 + 2` (the new wire cases) `+ 1` (Scenario 1, now passing) `+ 3` (CI-skipped, locally
passing) `= 4022`, and `4100 + 2 = 4102`. **Failures `3 → 2`, agreeing with CI.**

`npx tsc --noEmit` exit **0**. `eslint` clean on all three changed files. **No line was added to
`ci/gated-suite-exclusions.txt` under any branch; the exclusions debt stays at TWO.** Line endings pure LF on all
three files, matching their neighbours.

## 6 · Commit, CI, deploy

Commit **`fe4082cebf`** — one commit, three files (`library.ts`, `library-status-join.test.ts`,
`sync-engine-songs-mirror.test.ts`), 0 unpushed. The helper sits at `library.ts:543`. Settled CI figures are in my
board row at close.

**A correction to this file, made before it was read by anyone:** its first draft cited the filter at `:551` and the
mapper at `:640`, numbers taken from the tree BEFORE the helper was inserted above them. The helper's own eighteen
lines moved both. **A cited line number is a claim, and mine were stale by exactly the size of my own edit** — the
sites are `:573` and `:643`, re-read after the commit.

**No deploy.** `R-0905-live-cw-1` §5: the wire and the join are one behaviour and reach production together.
**Stated as its own line, as §3 asks: this desk does not want a solo deploy for 7b either** — it should ride
whichever wave next needs production, carrying wave 7 and 7b as the single behaviour they are, with the RH guard
assertion (`shirei-tshuvah` 184/`feed`) belonging to that wave. Until then `Tu Bishvat` still returns
`"status":"active"` from the live surface, as `RETURN-CODE-LIVE-STATUS-JOIN-2026-09-05.md` §6 recorded.

## 7 · FOR `live-cw`

1. **`R-0905-live-cw-3` §6 is untouched and now cleanly separable:** whether a shortcut-bonded row should reach
   `songs/*` no longer has a dead test standing in for it. The question is recorded in the new comment block, and
   Scenario 5 still asserts the drop directly.
2. **Wave 9's denominator moves: three ungated reds become two** — `Lint & Type Check` (fourteen ESLint errors) and
   `E2E Smoke`. `Unit & Integration Tests`'s remaining two failures are the `registry.test.ts` folio pair, already
   routed at `-27` §4, so that check is red for a reason no `live` wave owns.
3. **The inverted assertion (§2) is worth a glance** — it is the one place where a wave-7 test now says the opposite
   of what it said yesterday, and it says so because a ruling changed, not because the code drifted.

## 8 · What this return does not claim

No deploy, no ruling minted, no id spent. `server-songs.ts`'s G-15 default untouched. The fourteen lint errors and
the `E2E Smoke` red not enumerated or repaired (wave 9). The folio pair untouched. Whether Drive shortcuts should be
ingested: not answered. Waves 4, 5, 6 untouched. `ci/gated-suite-exclusions.txt` not touched.
