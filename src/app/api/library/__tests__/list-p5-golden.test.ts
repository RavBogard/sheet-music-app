import { beforeAll, describe, expect, it, vi } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'
import { P5_FIXTURE_INDEX } from '@/lib/library/__tests__/p5-fixture'

/**
 * Multi-tenant phase 5 — GOLDEN for the pickers' and library page's server
 * input, /api/library/list, per host tenant. Captured on unchanged code
 * (9e0c6fac). With shared collections off (every row visible only to its
 * owner, or no visibility stamp yet) the output must stay byte-identical; the
 * only field phase 5 may add is `ownerOrgId`, stripped below.
 */
type Doc = { id: string; data: () => Record<string, unknown> }
let docs: Doc[] = []
const chain: Record<string, unknown> = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    startAfter: vi.fn(() => chain),
    get: vi.fn(async () => ({ docs, empty: docs.length === 0 })),
    doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
}
vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => ({ collection: vi.fn(() => chain) })),
    verifyIdToken: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn(async () => null) }))

let GET: typeof import('@/app/api/library/list/route').GET
beforeAll(async () => {
    const { verifyIdToken } = await import('@/lib/firebase-admin')
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'user-1',
        email: 'user@example.com',
        role: 'musician',
        isAdmin: false,
        isBandLeader: false,
        isMusician: true,
        isMember: true,
    } as never)
    GET = (await import('@/app/api/library/list/route')).GET
})

function strip(files: Array<Record<string, unknown>>) {
    return files.map(({ ownerOrgId: _o, ...rest }) => rest)
}

/** Sorted by name, as the route's orderBy('name') would return them. */
export function fixtureDocs(extra: (id: string) => Record<string, unknown> = () => ({})): Doc[] {
    return Object.entries(P5_FIXTURE_INDEX)
        .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)))
        .map(([id, r]) => ({ id, data: () => ({ ...r, ...extra(id) }) }))
}

describe('P5 golden — /api/library/list per host tenant', () => {
    it('captures every host × collection × status combination', async () => {
        docs = fixtureDocs()
        const out: Record<string, unknown> = {}
        for (const host of ['crc', 'brotherslazaroff']) {
            for (const q of ['all=true', 'all=true&collection=core', 'all=true&collection=nava', 'all=true&collection=uploads', 'all=true&collection=supplemental', 'all=true&collection=all', 'all=true&status=archived']) {
                const res = await GET(makeReq(`/api/library/list?${q}`, { token: 'valid', headers: { 'x-org-id': host } }))
                const json = await res.json()
                if (!json.files) throw new Error(`${res.status} ${JSON.stringify(json)}`)
                out[`${host}?${q}`] = { total: json.total, files: strip(json.files) }
            }
        }
        await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot('./__goldens__/p5-library-list-route.json')
    })
})
