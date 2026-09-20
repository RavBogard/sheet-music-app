# ORDER → `live` (Code): reversibility first, then the content hash, then the key that uses it

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0903-live-cw-2** (§1 the byte rule · §3 sha256 as the key · §4 bonded-first · §5 reversibility ·
§6 the three questions · §7 the NUL) · **R-0903-live-cw-3** (§2 the restore rule for W6 · §3 W4's population) ·
R-0903-live-cw-1 §3 · R-0901-live-cw-4 §6 · rules 1, 4, 5, 11, 18, 19 · R-0831-guards-2
Status: DISPATCHABLE. Answers your 02:0xZ / 02:2xZ / 02:3xZ queue lines. **This order WRITES** — to `src/`, to
`library_index`, to `firestore.rules` — and it deploys nothing. **Daniel is needed for nothing in it: the restores
he was going to be asked about are ruled (§10, by amendment); the new-mark decisions still wait for him AFTER W6.**
Verified-against: `9933d2abef` [inherited: your 02:0xZ row, which confirmed it host-side as equal to origin/master,
and your 02:3xZ row, which reports no deploy since] — **re-confirm host-side before W1 and say so in your row.**
Tier: CLOSED — it states measured byte counts and a changed-row list.
NEXT: W1–W5 are LANDED and this order's build half is DONE; **its execution half — the backfill, the seed, the dry
run and §10's restores — moves to `HANDOFF-CODE-LIVE-DEPLOY-AND-EXECUTE-2026-09-03.md`, which is where you go next.**
Nothing further is executed under this order.
**W2 lands before anything ever marks again; W1 is first because every later wave greps this file.**

**AMENDED A SECOND TIME 2026-09-03 19:5xZ by `live-cw`, under `R-0903-live-cw-4` and `R-0903-live-cw-5`, after
your 17:0xZ and 18:4xZ returns.** Two things: **§8's "No deploy" is LIFTED** — Daniel at the keyboard 19:4xZ, and
the contradiction you stopped on was real (see that bullet) — and **§10's rule is bounded by `R-0903-live-cw-5`**:
its three named rows are ruled NOT duplicates and are restored, and the byte test never runs where one side has no
bytes. **Both land in the successor order named in `NEXT:`; nothing is executed here.** The execution half left
this order because you had already built and landed W1–W5, and a wave that has landed cannot carry a new sequence.

**AMENDED IN PLACE 2026-09-03 17:2xZ by `live-cw`, under `R-0903-live-cw-3`, while still unopened by `live`** — and
**that sentence was FALSE when it was written**: your 17:0xZ row already had W1–W5 committed. This desk read the
dispatch queue and not the row. The amendment's substance survived; its premise did not, and it is recorded here
rather than quietly corrected (your 18:4xZ §5 caught it). Three changes, all of them widening what you do, none of them re-sequencing:
**§5's population now includes the `non_chart` rows** (§3 of the ruling — as first written, this order could never
have answered the question Daniel is waiting on), **§10 is new and gives W6 a rule instead of a question** (§2),
and §7 gains **G7**, §8's first stop condition gains its one exception, and §9's last sentence is struck as false.

---

## 1 · The one-sentence why

Your three returns established that name-based grouping over-reaches and under-reaches at the same time, that
**100 rows are marked and none can be reversed by any tool**, and that **5 byte-identical pairs are visible in the
catalog right now** — so the key has to become the bytes, and reversibility has to exist before anything is hidden
by it. R-0903-live-cw-2 rules all of that; this order builds it.

## 2 · W1 · Escape the NUL bytes — one file, three sites, zero behavior change

```console
perl -e 'open F,"<:raw",$ARGV[0];local $/;$d=<F>;printf "NUL=%d bytes=%d\n",($d=~tr/\0//),length($d)' src/lib/mcp/tools/library.ts
```

**Observed at `9933d2abef`, 2026-09-03 15:4xZ: `NUL=3 bytes=90886`.** This desk swept every `.ts` and `.tsx` under
`src/`: that file is the **only** one carrying any. The three sites are the bucket-key build, its `indexOf` parse,
and the fuzzy-cluster key. `grep -rn "chartFormatClass" src/` answers `binary file matches` and prints no lines.

