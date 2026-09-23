import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { mcpCallOrThrow } from './helpers/mcp'
import { signInAndGoto } from './helpers/roles'
import { seedPublishedSetlist, uploadFixtureChart, type SeededSetlist } from './helpers/seed'
import { installListenTrace, readTrace, type TraceEvent } from './helpers/listen-trace'

/**
 * David's ask 4 (2026-09-22) — swap a chart for tonight on one iPad, and every
 * other iPad on the setlist follows without a reload.
 *
 * Two signed-in ipad-webkit contexts on one setlist: a band leader and a
 * musician. The leader taps Swap on a row and picks another chart; the
 * musician's row shows it within 5 s. The saved tracks are byte-identical
 * before and after. The setlist page says "Tonight: X (planned: Y)". Undo
 * (pick the plan) and Reset to plan both restore the plan on both iPads. A
 * signed-out iPad sees the swap after a reload. A musician has no Swap
 * control.
 *
 * Expiry the day after the service and reconcile_service on a fixture
 * history are covered by unit tests (tonight.test.ts,
 * use-setlist-performance-tonight.test.ts, reconcile-chart-swaps.test.ts):
 * production cannot be moved to tomorrow.
 *
 * Run (against prod, after deploy):
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... npx playwright test e2e/tonight-swap-ipad.spec.ts --project=ipad-webkit
 * Transport comparison: the same with --project=chromium --workers=1.
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''
const IPAD = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }

function chicagoToday(): string {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date())
    const g = (t: string) => p.find((x) => x.type === t)?.value
    return `${g('year')}-${g('month')}-${g('day')}`
}

async function performAs(browser: Browser, baseURL: string, bearer: string, path: string, label = 'page'): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext(IPAD)
    await installListenTrace(ctx)
    const page = await ctx.newPage()
    // Listener failures log as warnings; surface them if the test fails.
    page.on('console', (m) => {
        if (m.type() === 'warning' || m.type() === 'error') console.log(`[${label} ${m.type()}] ${m.text().slice(0, 300)}`)
    })
    await signInAndGoto(ctx, page, baseURL, bearer, path, { webSdk: 'required' })
    // Mount the listeners with the Web SDK session already in place.
    await page.reload({ waitUntil: 'domcontentloaded' })
    return { ctx, page }
}

const rowFor = (page: Page, rowId: string) => page.locator(`[data-testid="perform-row"][data-row-id="${rowId}"]`)

async function tracksSnapshot(request: import('@playwright/test').APIRequestContext, baseURL: string, bearer: string, setlistId: string) {
    const s = await mcpCallOrThrow<{ tracks?: unknown[] }>(request, baseURL, bearer, 'get_setlist', { id: setlistId })
    return JSON.stringify(s.tracks ?? null)
}

/** Acceptance threshold for every propagation. Late delivery is still a failure. */
const THRESHOLD_MS = 5_000
/** Diagnostic window: how long a failure is watched to measure the real delay. */
const OBSERVE_MS = 30_000

type Delivery = { step: string; who: 'leader' | 'musician'; ms: number | null }
type Mark = { step: string; at: number; fileId: string }

/**
 * Wait for a row to show a chart. Returns the delay from `t0`, or null if it
 * never showed within the diagnostic window. Only <= THRESHOLD_MS passes.
 */
async function delivery(page: Page, rowId: string, fileId: string, t0: number): Promise<number | null> {
    try {
        await expect(rowFor(page, rowId)).toHaveAttribute('data-file-id', fileId, { timeout: Math.max(0, t0 + THRESHOLD_MS + OBSERVE_MS - Date.now()) })
        return Date.now() - t0
    } catch {
        return null
    }
}

function logDelivery(d: Delivery) {
    const verdict = d.ms === null ? `FAIL: not shown within ${(THRESHOLD_MS + OBSERVE_MS) / 1000}s` : d.ms <= THRESHOLD_MS ? 'PASS' : `FAIL: late by ${d.ms - THRESHOLD_MS}ms`
    console.log(`[timing] ${d.step}: ${d.who} ${d.ms === null ? 'never' : `${d.ms}ms`} (${verdict})`)
}

/**
 * Per step: when the leader's commit went out and came back, when each page's
 * listen stream carried that rev, and when each page's row showed it. Also any
 * channel error/abort, offline or auth change in the step's window.
 */
