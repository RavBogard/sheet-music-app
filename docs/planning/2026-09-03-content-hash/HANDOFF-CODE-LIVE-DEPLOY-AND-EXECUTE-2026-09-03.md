# ORDER → `live` (Code): push `master`, then execute the four things that were only ever blocked on the deploy

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0903-live-cw-4** (the deploy prohibition is lifted; the push is the only path; execution never a new
mark) · **R-0903-live-cw-5** (Google-Apps is its own format class; the three named rows are restored; the byte test
never runs where one side has no bytes) · R-0903-live-cw-2 (§2a the mark's weight · §3 sha256 as the key · §5
reversibility) · R-0903-live-cw-3 (§2 the restore rule · §3 W4's population) · rules 1, 4, 5, 8 addendum, 11, 18 ·
R-0803-168 · R-0831-guards-2.
Status: DISPATCHABLE. **This order DEPLOYS TO PRODUCTION and then WRITES to production Firestore.** It marks
nothing. It supersedes the EXECUTION half of `HANDOFF-CODE-LIVE-CONTENT-HASH-2026-09-03.md`, whose build half you
have already landed; that order's `NEXT:` now hands W6 here.
Verified-against: `5e52e29ff0` [inherited: your 19:5xZ row, which reports it unchanged with seven unpushed
commits] — **re-confirm host-side at D1 and say so in your row; if HEAD differs, STOP.**
Tier: CLOSED — it states a measured production commit, a measured pre-state and an exact post-state.
NEXT: D1 confirm the tree and what production serves → D2 push `master` and watch the build to READY → D3 prove the
new code is the code answering → D4 the `contentHash` backfill → D5 seed the legacy run → D6 the hash pass, DRY RUN
→ D7 the three restores → D8 return.

---

## 1 · Why this order exists at all

You stopped `CONTENT-HASH` at §1 on a contradiction that was real and was ours: **W4 asks for a production backfill
and §8 forbids the deploy.** You costed three paths and took none, which was right. Daniel lifted the prohibition
at the keyboard 2026-09-03 19:4xZ after this desk measured what a push actually risks. **R-0903-live-cw-4 is that
ruling.** Everything here is the execution half you built and could not run.

**What this desk measured before putting it to him**, so you can see the premise you are inheriting:

- Production has been serving **`9933d2abef` since 2026-09-02 16:17Z**, and every production deployment on this
  project is a GitHub push on `master` [measured: the Vercel deployments API for
  `prj_7EgyYGOE3Ovm6u6MTTCYAVVAPUoJ`, `live-cw`, 2026-09-03 19:4xZ].
- **A preview deployment cannot substitute.** `ssoProtection` is enabled with
  `deploymentType: all_except_custom_domains`, so a bearer call to a `*.vercel.app` preview is intercepted by
  Vercel Auth before it reaches the MCP route [measured: the Vercel deployment-protection API, same read]. The
  custom domain is the only unprotected surface.
- **A failed build cannot take the band's app down.** On **2026-09-01 19:22Z** a production build ERRORED at
  `a7aab82a8c` and production kept serving the previous deployment [measured: the same deployments read — your own
  deploy return records the same event from the other side].

## 2 · The hazard this order will NOT pretend away

**The first `next build` that ever runs on these seven commits will be Vercel's**, and your own 2026-09-01 return
is why that sentence is here: `tsc --noEmit` is clean on a Next.js route-export violation, and a full local
`npm run build` cannot complete in this repo because `.env.local` carries no `NEXT_PUBLIC_FIREBASE_*`. The gate you
have cannot see that class of failure. **So a red build at D2 is a foreseen outcome, not a surprise** — and by §1's
third measurement it costs the band nothing.

## 3 · D1–D8 · The wave

- [ ] **D1 · Confirm the tree, and confirm what production is serving.** `git --no-optional-locks rev-parse HEAD`
      is `5e52e29ff0`; the working tree is clean; `master` is ahead of `origin/master` by the seven commits your
      19:5xZ row reports. Separately, confirm production is still serving `9933d2abef` — read it, do not inherit
      it from §1. **STOP on any difference**: a HEAD that moved, a dirty tree, a different production commit, or a
      count that is not seven. Any of those means somebody else acted and this order was written against a tree
      that no longer exists.
- [ ] **D2 · Push `master`.** Then watch the deployment to a terminal state. **READY → continue. ERROR → STOP**:
      return the build log's first error with your diagnosis of it (R-0803-167 — a hand-back may carry its
      root cause and should), and **verify, do not assume, that production is still serving `9933d2abef`.** No fix
      is applied under this order; a build fix is a `src/` change and it gets its own order from this desk.
- [ ] **D3 · Prove the new code is the code answering.** Not "the deployment says READY" — that is Vercel's claim
      about a build. Call the live MCP and establish that a tool that did not exist an hour ago now responds:
      the `undo_dedupe_group` refusal branch is the cheapest proof you have, because it is built to refuse and
      writes nothing when it does (your `CONTENT-HASH` G3). **A tool that 404s here means the alias did not move —
      STOP.**
