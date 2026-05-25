/**
 * Load-adjusted wall-clock timing helpers for tests whose assert-windows
 * race a real-time event whose latency depends on CPU/IO availability.
 *
 * Background — three known flake instances all share the same shape: a
 * hard-coded `setTimeout(deadline_ms)` (or `waitFor({ timeout: deadline_ms })`,
 * or `new Promise(r => setTimeout(r, wait_ms))`) where `deadline_ms` is
 * `underlying_event_latency × small_constant_margin` (1.3-1.6×). Solo
 * isolation sits comfortably inside that margin; suite-wide parallel load
 * occasionally exceeds it. See memory `[[feedback_parallel_load_flake_baseline]]`
 * and `.paul/research/assertion-flake-refactor/FINDINGS.md`.
 *
 * `LOAD_FACTOR` multiplies all such windows. Default 1.5 absorbs the worst
 * case observed in this population while keeping baseline runtime growth
 * inside the 20 % gate. Override via `VITEST_LOAD_FACTOR` env (positive
 * finite number); invalid values fall back to 1.5.
 *
 * Read once at module load (process-global; no per-call env lookup).
 *
 * Usage:
 *   await loadAdjustedDelay(120)               // pad a real-time wait
 *   setTimeout(reject, loadAdjusted(8_000), …) // pad a runaway-guard timer
 *   waitFor(cb, { timeout: loadAdjusted(3000) })
 */

const DEFAULT_FACTOR = 1.5

function readLoadFactor(): number {
    const raw = process.env.VITEST_LOAD_FACTOR
    if (!raw) return DEFAULT_FACTOR
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_FACTOR
    return parsed
}

export const LOAD_FACTOR: number = readLoadFactor()

/** Scale a wall-clock millisecond budget by `LOAD_FACTOR`. */
export function loadAdjusted(ms: number): number {
    return Math.ceil(ms * LOAD_FACTOR)
}

/** Promise-based wall-clock delay scaled by `LOAD_FACTOR`. */
export function loadAdjustedDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, loadAdjusted(ms)))
}
