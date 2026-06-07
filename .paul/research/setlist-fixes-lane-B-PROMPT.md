# Lane B — Bond + metadata review surface (catch wrong/stale bonds before they reach the band)

**Wave:** setlist-fixes (from Shavuot-Yizkor live-session bug report, 2026-05-20)
**Risk tier:** 1 (standard — new read-only tool + additive clone report; no auth/rules surface)
**Base SHA:** `a5fcc3132` (verify against `.coord/shared/master-tip.md`)
**Lane id:** `setlist-fixes-b-bond-review`
**Est:** ~3–4 hr (biggest lane)

Closes **Bug 1 + Bug 4 + UX-7**. These are one cohesive cluster: clones inherit bad bonds
and stale service text silently, and there is no detector for either.

---

## Why

Daniel cloned May 2 → Shavuot Yizkor and the clone carried:
- **Wrong bonds** (Bug 1): "Hallelujah Jam" bonded to a "Tu Bishvat" chart, "Barchu"
  bonded to "Ahava Raba.pdf". `clone-setlist.ts` copies `songId/fileId/fileName` verbatim
  (`COPYABLE_TRACK_FIELDS`, `:94-105`), so a bad bond in the source propagates to every
  descendant with no warning.
- **Stale metadata** (Bug 4): the Torah-service header row "Torah Service — Parashat Emor"
  and serviceNotes carried over from May 2. `clone-setlist.ts:213-221` copies
  `serviceNotes/rabbi/templateType` + every track title verbatim, no flag.
- **No audit** (UX-7): `verify_setlist_charts` only checks byte-health
  (`library-verify.ts` — reachable/missing), NEVER whether the song TITLE matches the bonded
  chart FILENAME. A chart can be perfectly reachable and still be the wrong song.

The existing `flag_bond` / `review_flagged_bonds` / `record_bond_correction` loop
(`bond-corrections.ts`) is **manual** — the agent must already suspect a row. We need an
automatic detector.

## Scope (verified targets)

### 1. NEW tool `review_chart_bonds(setlistId)` — read-only mismatch detector
- New file: `src/lib/mcp/tools/chart-bond-audit.ts` (do NOT edit `library.ts` — keep this
  lane disjoint from Lane D). Register in `registerReadTools` in `index.ts` (model: the
  `verify_setlist_charts` block at `index.ts:1013-1030`), plus an import at the top.
- For each bonded track: load `library_index/{fileId}` and read its **`name`** field — that
  is the raw chart filename (confirmed: `library.ts:319,325-326`). Compare a normalized song
  `title` against the normalized filename.
- **Normalizer:** copy a small 3-line normalizer into this new file (lowercase + NFKD
  diacritic-fold + collapse `[_\s\-]+` to single space + trim). This mirrors `library.ts`'s
  private `normalizeForSearch` (`:269-276`) but stays file-local so you don't touch
  `library.ts` (Lane D owns it). Three duplicated lines is the right call here.
- **Mismatch heuristic:** flag a row when the normalized title and normalized filename share
  too little — start with token-overlap (Jaccard / shared-token ratio over the filename
  stem with extension stripped). Surface a per-row `mismatch: boolean` + `overlapScore` +
  both strings so the agent can walk them with Daniel. Keep the threshold conservative
  (flag obvious "Barchu" vs "Ahava Raba" cases; don't false-positive on "Hineh Ma Tov" vs
  "Hineh_Ma_Tov_Lev.pdf"). Make the threshold a named const with a comment.
- Return shape: reuse the `flag`/review vocabulary from `bond-corrections.ts` where it fits;
  per-row `{trackId, title, fileId, chartFileName, overlapScore, mismatch}` + aggregate
  `mismatchCount`. Read-only, `api` tier, trusted-leader bypass — mirror `verifySetlistCharts`.
- Rich error envelopes only (`richError` from `error-envelopes.ts` — that file is read-only,
  you only IMPORT it).

### 2. `clone_setlist` — surface review candidates on clone — `src/lib/mcp/tools/clone-setlist.ts`
- Keep the verbatim copy (it's correct default behavior). Make the clone **observable**:
  add to `CloneSetlistResult` two non-blocking report fields the agent can act on:
  - `bondReviewCount`: run the same title-vs-filename check from §1 across the cloned rows
    (extract the comparison into a shared helper in `chart-bond-audit.ts` and call it here)
    and return how many rows look mismatched, so the agent prompts Daniel post-clone.
  - `staleMetadataCandidates`: rows whose titles contain occasion-specific tokens
    (parsha names, ISO/short dates, holiday names) + a flag if `serviceNotes` or the setlist
    `name` contains a date/parsha token. Build a small token list (parsha list can be a
    static array; date regex for `\d{4}-\d{2}-\d{2}` and month names). This is a HINT list,
    not a mutation — clone still writes everything verbatim.
- Do NOT change clone's write behavior or its existing return fields — additive only, so
  existing callers/tests stay green.

## Out of scope / hard rules
- Do NOT edit `library.ts` (Lane D), `setlist-write.ts`/`server-tracks-write.ts` (Lane A),
  or `liturgical-templates.ts` (Lane C).
- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`,
  `error-envelopes.ts`.
- Detector is READ-ONLY — it reports mismatches; it does NOT auto-rebond or auto-edit.
  Remediation stays with the existing `swap_chart` / `record_bond_correction` tools.

## Shared-file coordination
- You and **Lane A** (`setlist-fixes-a-unbond`) both edit `index.ts`, disjoint regions
  (A: patch schema ~line 108; you: new `registerTool` ~line 1030 + import ~line 45). Work in
  your own worktree, claim `index.ts` `(worktree-isolated; ship-order coord only)`, HEADS-UP
  Lane A. Ship via the cherry-pick caveat (`master-tip.md` §Narrow-lane); whoever ships
  second cherry-picks onto the first's tip — disjoint regions = conflict-free.

## Tests + ship
- Emulator tests for: `review_chart_bonds` flags an obvious mismatch and passes a clean
  bond; clone returns `bondReviewCount`/`staleMetadataCandidates` correctly; clone's
  existing result fields + write behavior unchanged (regression).
- Gates: `npm run test` (0 fail), `npm run test:emulator` (0 fail),
  `next build --webpack` `SKIP_ENV_VALIDATION=1` (exit 0).
- Push `feat/setlist-fixes-b-bond-review:master`, OVERWRITE `master-tip.md`, SHIP-NOTICE to
  `.coord/inbox/auditor.md` + copy to `supervisor.md`.

## Deployed-surface REPRO (required in SHIP-NOTICE)
Against prod `/api/mcp` with your bearer: build a setlist with one deliberately-wrong bond
(bond a "Barchu" row to a chart whose filename is clearly a different song), call
`review_chart_bonds` and show it flags exactly that row. Then `clone_setlist` a setlist
whose title contains a parsha/date and show `staleMetadataCandidates` surfaces it. Paste both.
