import { test, expect, adminTestSessionAvailable } from './helpers/roles'
import type { TestRole } from './helpers/roles'

/**
 * Category I — Role-gate matrix (now 4-of-4 roles).
 *
 * Closes the cowork PROMPT Cat-I gap by exercising the admin-only routes
 * against each role. The companion file `e2e/role-gate.spec.ts` (coder-1's
 * proof of the fixture) is a single-tap demonstration; THIS file is the
 * matrix — `roles × admin-gated routes`, each combination asserted
 * explicitly with its own test name so a failure points straight at the
 * cell that broke.
 *
 * **4-of-4 (was 3-of-4):** the `admin` row now runs via the secret-gated
 * `/api/auth/admin-test-session` endpoint (Daniel-ratified 2026-05-27).
 * `create_test_account`'s `TEST_ROLE` enum STILL excludes `admin` — that
 * priv-esc guard was deliberately NOT weakened; admin sessions come from the
 * separate secret path instead. The admin row self-skips when
 * `MCP_ADMIN_TEST_SESSION_SECRET` is absent from the harness env (same
 * pattern as the MCP_BEARER skip), so the suite stays green on a deployment
 * where Daniel hasn't set the secret.
 *
 * Surfaces probed (admin-gated; verified against
 * `src/app/(main)/manage/library-review/page.tsx` and the `/manage` parent
 * which redirects to `/manage/library-review` only for `isAdmin`):
 *   - `/manage/library-review` — strict isAdmin gate; non-admin → /manage;
 *     admin → REACHES it (the positive 4th cell).
 *
 * All accounts the matrix mints (incl. the `test-admin-*` session) are
 * cascade-revoked by uid on teardown via the `roleGate` fixture — NEVER
 * `cleanup_all_test_data`, per `[[feedback_sandbox_test_isolation]]`.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \
 *   MCP_ADMIN_TEST_SESSION_SECRET=...   # enables the 4th (admin) cell \
 *   npx playwright test e2e/role-gate-matrix.spec.ts --project=chromium
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

const NON_ADMIN_ROLES: TestRole[] = ['band_leader', 'musician', 'member']

test.describe('role-gate-matrix — 4-of-4 roles × admin surfaces', () => {
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

    // The 4th cell — admin REACHES the admin surface. Self-skips when the
    // secret is absent (deployment without MCP_ADMIN_TEST_SESSION_SECRET).
    test('admin reaches /manage/library-review (positive 4-of-4 cell, via secret-gated session)', async ({
        roleGate,
        page,
    }, testInfo) => {
        test.skip(
            !adminTestSessionAvailable,
            'admin cell needs MCP_ADMIN_TEST_SESSION_SECRET (the secret-gated admin-test-session surface). Set it to enable 4-of-4.',
        )
        await roleGate.gotoAs('admin', '/manage/library-review', { webSdk: 'optional' })
        const finalPath = new URL(page.url()).pathname
        if (finalPath !== '/manage/library-review') {
            testInfo.annotations.push({
                type: 'FINDING',
                description: `admin session did NOT reach /manage/library-review (landed ${finalPath}) — admin gate may be over-restrictive OR the admin_test session lacks the admin claim.`,
            })
            testInfo.annotations.push({ type: 'severity', description: 'HIGH' })
        }
        expect(finalPath, 'admin must REACH /manage/library-review (not be redirected)').toBe(
            '/manage/library-review',
        )
        // The admin Library Review surface must actually render for admin.
        await expect(
            page.getByRole('heading', { name: 'Library Review' }),
            'admin must see the Library Review heading the non-admin roles were denied',
        ).toBeVisible()
    })
})