function analyze(marks: Mark[], rowId: string, traces: { who: string; ev: TraceEvent[] }[]) {
    const leader = traces.find((t) => t.who === 'leader')!.ev
    const lines: string[] = []
    marks.forEach((m, i) => {
        const end = marks[i + 1]?.at ?? m.at + THRESHOLD_MS + OBSERVE_MS + 5_000
        const inWin = (e: TraceEvent) => e.at >= m.at - 2_000 && e.at < end
        const commits = leader.filter((e) => inWin(e) && e.k === 'req' && e.kind === 'commit' && Array.isArray(e.revs) && (e.revs as number[]).length > 0)
        const commit = commits[commits.length - 1]
        const rev = commit ? Math.max(...(commit.revs as number[])) : null
        const commitEnd = commit ? leader.find((e) => e.k === 'end' && e.id === commit.id) : undefined
        lines.push(`[diag ${m.step}] commitSent=${commit ? commit.at - m.at : 'none'}ms commitEnd=${commitEnd ? `${commitEnd.at - m.at}ms status=${commitEnd.status}` : 'none'} rev=${rev ?? '?'} (commits in window: ${commits.length})`)
        for (const t of traces) {
            const w = t.ev.filter(inWin)
            const arrive = rev === null ? undefined : t.ev.find((e) => e.at >= m.at - 2_000 && e.k === 'chunk' && e.kind === 'listen' && (e.ov as { rev: number | null }[]).some((o) => o.rev === rev))
            const ui = t.ev.find((e) => e.at >= m.at - 2_000 && e.k === 'ui' && e.row === rowId && e.fileId === m.fileId)
            const listenChunks = w.filter((e) => e.k === 'chunk' && e.kind === 'listen')
            const opens = w.filter((e) => e.k === 'req' && e.kind === 'listen').length
            const ends = w.filter((e) => e.k === 'end' && e.kind === 'listen').length
            const other = w
                .filter((e) => ['error', 'abort', 'timeout', 'offline', 'online', 'auth', 'visibility'].includes(e.k))
                .map((e) => `${e.k}${e.kind ? `:${String(e.kind)}` : ''}${e.user !== undefined ? `=${String(e.user)}` : ''}@${e.at - m.at}`)
            const causes = listenChunks.flatMap((e) => e.causes as string[])
            const tcs = listenChunks.flatMap((e) => e.tc as string[])
            const lastChunk = listenChunks[listenChunks.length - 1]
            const ovSeen = listenChunks.flatMap((e) => (e.ov as { rev: number | null }[]).map((o) => `${o.rev}@${e.at - m.at}`))
            lines.push(
                `[diag ${m.step}] ${t.who}: listenArrive=${arrive ? `${arrive.at - m.at}ms` : 'never'} ui=${ui ? `${ui.at - m.at}ms` : 'never'} ` +
                `listenChunks=${listenChunks.length} lastChunk=${lastChunk ? `${lastChunk.at - m.at}ms` : 'none'} ovRevs=[${ovSeen.join(',')}] ` +
                `targetChanges=[${tcs.join(',')}] causes=[${causes.join(',')}] listenReqs open/end=${opens}/${ends} events=[${other.join(',')}]`,
            )
        }
    })
    return lines
}

async function saveTraces(pages: { who: string; page: Page }[], name: string) {
    const fs = await import('node:fs')
    const out: { who: string; ev: TraceEvent[] }[] = []
    for (const { who, page } of pages) {
        const ev = await readTrace(page)
        out.push({ who, ev })
        fs.mkdirSync('test-results', { recursive: true })
        fs.writeFileSync(`test-results/${name}-${test.info().project.name}-${who}.json`, JSON.stringify(ev, null, 1))
    }
    return out
}