- [ ] Replace each raw NUL with a unicode escape, or one named constant used at all three sites so the writer and
      the parser cannot diverge.
- [ ] Confirm zero behavior change — the emitted key strings stay byte-identical. Say how you confirmed it.
- [ ] After: the probe above returns `NUL=0`, and `grep -c "chartFormatClass" src/lib/mcp/tools/library.ts` prints a
      count rather than a binary notice.

## 3 · W2 · Persist the prior state BEFORE the status — the wave that unblocks every later one

The mark currently writes `status: "duplicate"` and `dedupedAt` on `library_index` and `status` on the mirrored
`songs/{id}`, and **records no prior state anywhere** — which is why the 09-01 sweep's reversibility lives in a
hand-written JSON file in another repository, and why 100 rows are now unreversible from inside the system.

- [ ] At mark time, in the same batch as the status write and ordered before it: `priorStatus` (the row's status as
      read in this run) and `dedupeRunId` on `library_index`, and the same pair on the mirrored `songs` doc.
- [ ] Write a `dedupeRuns/{runId}` document at commit: the run's timestamp, its threshold, which pass grouped each
      group (§5), and per marked row `{fileId, priorStatus, canonicalFileId}`.
- [ ] **`firestore.rules` needs a rule for `dedupeRuns` before anything reads it.** A new collection under the
      deny-all fallback is unreadable, and **a Vercel push does not deploy rules** — that is this repo's own
      19:4xZ finding, where a shipped feature would have landed dead for exactly this reason. Deploy rules first,
      then re-read the live ruleset and confirm the match is present.
- [ ] Idempotence is unchanged: a row already at `duplicate` is still skipped, and skipping writes no run row.

## 4 · W3 · `undo_dedupe_group` — and the restore it must REFUSE

R-0903-live-cw-2 §5: a repair tool may not create the class of harm it exists to repair.

- [ ] New admin MCP tool `undo_dedupe_group`, taking **either** `runId` (restore every row of that run to its
      recorded `priorStatus`) **or** `fileId` + an explicit `toStatus`. Writes `library_index` and the mirrored
      `songs` doc, clears `dedupedAt` / `dedupeRunId`, and reports per row what it changed and from what.
- [ ] **REFUSE a blanket restore of the legacy population.** 18 of the 85 rows in `L1-W2-DEDUPE-UNDO-2026-09-01.json`
      carry `priorStatus: "archived"`, so a default-to-`active` restore would un-archive rows somebody deliberately
      archived. With no run record and no explicit `toStatus`, the tool refuses and names the count it would have
      wrongly activated.
- [ ] One-time seed, read-only against the catalog until it writes: import that undo file's 85 rows as run records
      under a synthetic `runId` (`legacy-2026-09-01`), preserving each `priorStatus`. The **15 uncovered rows get no
      record** — their prior status is not stamped anywhere, your return says so, and the tool must say so too
      rather than assuming `active`.
- [ ] The connected MCP client authenticates as `musician` and admin tools refuse it (R-0903-live-cw-1 §5): this is
      the bearer path. Say which identity ran which step.

## 5 · W4 · The `contentHash` column, and why the cheap hash is not the key

Three hash values already exist in this codebase and they are not interchangeable [measured by this desk on the
mount, 2026-09-03 15:4xZ]: `library-upload.ts` computes **sha256** of every uploaded buffer and spends it only as an
`aiEnrichmentCache` doc id; `chart-heal.ts` computes **sha256** of canonical bytes for the same cache; Drive rows
persist **`driveMd5`**; and Storage exposes **`md5Hash`** in base64, already read by `firebase-storage.ts`.

**The authoritative value is sha256 of the stored bytes (R-0903-live-cw-2 §3).** The free metadata md5 is refused as
the KEY because it is not uniform — Google-Apps rows carry no `md5Checksum` — and a column holding whichever hash
was cheapest silently splits a true pair whose two rows were hashed by different routes. **And the sha256 that
already exists cannot be recovered without the bytes:** the cache doc stores `contentHash`, `output`, `model`,
`cachedAt` and **no row reference**. So the backfill reads bytes once per row, and pays that price once.

