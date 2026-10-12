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

describe('P5 /api/library/list — after the nava move and with a shared (not assigned) collection', () => {
    const NAVA = 'nava-tehila'
    const moved = (id: string) => (id.startsWith('c-nava') ? { orgId: NAVA, previousOrgId: 'crc', collectionId: `${NAVA}__nava`, visibleToOrgs: [NAVA, 'crc'], libraryOrgs: [NAVA, 'crc'] } : {})
    const sharedBl = (id: string) => (id === 'b-up-1' ? { collectionId: 'brotherslazaroff__uploads', visibleToOrgs: ['brotherslazaroff', 'crc'], libraryOrgs: ['brotherslazaroff'] } : {})
    const ids = async (host: string, q: string) => {
        const res = await GET(makeReq(`/api/library/list?${q}`, { token: 'valid', headers: { 'x-org-id': host } }))
        const json = await res.json()
        return (json.files as Array<{ id: string; ownerOrgId: string }>)
    }

    it("CRC's Nava Tehilah tab and default list are unchanged; the rows now name Nava as owner", async () => {
        docs = fixtureDocs((id) => ({ ...moved(id), ...sharedBl(id) }))
        const nava = await ids('crc', 'all=true&collection=nava')
        expect(nava.map((f) => f.id)).toEqual(['c-nava-1', 'c-nava-2'])
        expect(nava.every((f) => f.ownerOrgId === NAVA)).toBe(true)
        const all = await ids('crc', 'all=true')
        expect(all.map((f) => f.id)).toEqual(['c-core-1', 'c-sup-1', 'c-up-1', 'c-nava-1', 'c-core-orph', 'c-nava-2', 'c-core-dup', 'c-core-mp3', 'c-core-2'])
        const archived = await ids('crc', 'all=true&status=archived')
        expect(archived.map((f) => f.id)).toEqual(['c-core-arch', 'c-nava-arch'])
    })

    it('a shared-but-not-assigned row appears only with includeShared, and collectionId filters', async () => {
        docs = fixtureDocs((id) => ({ ...moved(id), ...sharedBl(id) }))
        expect((await ids('crc', 'all=true')).some((f) => f.id === 'b-up-1')).toBe(false)
        const withShared = await ids('crc', 'all=true&includeShared=true')
        expect(withShared.find((f) => f.id === 'b-up-1')?.ownerOrgId).toBe('brotherslazaroff')
        expect((await ids('crc', 'all=true&includeShared=true&collectionId=brotherslazaroff__uploads')).map((f) => f.id)).toEqual(['b-up-1'])
        expect((await ids('crc', `all=true&collectionId=${NAVA}__nava`)).map((f) => f.id)).toEqual(['c-nava-1', 'c-nava-2'])
    })

    it('BL sees none of the moved rows; Nava sees them as its own', async () => {
        docs = fixtureDocs((id) => ({ ...moved(id), ...sharedBl(id) }))
        expect((await ids('brotherslazaroff', 'all=true&includeShared=true')).map((f) => f.id)).toEqual(['b-core-1', 'b-up-1'])
        expect((await ids(NAVA, 'all=true')).map((f) => f.id)).toEqual(['c-nava-1', 'c-nava-2'])
    })
})
