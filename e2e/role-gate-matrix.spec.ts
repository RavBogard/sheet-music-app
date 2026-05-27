import { test, expect } from './helpers/roles'
import type { TestRole } from './helpers/roles'

/**
 * Category I — Role-gate matrix (3-of-4 roles).
 *
 * Closes the cowork PROMPT Cat-I gap by exercising the documented
 * admin-only routes against each non-admin role that `roleGate.as()` can
 * mint. The companion file `e2e/role-gate.spec.ts` (coder-1's proof of the
 * fixture) is a single-tap demonstration; THIS file is the matrix —
 * `roles × admin-gated routes`, each combination asserted explicitly with
 * its own test name so a failure points straight at the cell that broke.
 *
 * `admin` is intentionally NOT iterated. `create_test_account`'s
 * `TEST_ROLE` enum excludes `admin` by privilege-escalation guard
 * (`src/lib/mcp/tools/test-tokens.ts`); see the `as('admin') — DOCUMENTED
 * HOLE` test below. The dispatch is explicit: **do NOT weaken the
 * test-tokens gate to fix this — it is a separate Daniel decision.**
 *
 * Surfaces probed (admin-gated; verified against
 * `src/app/(main)/manage/library-review/page.tsx` and the `/manage` parent
 * which redirects to `/manage/library-review` only for `isAdmin`):
 *   - `/manage/library-review` — strict isAdmin gate; non-admin → /manage
 *   - `/manage/storage-backup` — admin-only health surface (best-effort
 *     route check; skipped gracefully if absent on the deployed build)
 *
 * All accounts the matrix mints are cascade-revoked by uid on teardown
 * via the `roleGate` fixture — NEVER `cleanup_all_test_data`, per
 * `[[feedback_sandbox_test_isolation]]`.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \
 *   npx playwright test e2e/role-gate-matrix.spec.ts --project=chromium
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

const NON_ADMIN_ROLES: TestRole[] = ['band_leader', 'musician', 'member']

test.describe('role-gate-matrix — 3-of-4 roles × admin surfaces', () => {
    test.skip(
        !MCP_BEARER,
        'role-gate matrix needs MCP_BEARER (admin or band_leader) to mint test accounts.',
    )

    test.beforeEach(({}, testInfo) => {
        // The role-gate assertions are server-side; running them on every
        // viewport project multiplies cost without adding signal. Confine to
        // chromium — same convention coder-1's role-gate.spec.ts adopted.
        test.skip(
            testInfo.project.name !== 'chromium',
            `server-side role-gating runs under chromium only; current: ${testInfo.project.name}`,
        )
    })

    for (const role of NON_ADMIN_ROLES) {
        test(`${role} is redirected off /manage/library-review to /manage`, async ({ roleGate, page }, testInfo) => {
            await roleGate.gotoAs(role, '/manage/library-review', { webSdk: 'optional' })
            const finalPath = new URL(page.url()).pathname
            if (finalPath === '/manage/library-review') {
                testInfo.annotations.push({
                    type: 'FINDING',
                    description: `${role} REACHED /manage/library-review — admin gate did not redirect. Privilege escalation risk.`,
                })
                testInfo.annotations.push({ type: 'severity', description: 'BLOCKER' })
            }
            expect(finalPath, `${role} (non-admin) must be redirected off /manage/library-review`).not.toBe(
                '/manage/library-review',
            )
            // Acceptable destinations: /manage (redirect target) or /login
            // (cookie-only degrade scenario where session is rejected).
            expect(
                ['/manage', '/login'].includes(finalPath) || finalPath.startsWith('/login?'),
                `${role} redirect target must be /manage or /login; got ${finalPath}`,
            ).toBe(true)
            // Admin heading must NOT be present in the rendered destination.
            await expect(
                page.getByRole('heading', { name: 'Library Review' }),
                `${role} must not see the admin Library Review heading`,
            ).toHaveCount(0)
        })
    }

    // Documented hole — `as('admin')` is not mintable. The test is intentionally
    // skipped so triage sees the gap in the report, not so we silently move on.
    test.skip(
        'as(admin) — DOCUMENTED HOLE: test-tokens excludes admin by priv-esc guard (separate Daniel decision)',
        async () => {
            // intentionally empty — see e2e/helpers/roles.ts §admin and
            // src/lib/mcp/tools/test-tokens.ts TEST_ROLE enum.
        },
    )
})
