# HANDOFF → Claude Code sessions — continuation after the 2026-09-15 sitting

Written 2026-09-15 by the Cowork session (Fable) that sat with Daniel. Order of record for each repo stays the
2026-09-14 PLAN; this file lifts the STOPs, adds Ruling 8, and says what each session does first. Governance as
before: you are executor and your own producer; merge to `master` (.live) / `main` when green; deploy to
production without asking when green; write your own RETURN. Only Daniel worries about dates.

Read first, in every repo: `RULINGS-INTEGRATION-2026-09-14.md` — the **Addendum 2026-09-15** at the bottom
(Ruling 8: which books are real; A-W2 confirmed; duplicate stems merge; Part C option 1; B-W2 done).

## What Ruling 8 means for code

Shirei Tshuvah is the only released volume and covers Rosh Hashanah only. `shabbat-maariv` and
`shabbat-shacharit` are alpha drafts: their **unit ids are identity**, their **folios are never published**.
Legacy CRC booklets (`crc-friday`, `crc-saturday`, `crc-machzor-2008`) govern page numbers on every service.
Yom Kippur 5787 (Kol Nidre 2026-09-20, YK 2026-09-21) has **no Shirei volume and no .live pagemap**: the reader
and Overlays must fall back to the legacy machzor path and must never surface a Shabbat draft. **Every session
below checks that behaviour first**, before its own work, and records what it found.

---

## 1 · CentralReform.live (`C:\Users\dsbog\CentralReform.live\sheet-music-app`, branch `claude/integration-2026-09-14` → `master`)

Confirmed inputs now on disk:
- `src/data/templates/fixed-liturgy.{crc-friday,crc-saturday,shabbat-maariv,shabbat-shacharit}.json` — rows in
  confirmed service order (identical order in the two files of a service), each row `{label, type, fixed,
  liturgyRefs{book:{unitId?, folio}}}` exactly as A-W2 specified, plus header fields (`note`, `bookletEntryNotes`,
  `openOrderQuestions`) the merge may ignore. A row lacking a ref for a book clones page-less in that book.
- `work/fixed-liturgy-rulings-2026-09-15.json` — Daniel's raw rulings, for provenance.

Do, in order:
0. **HHD check.** With the published YK setlists (`kol-nidre`, `kol-nidre-alt`, `yom-kippur-morning`, `yizkor`,
   `neilah`), confirm what `/today.json` will emit on the 20th/21st: `book` must be a legacy book or absent, never a
   Shabbat draft; `startsAt` must come from the congregation services written 2026-09-15 (Kol Nidre 20:00,
   alt 17:00, YK morning 10:00, Yizkor/Neilah 17:00 America/Chicago). Record `[measured]`.
1. Fix the known red `registry.test.ts` (folio 145 vs pages 144) — a data or assertion correction, not an exclusion.
2. A-W3 → A-W6 per the PLAN, from the confirmed files. Fixed rows hidden from Perform mode by default (Ruling 2).
   Draft-feed folios must not reach any public surface (Ruling 8) — if `cloneSetlistFromTemplate` would write a
   `shabbat-maariv`/`shabbat-shacharit` folio into a setlist row, that is fine internally, but nothing that emits to
   today.json / the reader / Overlays may publish it. Add a test that pins this.
3. **Part C, option 1**: merge `codex/reliability-batch-20260906` into the integration branch, resolve the three
   conflicts (`firestore.rules` with care — read every changed rule and say in the RETURN what each widens or
   narrows), full gate, deploy with `READER_PUBLIC_CHARTS_ENABLED` unset/false. Verify select/chart return 404 or
   403 in production, never bytes. Then update `C:\Users\dsbog\shireishabbat\ops\tasks\CHARTS-001.json`: correct the
   SHA evidence (the merge commit on `master`, not `4e2114f7`), status per the task vocabulary for "code landed,
   switch off, approval pending Daniel", rev +1.
