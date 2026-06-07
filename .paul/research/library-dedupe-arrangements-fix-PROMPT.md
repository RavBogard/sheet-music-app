# Library dedupe-by-stem hides arrangements — FIX (coder-2, Tier 2)

**Dispatched by:** supervisor 2026-05-22 · **Approved:** Daniel (rec accepted: stop collapsing different arrangements).
**Type:** frontend bugfix, `src/` only, Tier 2 (ships to PROD, launch weekend).
**Worktree:** cut FRESH off `origin/master`; claim `src/components/library/SongChartsLibrary.tsx`.

## Symptom (Daniel, 2026-05-22)
On the **Library tab**, typing `l'cha` shows only ONE L'Cha Dodi though 5 arrangements
exist; typing a composer (`sephardic`) finds the specific one. Looked like data loss —
it is NOT. All charts serve real bytes; the March B-006 salvage is complete (supervisor
probed `/api/drive/file/<id>` for all 5 → 200 application/pdf, 358KB–752KB). It is a
**display-dedupe** bug.

## Root cause (CONFIRMED by supervisor)
`src/components/library/SongChartsLibrary.tsx`:
- `chartStemKey(name)` (~L58) = `bareStem(name w/o ext, _→space)`. `bareStem` strips the
  composer parenthetical, so "L'Chah Dodi (Friedman)", "(Isaacson)", "(Israeli)",
  "(Sephardic)", "(Zeira) - (Rotenberg)" ALL reduce to stem `l'chah dodi`.
- `dedupeChartsByStem` (~L74) keeps the FIRST row per stem (input is alphabetical →
  Friedman wins) and DROPS the rest.
- Net: a broad query matches all 5 (the Fuse matcher is fine — supervisor reproduced
  `l'cha` → all 5 hit at score 0.019–0.073), dedupe collapses to 1 → 4 arrangements are
  invisible. A distinctive composer query narrows to 1, so it surfaces. Live data confirms
  all 5 carry `stem: "l'chah dodi"`.

Original intent of this dedupe (Cycle-2 UI-003, see the function's comment) was narrow:
collapse a PDF + its MusicXML twin of the SAME chart, and a chart-row vs a duplicate
song-row of the SAME piece. It over-collapses by discarding the disambiguator.

## The fix (Daniel-approved)
Stop collapsing genuinely-different arrangements. Change the DEDUPE KEY only — collapse:
  (a) the same name in different chart formats (`.pdf` + `.musicxml`/`.mxl`/`.xml`/`.txt`/`.chordpro`) → ONE row, and
  (b) identical duplicate names.
Keep different parentheticals (different composers/arrangements) as SEPARATE rows.

Implementation (keep minimal; do NOT change `bareStem` itself — it is used elsewhere):
- Make the dedupe key = filename lowercased, extension stripped, `_`→space, whitespace
  collapsed, trimmed, **KEEPING the parenthetical**. e.g. "L'Chah Dodi (Friedman).pdf" &
  ".musicxml" → `l'chah dodi (friedman)` (collapse); "(Sephardic)" → distinct (kept).
- This intentionally DROPS the old chart-row-vs-song-stem collapse. Acceptable per Daniel:
  two rows beats hiding arrangements. (Quick-check whether that dup still occurs post
  song/library unification; if it produces visible noise, NOTE it — do not expand scope.)

## Tests (REQUIRED — proof, CARL rule 4)
Extend `src/components/library/__tests__/song-charts-library.test.tsx`:
- 5 same-base-title, different-composer charts (real names: L'Chah Dodi Friedman/Isaacson/
  Israeli/Sephardic/Zeira-Rotenberg) → ALL 5 survive dedupe (regression for this bug).
- "Foo (Bar).pdf" + "Foo (Bar).musicxml" → collapse to 1 (format-pair still deduped).
- exact-duplicate name → 1.

## /ui-ux-pro-max
Change is dedup-key LOGIC; no visual/layout change. Run a quick `/ui-ux-pro-max` sanity
pass per standing rule, but do NOT redesign — row UI stays identical.

## Gates (do a real `npm ci` — a node_modules junction false-fails login-bundle-size; see [[feedback_fresh_worktree_gate_setup]])
- the song-charts-library test file GREEN
- `check:types` in sync · eslint clean on touched files
- `next build --webpack` exit 0
- (full unit sweep optional; if run, login-bundle-size is environmental)

## Ship (Tier 2)
- Read `.coord/shared/master-tip.md`; FF cherry-pick onto FRESH `origin/master`; re-run
  gates; `git push origin master` (NOT `master:main`).
- Update `.coord/shared/master-tip.md` + your agents.md row; SHIP-NOTICE → `.coord/inbox/auditor.md`
  (Tier 2); HEADS-UP supervisor inbox.
- rmdir any node_modules junction before teardown.
