import { test, expect } from './helpers/roles'

/**
 * role-gate — smoke proof for the DESIGN §D3 `roleGate` fixture.
 *
 * Demonstrates the "request a role in one line" path the cowork Cat-I gap
 * needed: `roleGate.as(role)` mints a fresh `test-<role>-*` account + sets its
 * session cookie, and `roleGate.gotoAs(role, path)` additionally navigates +
 * wakes the Web SDK. Every minted account is cascade-revoked on fixture
 * teardown (by uid — never `cleanup_all_test_data`).
 *
 * This is intentionally a thin proof, not the comprehensive matrix: the full
 * 4-role authorization matrix (incl. the admin-session blocker documented in
 * `helpers/roles.ts`) is DESIGN Lane C's deliverable. Runs under chromium —
 * the assertions are server-side role gating, not iPad-specific.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/role-gate.spec.ts --project=chromium
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('role-gate fixture — mint-on-demand role sessions', () => {
    test.skip(
        !MCP_BEARER,
        'role-gate fixture proof needs MCP_BEARER (admin or band_leader) to mint test accounts.',
    )

    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'chromium',
            `server-side role-gating proof runs under chromium only; current: ${testInfo.project.name}`,
        )
    })

    test('as(band_leader) mints a session whose role + uid echo the request', async ({ roleGate }) => {
        const session = await roleGate.as('band_leader')
        expect(session.uid, 'minted uid must be test-namespaced').toMatch(/^test-/)
        expect(session.role, 'test-session route must echo the minted role').toBe('band_leader')
        expect(session.bearer, 'a usable MCP bearer must come back').toMatch(/^crl_/)
    })

    test('as(member) mints the third supported role', async ({ roleGate }) => {
        const session = await roleGate.as('member')
        expect(session.uid).toMatch(/^test-/)
        expect(session.role, 'test-session route must echo member').toBe('member')
    })

    test('gotoAs(musician) cookie drives server-side gating → /manage redirect', async ({
        roleGate,
        page,
    }) => {
        // The admin-only /manage/library-review surface redirects any non-admin
        // (musician here) to /manage — proving the fixture's session cookie
        // authenticates the server route end-to-end.
        await roleGate.gotoAs('musician', '/manage/library-review', { webSdk: 'optional' })
        expect(
            new URL(page.url()).pathname,
            'musician (no admin claim) must be gated out to /manage',
        ).toBe('/manage')
        await expect(
            page.getByRole('heading', { name: 'Library Review' }),
            'musician must not see the admin Library Review surface',
        ).toHaveCount(0)
    })
})
