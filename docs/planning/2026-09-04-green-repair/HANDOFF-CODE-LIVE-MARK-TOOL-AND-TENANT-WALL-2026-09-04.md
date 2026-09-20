# ORDER → `live` (Code): build the single-row mark — the one tool that can write a decision a person made — wall `get_chart_status` to its tenant, then write Daniel's mark and prove it survives the next sweep

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0904-live-cw-2** §2 (the tool's shape, fixed there and not re-opened here) · **R-0904-live-cw-6**
(a human decision must be STABLE under later sweeps, and the stability is PROVEN; the tenant wall; the rollback
line retired) · **R-0903-live-cw-8** (Daniel's mark itself, decided 2026-09-03 21:4xZ and unspent since) ·
R-0903-live-cw-7 · R-0903-live-cw-2 §4 · R-0903-live-cw-4 · R-0902-vision-3 / rule 7 · rules 1, 4, 5, 8 addendum,
11, 18.
**AMENDED (1) 2026-09-04 02:2xZ by `live-cw`, under `R-0904-live-cw-7` and `R-0904-live-cw-8`.** **Two tracks
added and one of them is the most important thing in this order.** **M2b: `dedupe_library` must REFUSE
`forceScore` together with `force`** — this desk ran the fuzzy plan before ruling on it, and **it would have
hidden five of the eight SATB rehearsal tracks across two `Avinu Malkeinu` settings, four days before Rosh
Hashanah**, plus `Haftarah Blessings` behind `Torah Blessings` and `Kedusha Am` behind `Kedusha Em`. **M0: push
the `FIXTURE-PURGE` manifest to a records branch FIRST** — it is the only reconstruction path for `257`
permanently deleted rows and it is currently on one disk. `NEXT:` re-cut below.
Status: **DONE — closed by `RETURN-CODE-LIVE-MARK-TOOL-2026-09-04.md` (M0–M6 complete, shipped `107b9618d9`).** **This order adds the program's first authorized WRITE path to the catalog, and then
uses it exactly once.** Two commits, one deploy, then one mark.
Verified-against: `95cab8bbe0` [inherited: your 01:1xZ row — production serving it since 2026-09-04T01:05:01Z].
**Re-verify by content before the first edit.**
Tier: CLOSED — the mark's post-state is exact and named per row.
NEXT: M0 push the purge manifest to a records branch → M1 the tool → M2 the tenant wall → M2b refuse
`forceScore`+`force` → M3 one deploy → M4 write Daniel's mark → M5 prove it survives a sweep → M6 return.

---

## 1 · What this closes

`R-0903-live-cw-8` is the only decision Daniel has made in this program that the system has been unable to carry
out. It has waited since 21:4xZ, through three orders, **not because anyone reconsidered it but because no tool
could write one row's status and leave a record that reverses it.** `R-0904-live-cw-2` refused the two-tool
composition that would have faked one. This order builds the real thing and then spends it.

**And E1 did not make this unnecessary, which is worth stating because it nearly looks as though it did.** The
surviving Mizmor group is the two mp3s alone — properly grouped, byte-identical — and the canonical picker still
keeps `1VuMq83_0W8ya9…` on earliest-upload, **the row Daniel decided to hide** [inherited:
`RETURN-CODE-LIVE-SRC-BATCH-2026-09-04.md` E1]. **The picker is a default for rows nobody has decided; it is not
where a decision lives** (`R-0904-live-cw-6` §1).

## 2 · M1–M6 · The wave

- [ ] **M0 · Push the `FIXTURE-PURGE` artifact commits to a NON-`master` records branch, before anything else in
      this order.** `R-0904-live-cw-8`: the manifest (`c1a16b1adf`) and the evidence commit (`8133cd31f8`) are the
      **only reconstruction path for `257` permanently destroyed rows**, and they are sitting unpushed in a working
      tree on a mount this family has already ruled untrustworthy for git state (rule 8 addendum). **You were right
      not to push them to `master` in a wave whose order forbade deploying.** A records branch replicates the bytes
      without promoting a build: `master` untouched, production untouched, `R-0903-live-cw-4`'s posture unbroken.
      **If the remote or the deploy configuration does not permit a non-`master` push, STOP and return that** — it
      is a finding about our own infrastructure, not an obstacle to route around. Do not squash, rewrite or
      re-create those two commits; push them as they are.

- [ ] **M2b · `dedupe_library` REFUSES `forceScore` together with `force`** (`R-0904-live-cw-7` §2). One condition,
      its own commit. A call carrying both returns a refusal naming the ruling; `dryRun: true` with `forceScore` is
      untouched and stays fully available, because the diagnostic is worth keeping.
      **Why, measured, so the commit message can carry it:** the fuzzy plan at `0.85` proposes `14` groups and `17`
      marks, and **about half of them would hide real, distinct music** — `Torah Blessings (Cantillation)` keeping
      and **`Haftarah Blessings (Cantillation)` marked**; `Kedusha Em` keeping and **`Kedusha Am`** marked;
      `Aleinu Shur melody (high voice)` keeping and **`(low voice)`** marked; **`Avinu Malkeinu Janowski D minor
      (Soprano)` keeping while ALTO, TENOR and BASS are all marked**; **`Avinu Malkeinu_traditional_Em_Alto`
      keeping while TENOR and BASS are marked** [measured: `dedupe_library {forceScore: 0.85, dryRun: true}`,
      `live-cw`, 2026-09-04 02:2xZ]. **The catalog encodes voice part, key and liturgical section as short
      suffixes, and Levenshtein reads exactly those as noise — the score is high BECAUSE the titles are careful.**
      No threshold repairs that; it only moves which real chart gets hidden.

- [ ] **M1 · The single-row mark. Shape per `R-0904-live-cw-2` §2, restated so you need not hold two documents
      open.** One row, addressed by `fileId`. An explicit target status, always passed, never defaulted.
      **No predicate, no sweep, no threshold — a human mark is not a search result.** The run record is written
      **BEFORE** the status flip. **`priorStatus` is READ inside that same operation, off the row itself, and
      the caller has no parameter with which to supply it** — the field the caller cannot pass is the field that
      cannot be invented. The record carries the decision's own provenance: that a person decided it, the ruling
      id, and the real timestamp — **never a back-dated or borrowed `runId`.** `undo_dedupe_group` must restore
      the row from that record the moment it exists.
      **A human mark must not be able to be mistaken later for a sweep result.** Give the record whatever field
      makes that unambiguous to a future reader who finds it cold; a run that a person made and a run the machine
      made must not read alike.
- [ ] **M2 · Wall `get_chart_status` to its tenant, as its own commit** (`R-0904-live-cw-6` §3–4). Scope it
      **exactly as `delete_chart` scopes**: another org's row answers as an absence, in words indistinguishable
      from a genuine absence, decided **before** any other check — the same property `v11-02-03` protects and
      that E5 was careful not to break. The row is already read for E4's index check, so `orgId` is in hand.
      **Severity, so nobody mis-reads this track's urgency: narrow.** A caller who already holds another
      organisation's `fileId` learns byte-reachability and mime. It is fixed because the asymmetry is the defect,
      not because anything is on fire.
      **Its own commit, and the return names which commit reverts which** — M1 and M2 must be independently
      revertible, and the earlier §5 line about read-path and write-path deploys is retired for this case in
      `R-0904-live-cw-6` §5.
- [ ] **M3 · One deploy.** The push is the only path; **a red build never promotes** (`R-0903-live-cw-4`). Name
      the rollback target before pushing. If red: stop and return.
- [ ] **M4 · Write Daniel's mark, once, with the tool you just built.**
      `1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC` (`Mizmor Shiru L'adonai .mp3`) → **`duplicate`**, canonical
      `1d-aXA4WzVjKYv…` (`Mizmor Shiru Ladonai.mp3`). **This OVERRIDES the picker's earliest-upload default and
      that is the whole point of it** — the survivor is the clean-named row that matches the PDF chart of the same
      song, and a trailing space is the shape that forked rows here before. **`1czN_ywRWm2bnjIrnNVg7ad4RyynM_GcR`
      (the PDF) IS NOT IN THIS** and must not appear in any plan this wave produces.
- [ ] **M5 · Prove the decision survives the next sweep (`R-0904-live-cw-6` §2).** After M4, run
      `dedupe_library {forceScore: 0.85, dryRun: true}` and show that **the plan no longer proposes to move either
      Mizmor mp3** — `canonicalStatusRank` should now prefer the `active` twin **by rule rather than by date**.
      **That mechanism is believed, not measured, until this runs.** If the plan still proposes to move either
      row, **STOP: the mark is not stable, and a decision the machine re-litigates on a schedule is not a
      decision.** Do not adjust the mark to satisfy the sweep.
- [ ] **M6 · Return** `RETURN-CODE-LIVE-MARK-TOOL-2026-09-04.md` + a CLOSED board row: the tool's record shape as
      it actually landed, both commit shas and which reverts which, the mark's before/after with the run record
      quoted, M5's dry plan, and the undo dry-run proof from G3.

## 3 · Guards that can fail

**G1 · The standing Rosh Hashanah read, before M4 and after M5.** `list_books` → `shirei-tshuvah` **184 /
`feed`**. FAIL: any other page count or tier.

**G2 · EXACTLY ONE ROW CHANGES STATUS, AND IT IS THE NAMED ONE.** Read the `fileId → status` map before M4 and
after; over the ids present in both reads, the set whose status DIFFERS is **exactly**
`{1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC}`, `active → duplicate` (`R-0903-live-cw-10`'s delta form). **A row present
only in the later read is Daniel authoring: RECORD it, do not fail on it.** FAIL: any other row's status differing
— and in particular any second Mizmor row, or the PDF.

**G3 · THE MARK IS REVERSIBLE THE MOMENT IT EXISTS** — the guard `R-0903-live-cw-8` made a precondition and
`R-0904-live-cw-2` §2 made a property of the tool. Confirm a run record exists carrying that row's
`priorStatus: "active"`, **read from the row and not supplied by you**, and that `undo_dedupe_group`'s dry run
plans a clean restore. **Plan it; do not execute it.** FAIL: no record, or a plan that cannot restore — **and
then the mark comes back off**, as it would have in D7-FINISH.

**G4 · THE `priorStatus` IN THE RECORD WAS READ, NOT PASSED.** The tool exposes no parameter for it. FAIL: a
caller-supplied path exists at all, even unused — an interface that permits the invention is the invention waiting.

**G5 · THE TENANT WALL IS INDISTINGUISHABLE FROM AN ABSENCE.** M2's cross-tenant answer matches the genuine
not-found answer in message and in shape. FAIL: any difference a caller could use to tell them apart.

**G6 · THE PDF IS UNTOUCHED.** `1czN_ywRWm2bnjIrnNVg7ad4RyynM_GcR` reads `active` before and after, and appears in
no plan this wave produces. FAIL: anything else.

**G8 · M0 IS DONE BEFORE ANY EDIT, AND THE REMOTE HAS THE BYTES.** Confirm both commit shas are present on the
records branch at the remote, by reading the remote and not the local ref. FAIL: the push did not happen, or it
went to `master`, or a build was promoted by it. **Committed is not preserved; committed and pushed is**
(`R-0904-live-cw-8` §2).

**G9 · `forceScore` + `force` IS REFUSED, AND THE REFUSAL IS PROVEN BY CALLING IT.** After M3, call
`dedupe_library {forceScore: 0.85, force: true, dryRun: false}` **once** and show it refuses with the ruling named
and **writes nothing**. FAIL: it executes, or it refuses for the wrong reason, or `coverage` shows any write.
**And confirm `dryRun: true` with `forceScore` still returns the full plan** — a diagnostic broken in the course of
gating the marker is a regression, not a fix.

**G7 · THE FIXTURE PURGE IS NOT STARTED HERE.** `HANDOFF-CODE-LIVE-FIXTURE-PURGE-2026-09-04.md` is a separate
order you also hold. FAIL: any `songs`-only row is touched by this wave.

## 4 · Stop conditions

- **STOP if M5's plan still proposes to move either Mizmor row.** The stability is the requirement, not the mark.
- **STOP if the run record does not appear**, and take the mark back off (G3).
- **THE FUZZY EXECUTION QUESTION IS NOW RULED AND THE ANSWER IS NEVER** (`R-0904-live-cw-7`). The only
  `forceScore` call permitted anywhere in this order is G9's single refusal probe, which is designed to write
  nothing, plus `dryRun: true` reads. A fuzzy run is a FINDER; the marker is M1's tool.
- **STOP if M2 turns out to need more than a scope check** — a wider security question does not ride a two-commit
  deploy uninspected.
- **One mark. One.** Nothing else in the catalog is in scope: not the other byte-identical clusters, not the 38
  unreachable-byte rows, not the `257` fixtures.

## 5 · Why this one is worth the ceremony

It is one row's status. The ceremony is not about the row — **it is that this is the first time the program writes
something because a person decided it rather than because a sweep concluded it**, and the record it leaves is the
template for every one after. A record that cannot be told apart from a machine's, or that carries a value the
caller typed, teaches the next reader that decisions and inferences are the same kind of thing in this system.
They are not, and the difference has been the whole subject of the last three sittings.

Claude records; Daniel decides.
