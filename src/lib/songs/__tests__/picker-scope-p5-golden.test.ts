import { describe, expect, it } from 'vitest'


import { isPickableFor } from '@/lib/songs/picker-scope'
import { P5_FIXTURE_SONGS } from '@/lib/library/__tests__/p5-fixture'
import type { LocalSong } from '@/lib/local/types'

/**
 * Multi-tenant phase 5 — GOLDEN for the pickers' row filter. Captured on
 * unchanged code (9e0c6fac): which fixture songs each host tenant's picker
 * offers. With shared collections off this must not move.
 */
describe('P5 golden — isPickableFor per host tenant', () => {
    it('offers exactly the captured rows', () => {
        const rows = Object.entries(P5_FIXTURE_SONGS).map(([id, r]) => ({ id, ...r }) as unknown as LocalSong)
        const out = Object.fromEntries(
            ['crc', 'brotherslazaroff', 'nava-tehila'].map((org) => [org, rows.filter((r) => isPickableFor(r, org)).map((r) => r.id)]),
        )
        expect(out).toEqual({
            crc: ['c-core-1', 'c-core-2', 'c-core-mp3', 'c-sup-1', 'c-nava-1', 'c-nava-2', 'c-up-1'],
            brotherslazaroff: ['b-core-1', 'b-up-1'],
            'nava-tehila': [],
        })
    })
})

describe('P5 pickers — after the nava move', () => {
    it('CRC still offers the moved nava charts (assigned to CRC); BL never; shared-only rows need the chip', async () => {
        const { isPickableSharedFor } = await import('@/lib/songs/picker-scope')
        const NAVA = 'nava-tehila'
        const rows = Object.entries(P5_FIXTURE_SONGS).map(([id, r]) => {
            const moved = id.startsWith('c-nava') ? { orgId: NAVA, visibleToOrgs: [NAVA, 'crc'], libraryOrgs: [NAVA, 'crc'] } : {}
            const shared = id === 'b-up-1' ? { visibleToOrgs: ['brotherslazaroff', 'crc'], libraryOrgs: ['brotherslazaroff'] } : {}
            return { id, ...r, ...moved, ...shared } as unknown as LocalSong
        })
        const pick = (org: string) => rows.filter((r) => isPickableFor(r, org)).map((r) => r.id)
        expect(pick('crc')).toEqual(['c-core-1', 'c-core-2', 'c-core-mp3', 'c-sup-1', 'c-nava-1', 'c-nava-2', 'c-up-1'])
        expect(pick('brotherslazaroff')).toEqual(['b-core-1', 'b-up-1'])
        expect(pick(NAVA)).toEqual(['c-nava-1', 'c-nava-2'])
        expect(rows.filter((r) => isPickableSharedFor(r, 'crc')).map((r) => r.id)).toEqual(['b-up-1'])
        expect(rows.filter((r) => isPickableSharedFor(r, 'brotherslazaroff')).map((r) => r.id)).toEqual([])
    })
})
