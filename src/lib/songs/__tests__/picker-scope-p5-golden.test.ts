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
