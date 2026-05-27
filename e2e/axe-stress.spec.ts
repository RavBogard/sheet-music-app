import { test, expect } from './helpers/roles'

import { runAxe, summarizeViolations } from './helpers/axe'

/**
 * Category J — Accessibility (axe-core) sweep.
 *
 * Wires `cycle-4/harness/lib/runAxe.mjs` (inline axe injection that evades
 * production CSP) into the stress-run matrix. Sweeps a small set of
 * representative surfaces per run; downgrade-aware so a deployed-build
 * regression on a single surface doesn't block the rest of the sweep.
 *
 * Severity mapping (axe rule impact → cowork severity):
 *   - critical → BLOCKER (any node)
 *   - serious  → HIGH
 *   - moderate → MED
 *   - minor    → LOW
 *
 * The pass bar is INTENTIONALLY low: any violation surfaces as a FINDING
 * annotation (the test still passes — axe regressions are surfaced for
 * triage, not made gating, otherwise every minor copy change blocks
 * `npm run stress`). To make CI gating, pass `--fail-on=HIGH` to
 * `npm run stress`.
 *
 * Surfaces (smallest meaningful set):
 *   - `/login` — public, baseline a11y for the unauth funnel.
 *   - `/` — public landing (redirects to /login for unauth; we sweep
 *     whichever surface lands).
 *   - `/library` — authed band_leader surface; covers the real
 *     authoring affordances `SongChartsLibrary`.
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

function severityFromImpact(byImpact: ReturnType<typeof summarizeViolations>['byImpact']): string {
    if (byImpact.critical > 0) return 'BLOCKER'
    if (byImpact.serious > 0) return 'HIGH'
    if (byImpact.moderate > 0) return 'MED'
    if (byImpact.minor > 0) return 'LOW'
    return 'INFO'
}

function topRulesText(summary: ReturnType<typeof summarizeViolations>): string {
    if (summary.topRules.length === 0) return ''
    return summary.topRules
        .map((r) => `${r.id} (${r.impact ?? 'unknown'}, ${r.nodeCount}× nodes): ${r.help}`)
        .join(' | ')
}

test.describe('axe-stress — accessibility sweep on representative surfaces', () => {
    test('public /login sweep', async ({ page, baseURL }, testInfo) => {
        await page.goto(`${baseURL ?? ''}/login`, { waitUntil: 'domcontentloaded' })
        const result = await runAxe(page, '/login')
        const summary = summarizeViolations(result.violations)
        if (summary.total === 0) return
        testInfo.annotations.push({
            type: 'FINDING',
            description:
                `axe sweep on /login found ${summary.total} violation(s) — ` +
                `critical:${summary.byImpact.critical} serious:${summary.byImpact.serious} ` +
                `moderate:${summary.byImpact.moderate} minor:${summary.byImpact.minor}. ` +
                `Top: ${topRulesText(summary)}`,
        })
        testInfo.annotations.push({ type: 'severity', description: severityFromImpact(summary.byImpact) })
    })

    test('public landing sweep (whatever / resolves to)', async ({ page, baseURL }, testInfo) => {
        await page.goto(`${baseURL ?? ''}/`, { waitUntil: 'domcontentloaded' })
        const result = await runAxe(page, '/')
        const summary = summarizeViolations(result.violations)
        if (summary.total === 0) return
        testInfo.annotations.push({
            type: 'FINDING',
            description:
                `axe sweep on the landing surface (${result.url}) found ${summary.total} violation(s) — ` +
                `critical:${summary.byImpact.critical} serious:${summary.byImpact.serious} ` +
                `moderate:${summary.byImpact.moderate} minor:${summary.byImpact.minor}. ` +
                `Top: ${topRulesText(summary)}`,
        })
        testInfo.annotations.push({ type: 'severity', description: severityFromImpact(summary.byImpact) })
    })

    test('authed /library sweep (band_leader)', async ({ roleGate, page }, testInfo) => {
        test.skip(
            !MCP_BEARER,
            'authed /library axe sweep needs MCP_BEARER (admin or band_leader) to mint a band_leader session.',
        )
        await roleGate.gotoAs('band_leader', '/library', { webSdk: 'optional' })
        // Wait for at least the main heading to ensure the client hydrated;
        // sweeping an in-flight skeleton would flag false-positive violations
        // (no heading, etc.).
        await expect(page.getByRole('heading', { name: /Song Charts|Library/i })).toBeVisible({ timeout: 10_000 })

        const result = await runAxe(page, '/library')
        const summary = summarizeViolations(result.violations)
        if (summary.total === 0) return
        testInfo.annotations.push({
            type: 'FINDING',
            description:
                `axe sweep on /library (band_leader) found ${summary.total} violation(s) — ` +
                `critical:${summary.byImpact.critical} serious:${summary.byImpact.serious} ` +
                `moderate:${summary.byImpact.moderate} minor:${summary.byImpact.minor}. ` +
                `Top: ${topRulesText(summary)}`,
        })
        testInfo.annotations.push({ type: 'severity', description: severityFromImpact(summary.byImpact) })
    })
})
