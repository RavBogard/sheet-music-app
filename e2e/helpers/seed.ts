import type { APIRequestContext } from '@playwright/test'

import { mcpCallOrThrow } from './mcp'

/**
 * Setlist + library fixture helpers.
 *
 * All seeding goes through MCP — the in-app UI is deprecated for
 * authoring per the 2026-05-15 MCP-first-authoring pivot. Each helper
 * runs as a *minted test user* (the leader bearer for setlist/track
 * writes, the same bearer for library uploads), so all created data is
 * owned by the test uid and gets cleaned up by `revokeTestAccount`'s
 * cascade.
 *
 * Fixture chart content: a tiny chord-text chart via `save_scraped_chart`.
 * The library treats it as a `.txt` entry, dedup keys off
 * (title, content), and a unique title-per-test-run prevents collision
 * with the curated library. Returned `fileId` flows into
 * `add_track_to_setlist({songId: fileId})` and into the chart-bind
 * picker's `getDb().songs` index (after the consumer's Dexie sync
 * catches up post-login).
 */

export interface SeededTrack {
    /** Track id assigned by add_track_to_setlist. */
    id: string
    title: string
    fileId?: string
}

export interface SeededSetlist {
    setlistId: string
    name: string
    tracks: SeededTrack[]
    publishedAt: string
}

interface TrackSeed {
    title: string
    /** If true, the row is added unbound (no songId) — for chart-bind picker tests. */
    unbound?: boolean
    /** Optional explicit songId to bond. */
    songId?: string
    /** Optional key, e.g. 'G' or 'Am'. */
    key?: string
}

/** Mint a unique fixture chart in the test user's library. */
export async function uploadFixtureChart(
    request: APIRequestContext,
    baseURL: string,
    bearer: string,
    args: { title: string; content?: string },
): Promise<{ fileId: string; title: string }> {
    const content =
        args.content ??
        [
            `[Intro]`,
            `G   D   Em  C`,
            ``,
            `[Verse]`,
            `G       D`,
            `Test fixture lyric line one`,
            `Em          C`,
            `Test fixture lyric line two`,
            ``,
            `[Chorus]`,
            `C   G   D   Em`,
            `b6-perform-uat-suite test chart`,
        ].join('\n')

    const result = await mcpCallOrThrow<{ fileId: string; title: string }>(
        request,
        baseURL,
        bearer,
        'save_scraped_chart',
        {
            title: args.title,
            content,
            collection: 'supplemental',
            // Test runs can collide on title across re-runs; force-bypass
            // dedup so a re-run is idempotent rather than failing on
            // "similar name". The owner is still the test uid, so the
            // duplicate cascades on revoke.
            force: true,
        },
    )
    return { fileId: result.fileId, title: result.title }
}

/**
 * Discover a real curated PDF chart in the production library so a test
 * setlist can bond it. The text fixtures `uploadFixtureChart` mints render
 * through `TextScoreViewer` — they NEVER exercise `react-pdf`. To test the
 * actual iOS/WebKit risk (react-pdf's pdf.js worker rendering a chart), the
 * bonded row must serve real PDF bytes. A bonded curated chart (Drive-id /
 * `upload-*` fileId, no `.txt`/`.xml`/image extension) routes through
 * `toQueueItem`'s default `'pdf'` branch → `PDFViewer`.
 *
 * Returns the first active `application/pdf` row, or an active `*.pdf`-named
 * row if mimeType is unset on a legacy Drive entry. `null` if the library
 * has no PDF (caller should down-grade the react-pdf assertion to a skip).
 *
 * Bonding a curated chart into a test setlist is safe: the chart is owned by
 * the curated library (NOT the test uid), so `revokeTestAccount`'s cascade
 * tears down only the test setlist + its track rows, leaving the shared
 * chart intact. Chart bytes are public-by-design.
 */
export async function findCuratedPdf(
    request: APIRequestContext,
    baseURL: string,
    bearer: string,
): Promise<{ fileId: string; name: string } | null> {
    const res = await mcpCallOrThrow<{
        rows?: Array<{
            fileId: string
            name: string
            mimeType: string | null
            status: string
        }>
    }>(request, baseURL, bearer, 'list_library', { limit: 200 })
    const rows = res.rows ?? []
    const byMime = rows.find(
        (r) => r.mimeType === 'application/pdf' && r.status === 'active',
    )
    if (byMime) return { fileId: byMime.fileId, name: byMime.name }
    const byName = rows.find(
        (r) => r.status === 'active' && /\.pdf$/i.test(r.name),
    )
    return byName ? { fileId: byName.fileId, name: byName.name } : null
}

/**
 * End-to-end seed: create a setlist owned by `leaderBearer`, add tracks,
 * publish to `audience` (default 'band' = admin+band_leader+musician).
 *
 * Each TrackSeed:
 *   - if `unbound: true`, the row is created with no `songId` (chart cell
 *     stays empty — the chart-bind picker UAT then drives the bind).
 *   - if `songId` is provided, bond that library entry.
 *   - otherwise, upload a fresh fixture chart and bond it.
 */