- [ ] **D4 · The `contentHash` backfill, over every row whose bytes are reachable, `non_chart` INCLUDED**
      (R-0903-live-cw-3 §3 — as first written this program could never have answered Daniel's audio question).
      Dry run first, read it, then force. **Report the audio rows as their own population, never mixed into the
      chart figures.** **STOP if the mismatch rate is not near zero** — a handful of `hashFailed` rows is data; a
      systematic rate means the download path and the row disagree about which object is the row's, and that is a
      finding, not a retry.
- [ ] **D5 · Seed the legacy run** — `seed_legacy_dedupe_run` against the 85-row 2026-09-01 file, so the rows
      marked before W2 existed acquire the run record and `priorStatus` that make them reversible at all.
      **This wave runs BEFORE D7 and that ordering is load-bearing**, for the reason §4's G5 gives.
- [ ] **D6 · The hash pass — DRY RUN, and dry run only.** Report `hashPassCoverage`. **No new mark is authorized by
      anything in this order** (R-0903-live-cw-4: the deploy authorizes execution, never a mark). The byte-decided
      duplicate list this produces is **Daniel's**, and it comes to him through this desk, not through a run.
- [ ] **D7 · Restore the three Google-Apps rows**, through `undo_dedupe_group` and never a hand-edit standing in
      for it: `1gTZdh60yL9zN6zhQmbBeK7n-zxMxoshkZwHqwpYN99k` (Adon Olam), `1HmJ7mu9qYx6eGVaJcg88Hklsei7bnjcAR-ZYmjkgfbU`
      (Hashiveinu), `1PYjUUqxH12ip7Uz5aFP7q1wRKwi-pKbvVNJB8G-wV6k` (Mi shebeirach). **These are the only status
      flips this order authorizes.** Under R-0903-live-cw-5 they are not duplicates of their PDF keepers: a
      Google-Apps row and a real-bytes row never form a group, so the pair the mark recorded should never have
      existed. **They are `non_chart`, so this changes nothing the band can see** — it corrects the record, and
      saying so is why the wave is cheap, not why it is skippable.
- [ ] **D8 · Return** `RETURN-CODE-LIVE-DEPLOY-AND-EXECUTE-2026-09-03.md` + a CLOSED board row. Carry: the
      deployment id and the commit it serves, the backfill's populations (charts and audio separately), the hash
      pass's coverage and its candidate list, the three restores with before/after status, and **whatever
      R-0903-live-cw-5 §4 turns out to be true of** — if mixed-format groups can no longer form, the canonical
      picker's Google-Apps demotion is ranking inside a group that cannot exist and the two red emulator tests
      assert a state the rule forbids. **Report what you find there; change neither under this order.**

## 4 · Guards that can fail

**G1 · The standing Rosh Hashanah read, before the push and after D7.** `list_books` → `shirei-tshuvah`
**184 / `feed`**. [inherited: green at your 19:4xZ Z1/Z3 reads.] FAIL: any other page count or tier. This guard is
on every satellite deploy and it costs one call.

**G2 · The pre-state, re-measured by you at D1.** `891 == 786 active + 103 duplicate + 2 archived + 0 orphaned`
[inherited: your 17:0xZ, 18:4xZ and 19:4xZ walks, identical at all three]. FAIL: any other partition — it means the
catalog moved under a premise this order states as fixed.

**G3 · The post-state is exactly three rows moved, and no others.** After D7:
**`891 == 789 active + 100 duplicate + 2 archived + 0 orphaned`** — total unchanged, three rows out of `duplicate`,
and **those three are the three named in D7**. FAIL: any fourth row's status differs in either direction. This is
the guard that catches a restore that took a group instead of a row.

**G4 · No new mark, at any point in the wave.** The `duplicate` population never exceeds 103 between D1 and D7 and
lands at 100. FAIL: any increase, however transient — a dry run that marked is a dry run that lied.

**G5 · The three restores are actually reachable before you attempt them.** `undo_dedupe_group` reverses a mark
using a run record and a `priorStatus`; W2 writes those at mark time and **these three were marked before W2
existed**, so their reversibility comes from D5's seed and nowhere else. **Before D7, establish that all three
named rows are covered by the seeded run.** FAIL — and this is a STOP, not a workaround: if any of the three is not
in the seeded population, **it cannot be restored by the authorized instrument**, that is this desk's problem and
not yours, and a hand-edit is explicitly not the fallback (R-0903-live-cw-5 §2).

**G6 · NUL-free source.** Zero NUL bytes across every tracked `.ts`/`.tsx` under `src/`. [inherited: `0` at your
18:4xZ G1.] FAIL: any.

## 5 · Stop conditions

- **STOP if D1 finds anything different** — moved HEAD, dirty tree, a production commit that is not `9933d2abef`,
  a count that is not seven.
- **STOP on a red build**, with the log and your diagnosis. Do not fix it here.
- **STOP if the backfill's mismatch rate is not near zero.**
- **STOP if any of the three named rows is not reachable by `undo_dedupe_group` after D5.**
- **STOP before any mark.** The dry-run posture survives the deploy intact; that is the whole of
  R-0903-live-cw-4's second half.
- **Nothing else in the catalog is in scope.** Not the 98 pdf-mime marked rows, not the `octet-stream` or
  `image/png` marked rows, not the trailing-space `Michamocha` pair, not the 306 MB of single-row audio, not the
  five `ZZTEST` fixtures — those are `ZZTEST-SWEEP` rev-2, a different order you hold. **They are named here so
  that "while I was in there" has no room to grow.**
- **No `src/` change.** Not the two red emulator tests, not the canonical picker's now-questionable demotion, not
  the two observability defects your ZZTEST return found. All four are reported, none is touched.

## 6 · What is irreversible here, stated plainly

**The push is.** A deployment can be rolled back in Vercel and the previous one is a rollback candidate, so the
serving code is recoverable. **The Firestore writes are not**: `contentHash` values and run records are new data
and can be overwritten, but D7's three status flips are reversed only by re-marking, which nothing in this order
authorizes. That is acceptable because the three rows are invisible to the band under either status, bonded by
nothing, and ruled by Daniel at the keyboard — **and it is written down rather than assumed.**

Claude records; Daniel decides.
