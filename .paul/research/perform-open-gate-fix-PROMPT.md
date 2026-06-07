# Lane: perform-open-gate-fix (coder-2) — make bonded charts open regardless of track type

**Tier 2** (Perform behavior, launch-relevant, ships to prod). Small + surgical. **Mandatory `/ui-ux-pro-max`** for the affordance ([[feedback_ui_ux_skill]]).

## The bug (R1 launch finding, source-confirmed @ origin/master)

`src/components/performance/SetlistRow.tsx` only opens a track's chart when the track is typed `song`:
- line 47: `const hasFile = isSong && !!track.fileId`  (`isSong = !track.type || track.type === "song"`, line 28)
- line 56: `if (isSong && hasFile) { onSongTap() }`

So a track typed `prayer` / `reading` with a **real bonded `fileId`** renders as a dimmed, non-interactive label — the band cannot open its chart in Perform. R1 caught this on tonight's setlist (Barechu + Adonai Sifatai, real PDFs). `isHeader` (line 29 `track.type === "header"`) is already defined.

> **Context — already handled, don't touch data:** the supervisor applied a stopgap DATA fix (re-typed tonight's Barechu + Adonai Sifatai `prayer`→`song`) so tonight works. THIS lane is the durable ROOT-CAUSE fix so every future prayer/reading-with-a-chart opens without per-row data edits. After this ships + verifies, the supervisor reverts those 2 tracks back to `prayer`. You do NOT edit any data.

## The fix (minimal, surgical)

Make a chart openable for any **non-header** track that has a `fileId`:
- line 47 → `const hasFile = !isHeader && !!track.fileId`
- line 56 (open-gate in `handleClick`) → `if (hasFile) { onSongTap() }` (drop the `isSong &&` — `hasFile` already excludes headers)

Verify the invariants hold (add tests):
- **header** → `isHeader` true → `hasFile` false → NOT interactive (unchanged). ✓
- **song + fileId** → opens (unchanged). ✓
- **prayer/reading + fileId** → NOW opens (the fix). ✓
- **any track without fileId** → stays non-interactive (unchanged). ✓
- `isInteractive = hasFile || isLeader` (line 48) then correctly lights up prayer-with-chart for the tap affordance.

Check the rest of the component for any OTHER `isSong`-gated branch that should follow the same logic for an openable non-song chart (e.g. the row's visual "has chart" affordance / chevron / aria so a now-openable prayer row LOOKS tappable — this is the `/ui-ux-pro-max` part: the affordance must match the new behavior, color-not-alone, ≥44px target, aria-label). Do NOT change header rendering or leader behavior. `displayKey` is intentionally `isSong`-only (transpose UI is song-scoped) — leave it.

## Gates / deliverable
- Unit/component test coverage for the 4 invariants above (prayer+fileId opens is the new assertion; header-never-opens + song-still-opens are regression guards).
- `next build` (webpack) exit 0; `check:types`; eslint clean.
- R1's `e2e/perform-ipad-real-setlists.spec.ts` already render-verifies the real setlists — after this fix, prayer-typed bonded charts open irrespective of the data stopgap.
- Cut a FRESH worktree off origin/master (verify tip first — likely `42aee0a0b` or later). Claim `src/components/performance/SetlistRow.tsx`.
- SHIP-NOTICE → `inbox/auditor.md` (Tier 2). **This deploys to prod on push during launch weekend — keep it tight; the deployed-surface check is that Barechu/Adonai (or any prayer+fileId) open in Perform.**

## Definition of done
Fix + tests green + build/types/eslint clean; FF-pushed; master-tip + agents.md updated; SHIP-NOTICE to auditor with the deployed-verify note. Sign `from coder-2`.