export async function seedPublishedSetlist(
    request: APIRequestContext,
    baseURL: string,
    leaderBearer: string,
    args: {
        name: string
        eventDate: string
        tracks: TrackSeed[]
        audience?: 'band' | 'all'
    },
): Promise<SeededSetlist> {
    const created = await mcpCallOrThrow<{
        id?: string
        setlistId?: string
    }>(request, baseURL, leaderBearer, 'create_setlist', {
        name: args.name,
        eventDate: args.eventDate,
    })
    const setlistId = created.id ?? created.setlistId
    if (!setlistId) {
        throw new Error(
            `create_setlist returned no id field: ${JSON.stringify(created)}`,
        )
    }

    const tracks: SeededTrack[] = []
    for (const seed of args.tracks) {
        let songId = seed.songId
        if (!seed.unbound && !songId) {
            const uploaded = await uploadFixtureChart(request, baseURL, leaderBearer, {
                title: `${seed.title} (b6-fixture ${Date.now()})`,
            })
            songId = uploaded.fileId
        }

        const addArgs: Record<string, unknown> = {
            setlistId,
            title: seed.title,
        }
        if (songId) addArgs.songId = songId
        if (seed.key) addArgs.key = seed.key

        const added = await mcpCallOrThrow<{
            track?: { id: string }
            trackId?: string
            id?: string
        }>(request, baseURL, leaderBearer, 'add_track_to_setlist', addArgs)
        const trackId = added.track?.id ?? added.trackId ?? added.id
        if (!trackId) {
            throw new Error(
                `add_track_to_setlist returned no id: ${JSON.stringify(added)}`,
            )
        }
        tracks.push({ id: trackId, title: seed.title, fileId: songId })
    }

    // Publish. `dryRun: false` to actually flip publishedAt + write the
    // snapshot; audience 'band' so test-musician recipients are included.
    const publishResult = await mcpCallOrThrow<{
        publishedAt?: string
    }>(request, baseURL, leaderBearer, 'publish_setlist', {
        setlistId,
        audience: args.audience ?? 'band',
        dryRun: false,
    })

    return {
        setlistId,
        name: args.name,
        tracks,
        publishedAt: publishResult.publishedAt ?? new Date().toISOString(),
    }
}

/**
 * Seed a LARGE published setlist for the iPad stress probe (`ipad-sweep-stress`).
 *
 * The band runs Perform mode on 6 iPads during a live service; a long
 * Shabbat-morning setlist can exceed 40 rows. This seeds `trackCount`
 * (default 42) lightweight title-only song rows via a single
 * `bulk_add_tracks` call (max 50 rows/call — chunked above that) instead
 * of N+1 `add_track_to_setlist` round-trips. Rows are unbound (no songId)
 * so seeding stays cheap: the large-list probe measures layout / scroll /
 * memory at the device width, NOT chart rendering (that's the bonded
 * `seedPublishedSetlist` path). An optional `bondPdfId` appends one bonded
 * curated-PDF row at the end so an "open a chart inside a 40-row list"
 * sub-probe can target it.
 *
 * All rows are owned by `leaderBearer`'s test uid, so `revokeTestAccount`'s
 * cascade tears the whole setlist down — no 40-track orphan left in prod
 * ([[feedback_sandbox_test_isolation]]).
 */
export async function seedLargeSetlist(
    request: APIRequestContext,
    baseURL: string,
    leaderBearer: string,
    args: {
        name: string
        eventDate: string
        trackCount?: number
        /** Optional curated-PDF library fileId to bond as the final row. */
        bondPdfId?: string
        bondPdfTitle?: string
        audience?: 'band' | 'all'
    },
): Promise<SeededSetlist> {
    const created = await mcpCallOrThrow<{ id?: string; setlistId?: string }>(
        request,
        baseURL,
        leaderBearer,
        'create_setlist',
        { name: args.name, eventDate: args.eventDate },
    )
    const setlistId = created.id ?? created.setlistId
    if (!setlistId) {
        throw new Error(
            `create_setlist returned no id field: ${JSON.stringify(created)}`,
        )
    }

    const count = args.trackCount ?? 42
    const stamp = Date.now()
    const KEYS = ['G', 'D', 'A', 'C', 'Em', 'Am', 'F', 'Bm']
    const rows = Array.from({ length: count }, (_, i) => ({
        title: `iPad Stress Row ${String(i + 1).padStart(2, '0')} — ${stamp}`,
        key: KEYS[i % KEYS.length],
    }))

    const tracks: SeededTrack[] = []
    // bulk_add_tracks caps at 50 rows/call — chunk for safety above that.
    for (let start = 0; start < rows.length; start += 50) {
        const chunk = rows.slice(start, start + 50)
        const res = await mcpCallOrThrow<{
            results?: Array<{ index: number; ok: boolean; trackId?: string }>
        }>(request, baseURL, leaderBearer, 'bulk_add_tracks', {
            setlistId,
            tracks: chunk,
            mode: 'atomic',
        })
        for (const r of res.results ?? []) {
            if (r.ok && r.trackId) {
                tracks.push({ id: r.trackId, title: chunk[r.index].title })
            }
        }
    }

    // Optional bonded curated-PDF row appended at the end.
    if (args.bondPdfId) {
        const pdfTitle = args.bondPdfTitle ?? `iPad Stress PDF — ${stamp}`
        const added = await mcpCallOrThrow<{
            track?: { id: string }
            trackId?: string
            id?: string
        }>(request, baseURL, leaderBearer, 'add_track_to_setlist', {
            setlistId,
            title: pdfTitle,
            songId: args.bondPdfId,
            key: 'C',
        })
        const trackId = added.track?.id ?? added.trackId ?? added.id
        if (trackId) tracks.push({ id: trackId, title: pdfTitle, fileId: args.bondPdfId })
    }

    const publishResult = await mcpCallOrThrow<{ publishedAt?: string }>(
        request,
        baseURL,
        leaderBearer,
        'publish_setlist',
        { setlistId, audience: args.audience ?? 'band', dryRun: false },
    )

    return {
        setlistId,
        name: args.name,
        tracks,
        publishedAt: publishResult.publishedAt ?? new Date().toISOString(),
    }
}
