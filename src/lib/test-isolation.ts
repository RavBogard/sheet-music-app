/**
 * Cycle-7 Lane 1 — uid-shape test-isolation derivation.
 *
 * Cross-instance convergence (C7I1-008 + C7I3-002 + Instance-5 headline) showed
 * `isTest` as an opt-in flag is structurally insufficient: callers may forget
 * to set it, or `create_test_account`-minted uids leak past the flag-gate when
 * the owner user-record disappears mid-cleanup. The fix: derive
 * test-ness from the CALLER UID SHAPE so the protection is unforgeable
 * regardless of flag state.
 *
 * `TEST_UID_PREFIXES` matches three families:
 *  - `test-…`           — every `create_test_account`-minted uid (canonical)
 *  - `c<N>i<N>[a]-…`    — cycle-N instance-M [optional sub-tag] cowork probe uids
 *  - `cf<N>-…`          — cycle-N cowork-followup probe uids
 *
 * Match is anchored at the START — a real-prod uid like `firebase-test-account-…`
 * intentionally does NOT trip the gate.
 */

export const TEST_UID_PREFIXES = /^(test-|c\d+i\d+[a-z]?-|cf\d+-)/

export function isTestUid(uid: string | null | undefined): boolean {
    if (!uid) return false
    if (typeof uid !== "string") return false
    return TEST_UID_PREFIXES.test(uid)
}
