import { describe, it, expect } from "vitest"
import { shouldInstallNow, type UpdatePolicyInput } from "../update-policy"

/**
 * Unit tests for `shouldInstallNow` — the pure policy gate extracted out of
 * bridge/src/main.ts per bridge-analysis FINDINGS §3 T-A3.
 *
 * The point of having a pure helper at all is testability: main.ts's update
 * surface is Electron-bound and exercised only on the studio machine. This
 * module is where future policy layers (quiet hours, mid-service block,
 * user-busy) will grow; pin the v10.0.6 baseline behavior here so those
 * extensions can't silently regress the install-when-available default.
 *
 * Tests cover:
 *   - no update available → false
 *   - update available + default policy → true
 *   - re-entrancy / idempotency: repeated calls with the same input return
 *     the same answer (the predicate is referentially transparent).
 *   - currentTime is accepted but does not affect the v10.0.6 policy (smoke
 *     test against the signature so future quiet-hours work knows what it's
 *     breaking).
 */

describe("shouldInstallNow (update-policy)", () => {
    describe("no update available", () => {
        it("returns false when updateInfo is null", () => {
            expect(shouldInstallNow(null, Date.now())).toBe(false)
        })

        it("returns false regardless of the clock when updateInfo is null", () => {
            // Sanity: the v10.0.6 policy ignores currentTime, so a null update
            // is false at any clock. Future quiet-hours layers must NOT change
            // this — the absence of an update can never resolve to "install".
            expect(shouldInstallNow(null, 0)).toBe(false)
            expect(shouldInstallNow(null, 1)).toBe(false)
            expect(shouldInstallNow(null, Number.MAX_SAFE_INTEGER)).toBe(false)
        })
    })

    describe("update available + default policy", () => {
        it("returns true when updateInfo is non-null", () => {
            const updateInfo: UpdatePolicyInput = { version: "10.0.7" }
            expect(shouldInstallNow(updateInfo, Date.now())).toBe(true)
        })

        it("returns true for any non-empty version string", () => {
            // Initial policy: presence of an update is sufficient. Version
            // string content does not gate install (semver gating is future
            // work; the electron-updater feed has already accepted the
            // version as upgrade-worthy by the time it reaches this point).
            expect(shouldInstallNow({ version: "10.0.7" }, 0)).toBe(true)
            expect(shouldInstallNow({ version: "11.0.0" }, 0)).toBe(true)
            expect(shouldInstallNow({ version: "10.0.6-beta.3" }, 0)).toBe(true)
        })
    })

    describe("re-entrancy / idempotency", () => {
        it("returns the same answer on repeated calls with the same input", () => {
            // The predicate is pure — calling it twice in a row (e.g. once
            // from update-downloaded and once from a periodic re-evaluation)
            // returns the same result. Pins the referential-transparency
            // contract so future stateful gating goes in main.ts, not here.
            const updateInfo: UpdatePolicyInput = { version: "10.0.7" }
            const now = Date.now()
            const a = shouldInstallNow(updateInfo, now)
            const b = shouldInstallNow(updateInfo, now)
            const c = shouldInstallNow(updateInfo, now)
            expect(a).toBe(true)
            expect(b).toBe(true)
            expect(c).toBe(true)
        })

        it("null-input is also stable across repeated calls", () => {
            expect(shouldInstallNow(null, 1000)).toBe(false)
            expect(shouldInstallNow(null, 1000)).toBe(false)
            expect(shouldInstallNow(null, 1000)).toBe(false)
        })
    })

    describe("currentTime parameter (signature smoke test)", () => {
        it("accepts but ignores currentTime in the v10.0.6 policy", () => {
            // Plumbed through for future quiet-hours / mid-service layers.
            // If a future change makes currentTime semantically relevant,
            // this assertion should be tightened to actually drive behavior.
            const updateInfo: UpdatePolicyInput = { version: "10.0.7" }
            expect(shouldInstallNow(updateInfo, 0)).toBe(true)
            expect(shouldInstallNow(updateInfo, Number.MAX_SAFE_INTEGER)).toBe(true)
            // Negative clock (pathological) still resolves cleanly — predicate
            // has no clock-dependent branch in v10.0.6.
            expect(shouldInstallNow(updateInfo, -1)).toBe(true)
        })
    })
})
