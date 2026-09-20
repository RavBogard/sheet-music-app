# HANDOFF → Claude Code sessions — round 3, after Daniel's bindings and census rulings (2026-09-15)

Governance unchanged. Read `RULINGS-INTEGRATION-2026-09-14.md` (all addenda) first. Daniel ruled on the interactive
page "Liturgy Bindings" and said: **everything unmarked is approved at its default.** Cowork compiled the result:

- `CentralReform.live/sheet-music-app/work/liturgy-bindings-confirmed-2026-09-15.json` — per book, `bind[]`
  (title + also-spellings → `bindsTo`, `folio`) and `leaveUnbound[]`. Friday: 39 spellings bind, 4 stay unbound.
  Saturday: 82 bind, 3 stay unbound. Notable explicit calls: all Adonai S'fatai spellings (incl. "Sanctuary
  chords") bind to **Adonai S'fatai** at p.23 / p.70 — the booklet prints it under its setting "Sanctuary", so the
  lookup gains Adonai S'fatai as a moment with Sanctuary as its setting; "Silent Amidah" → The Silent Amidah p.23;
  "Silent Prayer" → Elohai N'tzor p.31 (default, accepted); "Closing Blessing" (Saturday) → **Birkat Kohanim
  concluding p.100**, not the page-less Amidah entry; "Hallelujah Jam" → Psalm 150 p.56; "Sh'ma (Sabra)" → the
  Torah-procession Sh'ma p.83; "Ma tovu / Hinei ma tov" → Mah Tovu p.52, "Ma tovu_Hinei ma tov - trad" → Hineh Mah
  Tov p.53; "Kiddush and Motzi" → Kiddush p.101; "Hakafah — …" → Hakafot p.83. Left unbound: niggunim, Od Yavo
  Shalom Aleinu, Leslie Cohen's Hallelujah, "Niggun → Silent Amidah".
- `work/service-census-rulings-2026-09-15.json` — per family: `refresh` (B'nai mitzvah 6, Shabbat morning 7, Shir
  Shabbat 5 — all census rows kept), `keep` (Friday night 2, Camp Sabra ×2, Special Shabbat 2 — too few to trust).
- Two loose ends: **B'sefer Chayim p.152 on Kol Nidre is correct — leave it.** **Neilah begins 18:00**: set
  `startsAtLocal: "18:00"` on the Neilah setlist so `today.json` orders Yizkor (17:00) before Neilah.

## CentralReform.live — append to `RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`

1. **Apply the bindings** (`propose_liturgy_bindings` → `dryRun:false` with `accept` built from the confirmed file):
   the four templates, and every setlist with `eventDate` ≥ today. History untouched. Where a spelling's `bindsTo`
   is Adonai S'fatai, add that entry to the lookup first (moment: Amidah opening; booklet entry "Sanctuary" is its
   setting). Report counts: rows bound per template / per future setlist.
2. **Neilah** `startsAtLocal: "18:00"` (write via the normal setlist update path; it is David's setlist — a one-field
   change, note it in the RETURN). Re-emit `today.json`; verify Yizkor precedes Neilah `[measured]`.