test.describe('tonight-only chart swap (two iPads)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin)')
    test.beforeEach(({}, testInfo) => {
        // chromium: the transport comparison (same assertions, Blink's fetch streams).
        test.skip(!testInfo.project.name.startsWith('ipad-webkit') && testInfo.project.name !== 'chromium', 'ipad-webkit or chromium only')
    })

    let leaderBearer = ''
    let musicianBearer = ''
    let setlist: SeededSetlist | null = null
    let alt: { fileId: string; title: string } | null = null
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'band_leader', label: 'tonight-leader' })
        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'musician', label: 'tonight-musician' })
        leaderBearer = leader.token
        musicianBearer = musician.token
        createdUids.push(leader.uid, musician.uid)
        const stamp = Date.now()
        setlist = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `ZZ Tonight Swap UAT — ${new Date().toISOString()}`,
            eventDate: chicagoToday(),
            tracks: [{ title: `ZZ Barchu Plan ${stamp}` }, { title: `ZZ Second Row ${stamp}` }],
        })
        alt = await uploadFixtureChart(request, baseURL, leaderBearer, { title: `ZZ Barchu Tonight ${stamp}` })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    /** Server's overrides state for the row, from the public tracks route. */
    const serverOverride = async (request: APIRequestContext, baseURL: string, rowId: string) => {
        const r = await request.get(`${baseURL}/api/setlists/${setlist!.setlistId}/tracks`)
        const body = (await r.json().catch(() => null)) as { overrides?: { rev?: number; rows?: Record<string, { fileId?: string }> } | null } | null
        return { rev: body?.overrides?.rev ?? null, fileId: body?.overrides?.rows?.[rowId]?.fileId ?? null }
    }
    // Test account uid prefix only; never a token.
    const who = (p: Page) =>
        p.evaluate(() => (window as unknown as { __c7_auth_for_probes__?: { auth?: { currentUser?: { uid?: string } | null } } }).__c7_auth_for_probes__?.auth?.currentUser?.uid?.slice(0, 6) ?? null).catch(() => 'n/a')
    const online = (p: Page) => p.evaluate(() => navigator.onLine).catch(() => 'n/a')

    test('swap on one iPad → the other follows; plan untouched; undo restores', async ({ browser, request, baseURL }) => {
        test.setTimeout(300_000)
        if (!baseURL || !setlist || !alt) throw new Error('seed failed')
        const row = setlist.tracks[0]
        const planned = row.fileId!
        const path = `/perform/setlist/${setlist.setlistId}`
        const before = await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)

        const L = await performAs(browser, baseURL, leaderBearer, path, 'leader')
        const M = await performAs(browser, baseURL, musicianBearer, path, 'musician')
        const deliveries: Delivery[] = []
        const marks: Mark[] = []
        const step = async (name: string, fileId: string, t0: number, order: ('leader' | 'musician')[]) => {
            marks.push({ step: name, at: t0, fileId })
            // Both iPads are timed concurrently: waiting on one must not delay the other's measurement.
            const got = await Promise.all(order.map(async (w): Promise<Delivery> => ({ step: name, who: w, ms: await delivery(w === 'leader' ? L.page : M.page, row.id, fileId, t0) })))
            for (const d of got) {
                deliveries.push(d)
                logDelivery(d)
            }
            const s = await serverOverride(request, baseURL, row.id)
            console.log(`[probe ${name}] server rev=${s.rev ?? 'none'} row=${s.fileId ?? 'none'} leaderUser=${await who(L.page)} musicianUser=${await who(M.page)} online L/M=${await online(L.page)}/${await online(M.page)}`)
        }
        try {
            await expect(rowFor(L.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 30_000 })
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 30_000 })

            // A musician has no Swap control.
            await expect(M.page.getByTestId('tonight-swap-button')).toHaveCount(0)

            // The label names the chart the row shows now, so it changes with each swap.
            const swapFor = (title: string) => L.page.getByRole('button', { name: `Swap ${title} for tonight`, exact: true })
            const pickAlt = async () => {
                await expect(swapFor(row.title)).toBeVisible({ timeout: 15_000 })
                await swapFor(row.title).click()
                const sheet = L.page.getByTestId('tonight-swap-sheet')
                await expect(sheet).toBeVisible()
                await expect(sheet.getByTestId('tonight-swap-planned')).toBeVisible()
                await expect(sheet.getByTestId('tonight-swap-save')).not.toBeChecked()
                await sheet.getByLabel("Search this site's library").fill(alt!.title)
                await sheet.locator(`[data-testid="tonight-swap-candidate"][data-file-id="${alt!.fileId}"]`).click({ timeout: 30_000 })
                const t0 = Date.now()
                await expect(sheet).toBeHidden({ timeout: 10_000 })
                return t0
            }

            // Swap 1: the other iPad follows within 5 seconds, no reload.
            await step('swap1', alt.fileId, await pickAlt(), ['musician', 'leader'])

            // The saved setlist is untouched.
            expect(await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)).toBe(before)

            // A signed-out iPad sees the current tonight state after a reload.
            const anon = await browser.newContext(IPAD)
            try {
                const ap = await anon.newPage()
                await ap.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
                await expect(rowFor(ap, row.id)).toHaveAttribute('data-file-id', alt.fileId, { timeout: 30_000 })
                await expect(ap.getByTestId('tonight-swap-button')).toHaveCount(0)
            } finally {
                await anon.close()
            }

            // The setlist page says so.
            const edit = await L.ctx.newPage()
            await edit.goto(`${baseURL}/setlists/${setlist.setlistId}`, { waitUntil: 'domcontentloaded' })
            await expect(edit.getByTestId('tonight-edit-note').first()).toContainText(
                `Tonight: ${alt.title} (planned: ${row.title})`,
                { timeout: 30_000 },
            )
            await edit.close()

            // Undo = pick the plan in the same sheet.
            await swapFor(alt.title).click()
            await L.page.getByTestId('tonight-swap-planned').click()
            await step('undo', planned, Date.now(), ['leader', 'musician'])

            // Swap 2.
            await step('swap2', alt.fileId, await pickAlt(), ['musician', 'leader'])

            expect(await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)).toBe(before)
        } finally {
            const traces = await saveTraces([{ who: 'leader', page: L.page }, { who: 'musician', page: M.page }], 'tonight-trace-propagation')
            for (const l of analyze(marks, row.id, traces)) console.log(l)
            await L.ctx.close()
            await M.ctx.close()
        }
        const late = deliveries.filter((d) => d.ms === null || d.ms > THRESHOLD_MS)
        expect(late, `propagations over ${THRESHOLD_MS}ms`).toEqual([])
    })

    // Independent of the swap test: it sets up its own override, so a swap
    // failure above cannot skip it (a failed test restarts the worker, which
    // re-runs beforeAll with fresh accounts and setlist).
    test('reset to plan: leader and musician each return to the plan within 5 s', async ({ browser, request, baseURL }) => {
        test.setTimeout(240_000)
        if (!baseURL || !setlist || !alt) throw new Error('seed failed')
        const row = setlist.tracks[0]
        const planned = row.fileId!
        const path = `/perform/setlist/${setlist.setlistId}`
        const before = await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)

        const L = await performAs(browser, baseURL, leaderBearer, path, 'leader-r')
        const M = await performAs(browser, baseURL, musicianBearer, path, 'musician-r')
        const deliveries: Delivery[] = []
        const marks: Mark[] = []
        try {
            await expect(rowFor(L.page, row.id)).toBeVisible({ timeout: 30_000 })
            await expect(rowFor(M.page, row.id)).toBeVisible({ timeout: 30_000 })

            // A test-owned override, unless this test's setlist already has one.
            let s = await serverOverride(request, baseURL, row.id)
            if (s.fileId !== alt.fileId) {
                const swapBtn = L.page.getByRole('button', { name: `Swap ${row.title} for tonight`, exact: true })
                await expect(swapBtn).toBeVisible({ timeout: 30_000 })
                await swapBtn.click()
                const sheet = L.page.getByTestId('tonight-swap-sheet')
                await sheet.getByLabel("Search this site's library").fill(alt.title)
                await sheet.locator(`[data-testid="tonight-swap-candidate"][data-file-id="${alt.fileId}"]`).click({ timeout: 30_000 })
                const t0 = Date.now()
                await expect(sheet).toBeHidden({ timeout: 10_000 })
                marks.push({ step: 'setup-swap', at: t0, fileId: alt.fileId })
                await expect.poll(async () => (await serverOverride(request, baseURL, row.id)).fileId, { timeout: 15_000 }).toBe(alt.fileId)
                s = await serverOverride(request, baseURL, row.id)
            }
            console.log(`[probe reset-setup] server rev=${s.rev} row=${s.fileId}`)
            expect(s.fileId, 'server holds the test override').toBe(alt.fileId)
            // Both iPads must show the override first. Setup, not acceptance: up to 35 s.
            for (const [w, p] of [['leader', L.page], ['musician', M.page]] as const) {
                const ms = await delivery(p, row.id, alt.fileId, Date.now())
                console.log(`[setup] ${w} shows the override: ${ms === null ? 'NO, so reset on this iPad cannot be checked' : `yes (${ms}ms wait)`}`)
                expect(ms, `${w} shows the override before reset`).not.toBeNull()
            }
            await expect(L.page.getByTestId('tonight-reset')).toBeVisible({ timeout: 10_000 })

            await L.page.getByTestId('tonight-reset').click()
            const tR = Date.now()
            marks.push({ step: 'reset', at: tR, fileId: planned })
            const got = await Promise.all(([['leader', L.page], ['musician', M.page]] as const).map(async ([w, p]): Promise<Delivery> => ({ step: 'reset', who: w, ms: await delivery(p, row.id, planned, tR) })))
            for (const d of got) {
                deliveries.push(d)
                logDelivery(d)
            }
            const after = await serverOverride(request, baseURL, row.id)
            console.log(`[probe reset] server rev=${after.rev} row=${after.fileId ?? 'none'} leaderUser=${await who(L.page)} musicianUser=${await who(M.page)} online L/M=${await online(L.page)}/${await online(M.page)}`)
            expect(after.fileId, 'server override cleared').toBeNull()
            await expect(L.page.getByTestId('tonight-reset')).toHaveCount(0, { timeout: 5_000 })
            expect(await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId), 'saved plan byte-identical').toBe(before)
        } finally {
            const traces = await saveTraces([{ who: 'leader', page: L.page }, { who: 'musician', page: M.page }], 'tonight-trace-reset')
            for (const l of analyze(marks, row.id, traces)) console.log(l)
            await L.ctx.close()
            await M.ctx.close()
        }
        const late = deliveries.filter((d) => d.ms === null || d.ms > THRESHOLD_MS)
        expect(late, `reset propagations over ${THRESHOLD_MS}ms`).toEqual([])
    })
})
