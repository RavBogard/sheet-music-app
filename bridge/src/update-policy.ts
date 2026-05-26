/**
 * update-policy — pure, Electron-free policy gate for the bridge auto-updater.
 *
 * Extracted per bridge-analysis FINDINGS §3 T-A3 ("install-time policy is a
 * pure function of (updateInfo, currentTime); future layers can extend with
 * quiet-hours, user-busy, mid-service gating without touching main.ts").
 *
 * The bridge runs unattended in the system tray on the studio machine and
 * serves live monitor mixes to the band's iPads during Friday-evening /
 * Shabbat-morning services ([[project_shul_cadence]]). Restart-during-service
 * is a P0 incident, so install timing is policy, not reflex. main.ts already
 * defers installs to the next idle window or quit (BR-03); this module is
 * where additional gating layers (quiet hours, user-busy, mid-service block)
 * can grow without touching the Electron wiring.
 *
 * Initial policy (v10.0.6): when an update is available, install it. The
 * idle/quit deferral that protects mid-service is handled BR-03-style in
 * main.ts independently of this predicate.
 */

/**
 * Minimal structural shape of an electron-updater `UpdateInfo` we care about.
 *
 * We deliberately do NOT import `electron-updater`'s `UpdateInfo` type here —
 * doing so would pull Electron resolution into a "pure helper" module and
 * break the Electron-free contract that lets this file be unit-tested under
 * vitest's jsdom environment without an electron stub. The full electron-
 * updater `UpdateInfo` carries more fields (releaseName, releaseNotes,
 * stagingPercentage, files…); none currently feed the policy, so the
 * structural slice below is enough. Extend if/when a future policy layer
 * needs more.
 */
export type UpdatePolicyInput = {
    version: string;
} | null;

/**
 * Decide whether an available update should be installed *now*.
 *
 * @param updateInfo  Latest update descriptor surfaced by electron-updater's
 *                    `update-downloaded` event, or `null` when no update is
 *                    pending. Pass `null` from the "no update" path so the
 *                    function reads symmetrically at both callsites.
 * @param currentTime Wall-clock time at decision moment (ms since epoch).
 *                    Plumbed through so future quiet-hours / mid-service
 *                    gating can be unit-tested deterministically. Unused
 *                    in v10.0.6 initial policy; kept in the signature so
 *                    extending the policy doesn't churn the callers.
 * @returns true when an update is available and policy permits install;
 *          false otherwise (no update, or future policy says wait).
 */
export function shouldInstallNow(
    updateInfo: UpdatePolicyInput,
    currentTime: number,
): boolean {
    // currentTime referenced to preserve signature shape for future quiet-hours
    // layers; intentionally not used in the initial policy.
    void currentTime;

    if (updateInfo === null) {
        return false;
    }

    // v10.0.6 initial policy: an available update is an installable update.
    // The BR-03 idle/quit deferral in main.ts is the safety net that keeps
    // mid-service restarts from happening; this predicate is the upstream
    // gate that future layers (quiet hours, user-busy) will tighten.
    return true;
}
