import { readFileSync } from 'fs'
import { resolve } from 'path'
import { mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

/**
 * The GATED unit suite — the config behind CI's `Gated Unit Suite` job, which
 * is the required status check on `master` (R-0904-live-cw-21 §2, adopted by
 * R-0904-live-cw-23).
 *
 * It is the ordinary suite MINUS two lists, kept deliberately apart:
 *
 *   1. `ci/gated-suite-exclusions.txt` — the counted TEST DEBT. Remove-only,
 *      guarded in CI by `ci/check-exclusions-remove-only.sh`. A line there
 *      means "this file is red and we have decided not to block on it yet".
 *
 *   2. `ENVIRONMENT_PINS` below — files that are NOT debt. They pass wherever
 *      they can run; they simply do not run in every environment, which makes
 *      the gated number irreproducible. See the block comment on that
 *      constant.
 *
 * Conflating the two would be a real error in both directions: it would
 * overstate the debt by three files that are not broken, and — because the
 * debt list is remove-only — an environment pin could never be lifted without
 * a ruling from Daniel about a test that was never failing.
 *
 * WHY THE BASE EXCLUDES ARE MERGED, NEVER RE-LISTED. `vitest.config.ts`'s
 * `exclude` array carries `**\/*.emulator.test.ts(x)`, which keeps the
 * emulator subset out of any job that has no Firebase Local Emulator Suite
 * running. Re-typing the exclude list here — rather than extending the base's
 * — would silently drop that entry and pull the emulator tests into a job with
 * no emulator, where they fail for a reason that has nothing to do with the
 * gate. `mergeConfig` concatenates arrays, so the base's entries survive and
 * ours are appended.
 *
 * The exclusion-file parse is deliberately dumb: trim, drop blanks, drop `#`
 * comments. No globbing, no path normalisation, no existence check — a typo'd
 * path should silently exclude NOTHING and let the suite go red, which is the
 * safe direction. (A typo that silently excluded everything would be the
 * unsafe one.)
 */
const EXCLUSIONS_FILE = 'ci/gated-suite-exclusions.txt'

/**
 * R-0904-live-cw-21 §3(b) / R-0904-live-cw-16 §4 — the skip-drift pin.
 *
 * MEASURED at `1bb4c775f2`: CI reported `Test Files 2 failed | 344 passed |
 * 9 skipped (355)` and `Tests 3 failed | 4004 passed | 81 skipped (4088)`,
 * where the same commit at the mount reported `2 failed | 347 passed |
 * 6 skipped (355)` and `3 failed | 4007 passed | 78 skipped (4088)`. Exactly
 * three files and three tests. Diffed run-against-run, the three are these,
 * and the difference is a strict superset — nothing skips at the mount that
 * runs in CI.
 *
 * THE CAUSE IS NOT A CI DEFECT. Each of the three opens with
 * `describe.skipIf(!buildPresent)` against `.next/build-manifest.json`
 * (`login-bundle-size.test.ts:55`-`:60`). CI's unit job runs `npm ci` and then
 * vitest, never `next build`, so the artifact is absent and they skip. At a
 * developer's mount they run or skip according to whether someone happened to
 * build recently — so the gated total is a function of leftover state on disk.
 * A required check whose number cannot be reproduced is a check that gets
 * argued with the first time it blocks someone.
 *
 * PINNED RATHER THAN "FIXED", and the alternative was weighed: making the
 * gated job run `next build` first would give CI a stable number, but it makes
 * the required check depend on a full build — duplicating the `Build Check`
 * job that is ALREADY required, roughly doubling the gate's wall-clock — and
 * it still would not settle the mount side, where a developer without `.next`
 * keeps getting the other number. Excluding them makes the subset identical in
 * both environments: EXCLUDED always, never conditionally skipped.
 *
 * NOTHING IS LOST. These three still run in `Unit & Integration Tests`, which
 * executes the whole suite on every push and stays deliberately NOT required —
 * so the bundle-size regressions are still watched wherever a build exists.
 * Only the required check's arithmetic becomes reproducible.
 *
 * This list shrinks the day these tests stop depending on a build artifact.
 * It is NOT the debt list and must not be merged into it.
 */
const ENVIRONMENT_PINS = [
    'src/__tests__/login-bundle-size.test.ts',
    'src/__tests__/login-full-payload-size.test.ts',
    'src/__tests__/login-import-graph-regression.test.ts',
]

export function readExclusions(file = EXCLUSIONS_FILE): string[] {
    return readFileSync(resolve(__dirname, file), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
}

const debt = readExclusions()

// Printed on every run so the gated number is never quoted without the debt
// that produced it (R-0903-live-cw-11: every guard reports its denominator),
// and so the two lists stay visibly distinct in the log.
console.log(
    `[gated-suite] test debt — ${debt.length} file(s) from ${EXCLUSIONS_FILE}:\n` +
        debt.map((f) => `  - ${f}`).join('\n') +
        `\n[gated-suite] environment pins — ${ENVIRONMENT_PINS.length} file(s) (build-artifact dependent, NOT debt):\n` +
        ENVIRONMENT_PINS.map((f) => `  - ${f}`).join('\n'),
)

export default mergeConfig(baseConfig, {
    test: {
        exclude: [...debt, ...ENVIRONMENT_PINS],
    },
})