3. **Firestore templates — the Always rows (A-W3″, second half).** Merge Daniel's Always rows into the Friday
   (`kabbalat-shabbat` / `friday_night` — both, if both are live) and Saturday (`shabbat_morning`) override docs via
   the stage/commit tool; a song slot the template already carries takes the `liturgyRef`, never a duplicate row.
   Stage → show diff in RETURN → commit (Daniel's confirmation for this is the census ruling below: "refresh").
4. **Refresh three templates from the census**: B'nai mitzvah (21 rows), Shabbat morning (16), Shir Shabbat (12) —
   the census rows in census order, with their bound identity; then interleave the Always rows for the family's book
   (b'nai mitzvah inherits Saturday's Always list; Shir Shabbat has none). Leave Friday night, Camp Sabra and Special
   Shabbat templates untouched (Daniel: keep). Use `update_template` / `create_template_from_setlist` as the repo
   already offers; stage → diff → commit; the diff goes in the RETURN.
5. **Bind-on-type**: new rows via `add_track_to_setlist` / `update_track` / browser add-row run the matcher against
   the lookup — bind silently at clear, flag at plausible, leave at low.
6. **`propose_service_frame`** (BIND-NOT-ADD addendum 1) against the settled lookup: booklet-paged entries only,
   Sometimes rows from `template-rows.*.json` are the candidates; stage/confirm/commit; AGENT-GUIDE paragraph.
7. **Part D** — after Daniel moves `OVERLAYS_BASE_URL` to `https://overlays.centralreform.org` and redeploys, verify
   `reconcile_service` still reaches Overlays on the new host `[measured]`; zero rows is expected until a service is
   driven from Overlays.

## Overlays — the CRC domain swap (Daniel, 2026-09-15: the CNAME for CRC is switched)

Michael has not started using Overlays; CRC is cutting over now, on the custom domain from day one. The empty
Rosh Hashanah cue log is expected (nobody drove it) — no investigation. Environment already verified: .live's
`OVERLAYS_*` and Overlays' `CRC_LIVE_*` are set and in use.

Do exactly the swap the repo's own record prescribes (CLAUDE-HANDOFF deploy record for `2075d7e`): after Daniel
confirms the domain is attached on the CRC Vercel project and has set `PUBLIC_BASE_URL=https://overlays.centralreform.org`
and `PUBLIC_ALTERNATE_ORIGINS=https://crc-overlays.vercel.app`, redeploy the **same commit currently serving CRC**
via `scripts/deploy-workspaces.mjs` (CRC only if the script allows; otherwise both, same commit), then run the
four-host probe read-only: `/`, `/access`, `/author`, `/output` 200 on the new host; OAuth issuer and protected
resource on the new host; Google `start` → 303 with `redirect_uri` on the new host; foreign Origin → 403;
`/api/state` with `CONTROL_KEY` 200; the Vercel hostname still answers as itself. Record it as a deploy record.
Then confirm the relay's `ALLOWED_ORIGINS` (already includes the custom origin since `629b407`) admits an output
loaded from the new host `[measured]`. Write `work/handoffs/RETURN-CODE-OVERLAYS-ROUND-3-2026-09-15.md`.

Daniel separately sets `.live`'s `OVERLAYS_BASE_URL=https://overlays.centralreform.org` and redeploys .live; the
.live session verifies `reconcile_service` still reaches Overlays on the new host `[measured]` (a 200 with zero rows
is the expected answer until a service is driven).

## Reader — two small follow-ups (round 2 shipped: `48d064c`, release `09ff9dd3…`)

1. **`CAL` learns Yom Kippur 5787.** The return declined to invent times; they are ruled and on the wire in
   `today.json` (B-W2 + R2-f): Alternative Early Kol Nidre 2026-09-20 17:00; Kol Nidre 20:00; Yom Kippur Morning
   2026-09-21 10:00; Yizkor 17:00; Neilah 18:00 (America/Chicago), stream `https://www.youtube.com/@CentralReformCongregation/live`
   five minutes early. Add them as the fallback the door uses when `today.json` is unreachable; re-point the
   anti-drift guard so the three dated YK volumes now have calendar counterparts.
2. **`tools/sync-books.js` silently reverts `books.json`'s reader-only fields** (`familyLabel`, `serviceOrder`,
   `serviceViews`). Make the full carry merge those fields or refuse; the focused carry already leaves the file
   alone. Land the preserved full carry from `scratchpad/books-worktree-backup/` through the fixed path, assert the
   three fields byte-identical to HEAD, re-stamp, deploy. Note for the corpus lane in the RETURN.

Launch: `Read HANDOFF-CODE-ROUND-3-2026-09-15.md §Reader (this repo); do both items; append to RETURN-CODE-READER-TODAY-2026-09-14.md.`

## Launch prompts

Overlays: `Read docs\planning\2026-09-14-integration\HANDOFF-CODE-ROUND-3-2026-09-15.md §Overlays; wait for Daniel's word that
the domain is attached and the two variables are set; then redeploy the serving commit and run the four-host probe;
write work\handoffs\RETURN-CODE-OVERLAYS-ROUND-3-2026-09-15.md.`

.live (in `sheet-music-app`): `Read ..\HANDOFF-CODE-ROUND-3-2026-09-15.md and the two confirmed files it names in work\;
then the RULINGS addenda. Do the .live section in order, stage → diff → commit where it says so, and append to
..\RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md.`