- [ ] `contentHash` on `library_index`: `{ alg: "sha256", value, sizeBytes, at, source }`. New uploads set it on the
      write path from the buffer already in hand — that is free, and it is the reason this never needs doing twice.
- [ ] Backfill every row with bytes, **batched and resumable** — a row already carrying a `contentHash` whose
      `sizeBytes` matches is skipped, so a re-run costs nothing and an interrupted run resumes.
- [ ] **Cross-check, not key:** where the row has a `driveMd5` or Storage `md5Hash`, compute that md5 from the bytes
      you downloaded and compare. **A mismatch means you did not fetch the bytes this row claims — record the row as
      `hashFailed` with the reason and DO NOT write a hash for it.** A wrong hash is worse than no hash: it makes a
      false pair confidently.
- [ ] Rows whose bytes are unreachable (the gapps rows, the dead-byte rows `search_library` hides behind
      `includeUnbindable`) get no hash and are reported as a population, not skipped in silence.

**AMENDED (R-0903-live-cw-3 §3) — the population is every row whose bytes are reachable, `non_chart` INCLUDED.**
As this order was first written, W4 backfilled chart rows and §9 said in as many words that the 12 audio part-track
groups were out of scope. Daniel's answer on those groups is *leave them until CONTENT-HASH's sha256 answers them
mechanically* [inherited: the vision seat's 17:1xZ row, item 4] — **so as dispatched, this order would never have
answered him, and a decision to wait had been taken on a premise the artifact does not support.**

- [ ] Backfill hashes the `non_chart` rows too. **Report them as their own population** — count, bytes read, hashes
      written, failures — rather than folded into the chart figures. Two populations, two lines; a single blended
      number answers neither question.
- [ ] **The cost is named so you do not discover it mid-run:** those groups run to roughly a megabyte and a half per
      part across four or five parts apiece — more bytes than the entire chart backfill [inherited: the 02:2xZ row's
      sizes: `Avinu Malkeinu Janowski D minor` 1,572,779 B across four parts, `May The Memory` 1,510,921 B across
      five, `Barechu_trad` 951,274 B across five]. W4 is already batched and resumable, so **the answer is to let it
      run long, not to sample it.** If you must split it, do the chart population first and say where you stopped.
- [ ] Everything else about W4 is unchanged, and the md5 cross-check above applies to these rows identically: a row
      whose recomputed md5 disagrees with its metadata md5 is `hashFailed` and gets no hash, audio or not.

## 6 · W5 · The hash pass, the candidate fields, and bonded-first

**The hash pass ADDS a lane; it does not replace the name pass** (R-0903-live-cw-2 §3). Byte-identity is exact and
needs no name; the normalized-name pass with `chartFormatClass` stays for near-misses a hash can never see. Every
group reports **which pass grouped it**.

- [ ] Exact pass: group by `(contentHash.alg, contentHash.value)`. Rows without a hash are not candidates and are
      counted as such.
- [ ] `Candidate` gains `sizeBytes`, `contentHash` and a bond count. **This is the root fix for your 02:0xZ finding:**
      all 84 groups in the 09-01 plan carry only `fileId`, `name`, `uploadedAt` because the candidate shape carries
      only those — the artifact was thin because the type was. Widen the type and every future plan file, report and
      proposal carries the deciding fields for free.
- [ ] Canonical sort gains bondedness **after** the Google-Apps rule and **before** `uploadedAt` (§4 of the ruling):
      `active` → real bytes → bonded → earliest → `fileId`. Above the Google-Apps rule a bonded Google-Doc would
      out-rank renderable PDF bytes; below `uploadedAt`, age keeps beating use, which is how `Bar'chu Walkdown` came
      to be marked while 4 setlists bonded it.
- [ ] Both tools state their filter order in `coverage` (§6b of the ruling), so the `list_library` / `dedupe_library`
      count disagreement reads off the response instead of being rediscovered.
- [ ] A cross-format pair whose hidden row is `non_chart` stays marked and **is still listed, with that reason**
      (§6a) — a no-op is a conclusion, and the operator gets the premise.
- [ ] **DRY RUN ONLY in this order.** The hash pass reports; it marks nothing. Every restore and every new mark is
      Daniel's, per pair, after he reads W6.

## 7 · Guards that can fail, and the acceptance test with a known answer

**G1 · No NUL in source.** The W1 probe returns `NUL=0` on `library.ts` and on every `.ts`/`.tsx` under `src/`.
FAIL otherwise. **Observed before this order at `9933d2abef`, 15:4xZ: 3 on that file, 0 everywhere else.**

**G2 · Reversibility precedes hiding.** For every row a run marks, that run's record holds it with a `priorStatus`:
`count(marked) == count(records)`, asserted in code. **Fail branch to SHOW:** disable the record write and mark one
row in the emulator — the batch must refuse rather than hide a row it cannot reverse.

**G3 · The undo refuses what it must.** Call `undo_dedupe_group` against the legacy population with neither a run
record nor a `toStatus`. **It must REFUSE and name the 18 rows it would have wrongly activated.** Show that output.

**G4 · A hash is never written for bytes that did not verify.** Where a metadata md5 exists, the md5 recomputed from
the downloaded bytes equals it. **Fail branch to SHOW:** corrupt one buffer in a test and confirm the row is recorded
`hashFailed` and no `contentHash` is written.

**G5 · ACCEPTANCE, and it has a known answer.** The exact pass must find **the 5 byte-identical visible pairs your
§8 named** — `Niggun - Bonia Full Score`/`Niggun - Full Score`, `G-minor Spirits`/`gminor_spirits`, `B-minor Simple
Tune`/`Bminor_simpletune`, `twilight`/`Twilight (D Goldenberg)`, `Hashkivenu (Randy)`/`Hashkivenu (Randy) (1)` — and
must **NOT** group `V'Shamru`/`V'Shamru (Old Skool)` or `Adonai Oz (Nava Tehila)`/`Avinu Malkeinu_trad_Choir_Em`,
which are size-equal and byte-different. **A pass that misses one of the 5, or groups one of the 2, is wrong** — this
is the one guard in the order whose expected value came from an instrument rather than from reasoning.

**G6 · The standing Rosh Hashanah guard**, before and after every wave: `list_books` → `shirei-tshuvah` **184 /
`feed`**. Plus your G1 population identity, `eligible == visible + duplicate + archived`, which held at
`785 == 684 + 99 + 2` after your 02:3xZ writes.

**G7 · The audio question is actually answered, and the guard is SHAPE rather than a value.** For each of the three
named groups — `Avinu Malkeinu Janowski D minor` (4 parts), `May The Memory` (5), `Barechu_trad` (5) — W6 reports
**one line per row, with that row's `contentHash.value` or a named reason it has none.** FAIL: a group missing from
the return, or a group reported only as a count. **The answer itself is not asserted here and must not be guessed:**
identical hashes across the parts means one file was uploaded under five part names and a singer rehearsing an inner
voice is hearing the full mix; distinct hashes means the sizes coinciding is what part-writing from one template
looks like. **Either result is a finding; only a missing row is a failure.**

## 8 · Stop conditions

- **STOP before marking anything. ONE EXCEPTION, added by amendment: the W6 restores of §10**, which are ruled
  (R-0903-live-cw-3 §2) and are the only status flips this order authorizes. W5 remains dry-run and **no new mark is
  authorized by anything in this order**; the asymmetry is the whole point of §10 and is explained there. Apart from
  those restores, the writes here are the column, the run records, the rules entry and the `src/` edits.
- **STOP if the backfill's mismatch rate is not near zero.** A handful of `hashFailed` rows is data; a systematic
  rate means the download path and the row disagree about which object is the row's, and that is a finding, not a
  retry.
- **STOP and return** if W2's rules deploy cannot be verified live — an unreadable `dedupeRuns` collection makes W3
  look built and leave nothing reversible.
- **~~No deploy.~~ LIFTED 2026-09-03 19:4xZ, `R-0903-live-cw-4`, Daniel at the keyboard.** You were right to stop:
  W4 asks for a production backfill and this bullet forbade the only way to run one. The push is authorized — and
  it is authorized **in the successor order, not here**. What survives unchanged is the half of the prohibition
  that was never about deployment: **the deploy authorizes EXECUTION and never a new mark.**

## 9 · For Daniel, not for the order body

**FOR DANIEL (decide-by: none):** after W6 you will have, for the first time, a list of duplicate pairs decided by
bytes rather than by names — including the 5 visible ones nobody has hidden yet. Each is one word from you.
And the **12 audio part-track groups**: every voice part of a piece sharing one byte size is not plausible for
different audio, and if those are one file uploaded under five part names, a singer rehearsing the alto line is
hearing the full mix. ~~W4 hashes charts; those rows are `non_chart` and this order does not touch them.~~
**STRUCK 2026-09-03 by amendment — that sentence was true of the order as written and it is why the sentence had to
go: you said leave them until the sha256 answers them, and the order as dispatched would never have hashed them.
W4 now does (§5), and W6 reports each part's hash (G7). Nothing about them comes to you before that.**

## 10 · W6 · The return, and the restore rule that governs it — NEW BY AMENDMENT

**R-0903-live-cw-3 §2 turns W6's outstanding pairs from a question into a rule.** Daniel delegated them; the rule is
this desk's, minted, and you apply it without asking.

**BOUNDED BY `R-0903-live-cw-5`, 19:5xZ:** the three `non_chart` Google-Apps rows this section named are ruled
**not duplicates at all** — a Google-Apps row and a real-bytes row never form a group — so they are restored
outright, by name, in the successor order's D7, and never by way of a pair W5 could not produce. **Your §4 was
right that §10's rule could not reach the only rows §10 named.** And the byte test is bounded with it: it **never
runs where one side has no bytes**, so "bytes differ" is not the question for a Google-Apps row and never was.

**The population is otherwise exactly this:** every currently-`duplicate` row that W5's dry run pairs with a visible
keeper. **It is not the 100 marked rows at large**; a marked row W5 pairs with nothing is untouched and stays marked.
**And it does not soften W3's refusal:** each restore here is a per-row call carrying an explicit `toStatus`, which
is precisely the path W3 leaves open — the blanket, run-record-less restore W3 must refuse is still refused.

- [ ] **Byte-identical → the hidden row STAYS HIDDEN.** Nothing to decide; the catalog loses nothing.
- [ ] **Bytes DIFFER → RESTORE the hidden row** to its `priorStatus` (or `active` where none is recorded, saying so),
      through `undo_dedupe_group` — never by hand. **This is the one place this order writes a status.**
- [ ] **Bring Daniel a pair only when it is genuinely ambiguous on mime PLUS size.** A pair the hash decides is not
      ambiguous, however odd its names look.
- [ ] Every restore is listed in the return with both rows' hash, mime and size, and the run id that reversed it.

**The asymmetry is the reasoning, and it follows from R-0903-live-cw-2 §2a:** a `duplicate` mark only hides a row
from browse, search and the picker — it does **not** break an existing bond, which this desk had to be corrected on
by `live`'s own instruments. So the cost of a wrong restore is one redundant row in a list somebody can ignore; the
cost of a wrong hide is a chart the band cannot find from the bimah. **Visible-to-the-band is the safe default, and
it is safe precisely because the mark turned out to be weaker than this desk first described it.**

- [ ] The rest of W6 is the return itself: `RETURN-CODE-LIVE-CONTENT-HASH-2026-09-03.md` and a CLOSED board row —
      the two populations of §5 with their figures, the G1–G7 line-by-line, the restores above, and the byte-decided
      duplicate list that W5's dry run produced. **Daniel reads that list; this order marks none of it.**

Claude records; Daniel decides.
