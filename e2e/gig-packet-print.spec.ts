import { test, expect } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { seedPublishedSetlist, type SeededSetlist } from './helpers/seed'
import { mcpCallOrThrow } from './helpers/mcp'

/**
 * b6 — Gig-packet print UAT.
 *
 * Coverage of the band/consumer-facing gig-packet flow. The shipped
 * surface is `generate_gig_packet` (MCP) which writes a merged PDF to
 * Firebase Storage and returns a 10-min v4 signed URL (see
 * `src/lib/mcp/tools/library-download.ts` and decisions.md
 * 2026-05-17T19:15Z F-012). There is NO in-app `/print` route — the
 * `PrintModal` opened from `/perform/setlist/[id]` builds its PDF
 * client-side via `print-generation` and downloads via `Blob`. So the
 * meaningful "gig-packet print view" for an automated UAT is the signed
 * Storage URL.
 *
 * Flow:
 *   1. Mint a test-band_leader (the caller of generate_gig_packet —
 *      anyone may call it but the seed needs a leader anyway).
 *   2. Seed a 2-track setlist with bonded fixture charts.
 *   3. Invoke `generate_gig_packet({setlistId})`.
 *   4. Assert the response carries `downloadUrl`, `pageCount`,
 *      `appendedCount`, and `sizeBytes`.
 *   5. Fetch the signed URL via Playwright's APIRequestContext (no
 *      browser auth — the URL is self-signed).
 *   6. Assert HTTP 200 + `content-type: application/pdf` + non-empty
 *      body + page count ≥ 2.
 *
 * No console-error check — there's no page navigation; this is an
 * API-shape UAT.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \
 *   npx playwright test e2e/gig-packet-print.spec.ts --project=chromium
 *
 * Skips automatically when `MCP_BEARER` is unset.
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

interface GenerateGigPacketResult {
    downloadUrl: string
    storagePath: string
    expiresAt: string
    sizeBytes: number
    pageCount: number
    setlistTitle: string
    packetTitle: string
    trackCount: number
    bondedCount: number
    appendedCount: number
    missingCharts: Array<unknown>
}

test.describe('b6 — Gig-packet print UAT', () => {
    test.skip(!MCP_BEARER, 'b6 gig-packet UAT needs MCP_BEARER env var. Skipped without it.')

    let leaderBearer = ''
    let seeded: SeededSetlist | null = null
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for b6 UAT')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'b6-gig-packet',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        seeded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `b6 GigPacket UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [
                { title: 'b6 Gig Packet Track One' },
                { title: 'b6 Gig Packet Track Two' },
            ],
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('generate_gig_packet returns a signed URL that resolves to a valid 2-page PDF', async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        const packet = await mcpCallOrThrow<GenerateGigPacketResult>(
            request,
            baseURL,
            leaderBearer,
            'generate_gig_packet',
            { setlistId: seeded.setlistId },
        )

        // Shape contract.
        expect(typeof packet.downloadUrl, 'downloadUrl must be a string').toBe('string')
        expect(packet.downloadUrl, 'downloadUrl must look like a signed Storage URL').toMatch(/^https:\/\/.+\?.+(GoogleAccessId|X-Goog-Signature|token=)/i)
        expect(packet.storagePath, 'storagePath must surface for diagnostics').toMatch(/gig-packets?\//)
        expect(packet.pageCount, 'pageCount must be at least 2 (one per bonded track)').toBeGreaterThanOrEqual(2)
        expect(packet.bondedCount, 'bondedCount must echo the seed').toBe(2)
        expect(packet.appendedCount, 'both fixture charts must append cleanly').toBe(2)
        expect(packet.sizeBytes, 'sizeBytes must be positive').toBeGreaterThan(0)
        expect(packet.missingCharts.length, 'no fixture chart should be missing').toBe(0)

        // Signed URL must serve a real PDF.
        const pdfRes = await request.get(packet.downloadUrl)
        expect(pdfRes.status(), 'signed URL must return 200').toBe(200)
        const contentType = pdfRes.headers()['content-type'] ?? ''
        expect(contentType, `content-type must be PDF; got: ${contentType}`).toMatch(/^application\/pdf/i)
        const body = await pdfRes.body()
        expect(body.byteLength, 'PDF body must be non-empty').toBeGreaterThan(0)
        // %PDF- magic header — quick byte-level sanity check.
        const magic = body.subarray(0, 5).toString('utf-8')
        expect(magic, 'PDF must start with %PDF-').toBe('%PDF-')
    })
})
