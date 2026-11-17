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
 * Surface probed: `/manage` (`src/app/(main)/manage/page.tsx`), the
 * band-leader gate — musician and member are redirected to /setlists;
 * band_leader and admin reach it. (This matrix used to probe the admin-only
 * `/manage/library-review`, removed with the AI enrichment review queue; no
 * admin-only page remains.)
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

const NON_LEADER_ROLES: TestRole[] = ['musician', 'member']

test.describe('role-gate-matrix — 4-of-4 roles × the /manage leader gate', () => {
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

    for (const role of NON_LEADER_ROLES) {
        test(`${role} is redirected off /manage`, async ({ roleGate, page }, testInfo) => {
            await roleGate.gotoAs(role, '/manage', { webSdk: 'optional' })
            const finalPath = new URL(page.url()).pathname
            if (finalPath === '/manage') {
                testInfo.annotations.push({
                    type: 'FINDING',
                    description: `${role} REACHED /manage — leader gate did not redirect. Privilege escalation risk.`,
                })
                testInfo.annotations.push({ type: 'severity', description: 'BLOCKER' })
            }
            expect(finalPath, `${role} (not a band leader) must be redirected off /manage`).not.toBe('/manage')
            // Acceptable destinations: /setlists (redirect target) or /login
            // (cookie-only degrade scenario where session is rejected).
            expect(
                finalPath === '/setlists' || finalPath === '/login' || finalPath.startsWith('/login?'),
                `${role} redirect target must be /setlists or /login; got ${finalPath}`,
            ).toBe(true)
        })
    }

    test('band_leader reaches /manage', async ({ roleGate, page }) => {
        await roleGate.gotoAs('band_leader', '/manage', { webSdk: 'optional' })
        expect(new URL(page.url()).pathname, 'band_leader must REACH /manage').toBe('/manage')
        await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible()
    })

    // The 4th cell — admin. Self-skips when the secret is absent (deployment
    // without MCP_ADMIN_TEST_SESSION_SECRET).
    test('admin reaches /manage (positive 4-of-4 cell, via secret-gated session)', async ({
        roleGate,
        page,
    }, testInfo) => {
        test.skip(
            !adminTestSessionAvailable,
            'admin cell needs MCP_ADMIN_TEST_SESSION_SECRET (the secret-gated admin-test-session surface). Set it to enable 4-of-4.',
        )
        await roleGate.gotoAs('admin', '/manage', { webSdk: 'optional' })
        const finalPath = new URL(page.url()).pathname
        if (finalPath !== '/manage') {
            testInfo.annotations.push({
                type: 'FINDING',
                description: `admin session did NOT reach /manage (landed ${finalPath}) — the gate may be over-restrictive OR the admin_test session lacks the admin claim.`,
            })
            testInfo.annotations.push({ type: 'severity', description: 'HIGH' })
        }
        expect(finalPath, 'admin must REACH /manage (not be redirected)').toBe('/manage')
        await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible()
    })
})
