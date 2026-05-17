import { test, expect } from '@playwright/test'

/**
 * Cycle-1 F-023 — F5 mystery regression UAT.
 *
 * Spec: rename a setlist via MCP, assert the public Perform view's
 * heading updates within 6s (no F5). Mirrors the cowork report's
 * stated close criteria ("MCP rename → heading updates within 6s").
 *
 * The browser path is the same liveSetlist subscription the editor
 * (`/setlists/{id}`) uses (`useSafeFirestoreSync` on `setlists/{id}`
 * in `use-setlist-performance.ts` + the `useLiveQuery(getDb().setlists)`
 * read in `SetlistGrid.tsx:965`). The editor view requires auth, but
 * the data path is shared with Perform; if Perform updates within 6s
 * the editor's bound prop derivation does too.
 *
 * Runs against an arbitrary deployment via PLAYWRIGHT_BASE_URL +
 * PLAYWRIGHT_USE_REMOTE=1. Needs an MCP bearer to drive the rename.
 *
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \
 *   F023_TEST_SETLIST_ID=6b412089-e201-4579-9cc6-dbe4cc42ce3f \
 *   npx playwright test e2e/f023-live-rename.spec.ts --project=chromium
 *
 * Skips automatically when MCP_BEARER is unset so CI / local-dev runs
 * don't fail loudly without credentials.
 */

const SETLIST_ID =
    process.env.F023_TEST_SETLIST_ID ?? '6b412089-e201-4579-9cc6-dbe4cc42ce3f'
const MCP_BEARER = process.env.MCP_BEARER ?? ''
const HEADING_PROPAGATION_BUDGET_MS = 6000

interface UpdateSetlistResponse {
    setlist?: { name?: string }
    error?: string
}

async function mcpCall(
    baseURL: string,
    bearer: string,
    tool: string,
    args: Record<string, unknown>,
): Promise<UpdateSetlistResponse> {
    const res = await fetch(`${baseURL}/api/mcp`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: tool, arguments: args },
        }),
    })
    const raw = await res.text()
    const dataLine = raw.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) throw new Error(`MCP ${tool}: no SSE data frame in response`)
    const envelope = JSON.parse(dataLine.slice('data: '.length))
    const text: string | undefined =
        envelope?.result?.content?.[0]?.text
    if (typeof text !== 'string')
        throw new Error(`MCP ${tool}: missing text payload`)
    return JSON.parse(text) as UpdateSetlistResponse
}

test.describe('Cycle-1 F-023 — live setlist-rename propagation', () => {
    test.skip(
        !MCP_BEARER,
        'F-023 UAT needs MCP_BEARER env var to drive the rename. Skipped without it.',
    )

    test('Perform-view heading reflects an MCP rename within 6s', async ({
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        // Snapshot the original name so we can restore it on the way out
        // (and so we can re-detect renames-back across re-runs).
        const before = await mcpCall(baseURL, MCP_BEARER, 'get_setlist', {
            id: SETLIST_ID,
        })
        const originalName = (before as { name?: string }).name
        expect(
            typeof originalName === 'string' && originalName.length > 0,
            'original setlist name must exist before the test renames it',
        ).toBeTruthy()

        // Use a timestamped probe name — every run is uniquely identifiable
        // and we never collide with the real name.
        const probeName = `F-023-UAT-${new Date()
            .toISOString()
            .replace(/[:.]/g, '-')}`

        try {
            await page.goto(`/perform/setlist/${SETLIST_ID}`, {
                waitUntil: 'domcontentloaded',
            })

            // Wait for the heading to render with the original name so we
            // know the live subscription has caught up before we mutate.
            const heading = page.locator('h1').first()
            await expect(heading).toHaveText(originalName as string, {
                timeout: 15_000,
            })

            // Fire the MCP rename and mark T0 immediately after the write
            // commits (the tool returns post-update, so the Firestore write
            // is durable at this point).
            const renameStart = Date.now()
            const renameResp = await mcpCall(
                baseURL,
                MCP_BEARER,
                'update_setlist',
                { id: SETLIST_ID, name: probeName },
            )
            expect(
                renameResp?.setlist?.name,
                'update_setlist must echo the new name',
            ).toBe(probeName)

            // Poll the heading every 200ms. expect.toHaveText with a tight
            // timeout would do the same job but reports a less precise
            // delta on failure; manual polling lets us log exactly when
            // the propagation landed.
            const deadline = renameStart + HEADING_PROPAGATION_BUDGET_MS
            let observedAt: number | null = null
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const text = await heading.textContent()
                if (text?.trim() === probeName) {
                    observedAt = Date.now()
                    break
                }
                if (Date.now() > deadline) break
                await page.waitForTimeout(200)
            }

            if (observedAt === null) {
                const actual = await heading.textContent()
                throw new Error(
                    `F-023 regression: Perform heading did not update to "${probeName}" within ${HEADING_PROPAGATION_BUDGET_MS}ms. Last observed text: "${actual?.trim() ?? '<empty>'}". The parent-doc onSnapshot listener at setlists/{id} is not propagating to the live UI.`,
                )
            }

            const latencyMs = observedAt - renameStart
            // eslint-disable-next-line no-console
            console.log(
                `[F-023 UAT] heading propagated in ${latencyMs}ms (budget ${HEADING_PROPAGATION_BUDGET_MS}ms)`,
            )
            expect(latencyMs).toBeLessThanOrEqual(HEADING_PROPAGATION_BUDGET_MS)
        } finally {
            // Restore the original name on every exit path so the test is
            // re-runnable and we don't leave production data in a probe state.
            try {
                if (typeof originalName === 'string' && originalName.length > 0) {
                    await mcpCall(baseURL, MCP_BEARER, 'update_setlist', {
                        id: SETLIST_ID,
                        name: originalName,
                    })
                }
            } catch (restoreErr) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[F-023 UAT] failed to restore original name "${originalName}":`,
                    restoreErr,
                )
            }
        }
    })
})
