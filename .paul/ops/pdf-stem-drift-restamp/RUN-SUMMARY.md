# Run summary — `pdf-stem-drift-bareStem-fix-and-backfill`

**Lane:** `pdf-stem-drift-bareStem-fix-and-backfill` (Tier 1 β + Tier 0 γ; Path A scoped).
**Coder:** coder-5 (single-owner per `[[feedback_single_owner_destructive_runs]]`).
**Source-of-truth dispatch:** supervisor `msg-pdf-stem-drift-bareStem-fix-and-backfill-001` 2026-05-25T19:30Z.
**Path A ruling:** supervisor `msg-pdf-stem-drift-path-ruling` 2026-05-25T21:00Z (Daniel-ratified).
**Auditor ACCEPT + APPLY-GO:** auditor `msg-from-auditor-reverify-pdf-stem-drift-dryrun-002` 2026-05-25T22:00Z.

## Outcome

### β — algorithm change (Tier 1)

Added trailing-extension strip to `bareStem` in `src/lib/mcp/title-specificity.ts`. Pre-β, names like `"Hodu (Silver).pdf"` produced stem `"hodu pdf"` (extension leaked into the dedup key because `bareStem` only stripped parens/hyphen-composer before normalization). Post-β, the same input produces stem `"hodu"` — restoring parity with the historical write paths that pre-stripped extensions upstream.

Implementation:

```ts
const STRIPPABLE_EXTENSION_RE =
    /\.(pdf|musicxml|xml|mxl|jpg|png|webp|mp3|m4a|wav)$/i

export function bareStem(title: string): string {
    const withoutExtension = title.replace(STRIPPABLE_EXTENSION_RE, "")
    const withoutParens = withoutExtension.replace(/\([^)]*\)/g, "").trim()
    const withoutComposer = withoutParens.split(/\s+-\s+/)[0] ?? withoutParens
    return normalizeStem(withoutComposer)
}
```

Mirror at `scripts/lib/index-name-fields-compute.mjs` updated in lockstep.

Test coverage added:
- `src/lib/mcp/title-specificity.test.ts` — NEW `describe("bareStem", ...)` block with 13 cases (existing-behavior regression × 4 + β extension-strip × 9). All dispatch-specified cases included (`Hodu (Silver).pdf` → `hodu`, `V'Shamru.musicxml` → `v'shamru`, `Adon Olam.mp3` → `adon olam`, `Hashkivenu` → `hashkivenu`, `song.PDF` → `song`, edge `song.pdf.pdf` → `songpdf` — see test docstring for the small dispatch-literal divergence on the edge case).
- `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts` — 11 new β fixtures covering each strippable extension + unknown-extension whitelist guard. Parity test enforces the TS canonical == JS mirror byte-for-byte invariant.

### γ — re-stamp (Tier 0 ops; Path A scoped)

Path A scope-restriction (Daniel ruling 21:00Z): restamp `nameLower` + `stem` + `titleSpecificity` only; `normalizedName` left at its historical-good value. The 233 rows whose `normalizedName`-only drift surfaced in DRY-RUN-001 are deferred to a follow-up lane `recomputeIndexNameFields-normalizedName-pin` (FINDINGS doc authored as part of this ship — see `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`).

| Phase | Mode | scanned | candidates | alreadyStamped | toRestamp / restamped | writeErrors | driftFraction |
|---|---|---|---|---|---|---|---|
| DRY-RUN-001 | dry-run (pre-Path-A) | 625 | 625 | 141 | 484 toRestamp | 0 | 0.7744 |
| DRY-RUN-002 | dry-run (post-Path-A) | 625 | 625 | 374 | 251 toRestamp | 0 | 0.4016 |
| APPLY-001 | apply (single-owner; auditor-cleared) | 625 | 625 | 374 | **251 restamped** | **0** | 0.4016 |
| REDRY-001 | dry-run (idempotency) | 625 | 625 | **625** | **0 toRestamp** | 0 | **0.0** |

Extension distribution of the 251 restamped rows:
`{".pdf": 165, ".mp3": 59, ".wav": 4, ".png": 2, ".m4a": 1, "none": 20}`

Per-field mismatch histo: `{nameLower: 0, stem: 192, titleSpecificity: 121}` — 192 + 121 = 313 mismatch events across 251 rows; 62 dual-field rows (the stem + titleSpecificity combo predicted in the path ruling).

### Spot-check (5 rows, post-APPLY)

Captured at `.paul/ops/pdf-stem-drift-restamp/SPOTCHECK-001.log`. Verified each row's stored `stem`, `titleSpecificity`, and `nameLower` equal the helper recompute:

| docId | name | stored stem | stored ts | nameLower | normalizedName divergence |
|---|---|---|---|---|---|
| `07478587-…` | `Hodu (Silver).pdf` | `hodu` ✓ | `0.5` ✓ | match ✓ | YES — historical preserved (stored `hodusilver`; recompute would write `hodusilverpdf`) |
| `012dd661-…` | `T'Filat Haderech (Friedman).pdf` | `t'filat haderech` ✓ | `1` ✓ | match ✓ | YES — historical preserved (stored `tfilathaderechfriedman`) |
| `upload-046649f0-…` | `Barchu Walkdown` | `barchu walkdown` ✓ | `0.7` ✓ | match ✓ | no — already aligned (no extension) |
| `upload-0e1c11d4-…` | `Nigun # 5` | `nigun 5` ✓ | `0.3` ✓ | match ✓ | no — already aligned |
| `upload-11a3e3a1-…` | `Dodi Li` | `dodi li` ✓ | `0.3` ✓ | match ✓ | no — already aligned |

5/5 PASS. Path A `normalizedName`-preservation guarantee verified on the 2 `.pdf` rows.

## Gate evidence

- targeted vitest (`title-specificity.test.ts` + `index-name-fields-compute-parity.test.ts`): 78/78 GREEN.
- broader non-emulator vitest sweep (`src/lib/mcp` + `src/lib/library`): 465/465 across 28 files GREEN.
- full non-emulator vitest sweep (all 255 test files post-deps-heal): 2732 passed / 78 skipped / 0 failed.
- `tsc --noEmit`: exit 0.
- `next build` (full prod compile + tsc + route trace): exit 0.
- DRY-RUN-002 / APPLY-001 / REDRY-001 / SPOTCHECK-001 against prod (`crcmusiccharts`): all GREEN.

## Phase 3 — Drive-sync poller consistency

Dispatch §Phase 3 asked whether `src/lib/drive-sync/poller.ts:207` strip-extension behavior needed updating. Inspection of current origin/master shows the poller ALREADY routes through `recomputeIndexNameFields → bareStem` (post coder-2 `e100771ce` drive-sync-rename-replace-stem-titlespecificity ship). β propagates automatically; **zero poller edits in this lane**.

`src/lib/chart-heal.ts:287` has its own pre-strip with a broader extension list (`.pdf|.xml|.musicxml|.mxl|.mscz|.mscx|.png|.jpe?g|.gif|.webp|.txt`) — left as belt-and-suspenders. Redundancy with β is harmless (β's list is a strict subset of legitimate chart media; chart-heal's broader list still strips before β sees it, so β's regex is a no-op on those paths; β catches the audio extensions `.mp3|.m4a|.wav` which chart-heal doesn't strip). No edit needed.

## Out-of-scope honored

- ⛔ NO touching `src/lib/library/recompute-index-name-fields.ts` (canonical helper).
- ⛔ NO `library_index` schema or write paths beyond the γ restamp.
- ⛔ NO `bondCorrectionHistory`, `enrichmentStatus`, `collection`, or other non-W-02 fields touched.
- ⛔ NO bridge / monitor / firestore.rules / vercel.json / env changes.
- ⛔ NO `[[project_smart_transposer_is_key_transcriber]]` zone.
- ⛔ NO normalizedName mutations on the 233 historical-good rows (Path A guard enforced via `W02_FIELDS = ["nameLower", "stem", "titleSpecificity"]`).

## Open follow-ups

- `recomputeIndexNameFields-normalizedName-pin` (Tier 1) — queued per supervisor commitment in `msg-pdf-stem-drift-path-ruling`. Pin `normalizedName` derivation in the canonical helper to also strip extensions, then re-stamp the 271 historical-good-but-drifted-from-current-helper rows. FINDINGS doc + suggested PROMPT scaffold authored at `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`.

## Environment notes (for next coder using this worktree-shape)

- `npm ci` in a fresh worktree of master does NOT install transitive deps `@babel/parser`, `@babel/traverse`, `cssstyle` — these are needed by `scripts/audit-touch-targets.ts` (build-time typecheck) and by jsdom's CSS env (vitest). Workaround: `npm install --no-save @babel/parser @babel/traverse cssstyle` after `npm ci` if you hit either MODULE_NOT_FOUND. DO NOT install `@types/babel__traverse` — the file uses `@ts-expect-error` to suppress the default-export interop assertion, and installing the types makes the directive unused (tsc fails differently). Discovered mid-lane; reported in `[[project_worktree_test_harness_node_modules]]` follow-up.
- `sheet-music-app-mcp/node_modules` lost `firebase-admin` during this lane (between 19:50Z and 21:00Z by another coder's session). Junction strategy no longer reliable; per-worktree `npm ci` is the safer default until canonical node_modules stabilize.

## References

- Dispatch: `.coord/inbox/coder-5.md` msg-pdf-stem-drift-bareStem-fix-and-backfill-001
- Path A ruling: msg-pdf-stem-drift-path-ruling
- Auditor ACCEPT + GO: msg-from-auditor-reverify-pdf-stem-drift-dryrun-002
- Own FINDINGS (β+γ analysis): `.paul/research/pdf-stem-drift-backfill/FINDINGS.md` (shipped `10f7f8183`)
- Follow-up FINDINGS: `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`
- Sibling precedent: `scripts/backfill-library-normalizedname.mjs` + `RUN-SUMMARY.md` from own `10f7f8183` ship.