4. Part D: once Daniel sets `OVERLAYS_BASE_URL` / `OVERLAYS_HISTORY_TOKEN` (his to do), verify `/api/history` reads
   and the as-performed reconcile against a test setlist. If the vars are not set yet, leave D dark and say so.
5. Part E stays blocked on the shireishabbat rebuild at the press pin (see §2). Do not move the pin from this repo.

Append to `..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`. Deploy after A-W6 and after Part C.

## 2 · shireishabbat (`C:\Users\dsbog\shireishabbat`, worktree `shireishabbat-moments`)

Do, in order:
0. **HHD check.** Confirm no build, feed or `dist-app/` artifact presents `shabbat-*` as a book for 2026-09-20/21,
   and that the machzor path (`crc-machzor-2008` in .live's registry; Shirei Tshuvah for RH only) is what any
   consumer would resolve. Also confirm the §7.1 `build-app.sh` worktree-cleanup bug cannot drop the machzor from a
   rebuild — fix §7.1 first if it can.
1. **Duplicate stems — merge** (Ruling, 2026-09-15): `hoda-ah`+`hodaah`, `ma-ariv-aravim`+`maariv-aravim`,
   `mi-shebeirach`+`mi-shebeirach-healing`, `kdushah`+`kedushah`. One stem each; you choose the survivor (prefer the
   spelling the feed unit ids already use — `hodaah`, `maariv-aravim`, `mi-shebeirach-healing`, `kedushah`) and record
   the choice in the RETURN and in `liturgy-map/DECISIONS-LOG.md`. The gate must keep passing; the pairs count in
   the census will drop — say by how much.
2. Rebuild `dist-app/` at the press pin `6f61874-LICENSED` (or write a finding explaining why the pin must move; do
   not move it yourself) so .live Part E's `sync:books` accepts `moments-pairs.json`.
3. **Alias batch 1 — confirmed by Daniel 2026-09-15 at the proposed defaults.** `liturgy-map/moment-aliases.json` is
   on disk (25 stems, every printed candidate kept except three dropped as non-names: "Personal Prayer of Mar",
   "Niggun · Concluding", "Niggun · Opening"). Merge it with the next `build/build-app.sh`. Because step 1 merges
   `hoda-ah`→`hodaah` and `mi-shebeirach`→`mi-shebeirach-healing`, the file's keys for those two stems must be carried
   to the surviving stem **before** the producer runs, or it will refuse (by design). Batches 2 and 3 remain a STOP.
   The `kind` mid-stem question (§6.1) remains open; state it again in the RETURN so it is not lost.
4. Update `ops/tasks/MOMENTS-001.json` (still `review`, next: alias batch 1) and leave `CHARTS-001.json` to the
   .live session (§1 step 3) — do not both edit it.

Write `RETURN-CODE-MOMENTS-STEMS-2026-09-15.md` at repo root.

## 3 · Overlays (`C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`)

Do, in order:
0. **HHD check.** Confirm the default "Today's order" and the scan card's book on 2026-09-20/21 resolve to the
   legacy machzor or to nothing, never a Shabbat draft, given `/today.json` (which 404s until a setlist is
   published — handle that path too).
1. **Fix**: `app/access/devices-copy.ts` `readDeviceList` accepts only `companion`/`output`, so a minted
   `history_reader` credential never appears in Paired devices and cannot be revoked from the panel — contradicting
   the cue-log RETURN ("one revoke button on the panel that already exists"). Accept the third kind, keep the label
   "Service history", add the test, deploy web to both congregations.
2. Nothing else. The relay is untouched.

Append to `work/handoffs/RETURN-CODE-CUE-LOG-2026-09-14.md`.

## 4 · Reader (`C:\Users\dsbog\shirei-tshuvah-desktop-reader`, branches `code/reader-integration`, `code/reader-today-main` — local, unpushed)

Do, in order:
0. **HHD check — this is the one that matters this week.** The RETURN flagged that `today.json` outranks a dated
   book on a High Holy Day. Under Ruling 8 there is no Shirei volume for Yom Kippur. Decide and implement what the
   reader shows on 2026-09-20/21 when `today.json` names a YK service with a legacy `book` or none: it must never
   open a Shabbat draft, and it must not lose the Shirei Tshuvah behaviour for Rosh Hashanah. Write down the
   resolution order (today.json → dated book → calendar) as it now stands, with a guard for each branch.
1. The two flags: evening times render `6:00` with no meridiem — render `6:15 pm`-style or 24h, one rule
   everywhere; `chart-reader.js` loads PDF.js from `cdn.jsdelivr.net` — the egress allowlist refuses it, so vendor
   the file (license noted) or keep the chart panel dark; do not leave a silent failure.
2. Push both branches, merge `code/reader-today-main` to the deploy branch, deploy `siddur.centralreform.org`,
   verify the HHD behaviour from step 0 on the live site with a phone project.
3. CHARTS-001 W6 stays deliberately not done (waits on DESKTOP-UX-001).

Append to `RETURN-CODE-READER-TODAY-2026-09-14.md`.

---

## Launch prompts

**.live** (paste in `C:\Users\dsbog\CentralReform.live\sheet-music-app`):
```
Read ..\HANDOFF-CODE-CONTINUATION-2026-09-15.md §1, then the Addendum at the bottom of ..\RULINGS-INTEGRATION-2026-09-14.md,
then ..\PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md Part A W3–W6 and Part C, then CLAUDE.md. You are executor and producer.
Branch claude/integration-2026-09-14; merge to master when green; deploy without asking when green. Start with the HHD
check (§1 step 0), then the folio-145 red, then A-W3..W6 from src/data/templates/fixed-liturgy.*.json, then Part C
option 1. Append to ..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md after every wave; findings, not guesses.
```

**shireishabbat** (paste in `C:\Users\dsbog\shireishabbat`):
```
Read HANDOFF-CODE-CONTINUATION-2026-09-15.md §2, the Addendum at the bottom of RULINGS-INTEGRATION-2026-09-14.md,
RETURN-CODE-MOMENTS-JSON-2026-09-14.md §6–7, then PRODUCER.md. You are executor and producer. Start with the HHD check
and §7.1, then merge the four duplicate stems, then rebuild dist-app at the press pin. Alias batch 1 is confirmed and on disk —
carry its keys through the stem merge before the producer runs. Write RETURN-CODE-MOMENTS-STEMS-2026-09-15.md at repo root.
```

**Overlays** (paste in `C:\Users\dsbog\crc-overlays-vercel`):
```
Read docs\planning\2026-09-14-integration\HANDOFF-CODE-CONTINUATION-2026-09-15.md §3 and the Addendum at the bottom
of docs\planning\2026-09-14-integration\RULINGS-INTEGRATION-2026-09-14.md. Branch codex/product-expansion. HHD check
first, then fix readDeviceList to accept history_reader, test, deploy web to both congregations. Append to
work\handoffs\RETURN-CODE-CUE-LOG-2026-09-14.md.
```

**Reader** (paste in `C:\Users\dsbog\shirei-tshuvah-desktop-reader`):
```
Read HANDOFF-CODE-CONTINUATION-2026-09-15.md §4, the Addendum at the bottom of RULINGS-INTEGRATION-2026-09-14.md,
RETURN-CODE-READER-TODAY-2026-09-14.md, then PLAN-CODE-READER-INTEGRATION-2026-09-14.md. Branches code/reader-integration
and code/reader-today-main are local and unpushed. Start with the HHD resolution (§4 step 0), then the two flags, then
push, merge, deploy siddur.centralreform.org and verify on a phone project. Append to RETURN-CODE-READER-TODAY-2026-09-14.md.
```
