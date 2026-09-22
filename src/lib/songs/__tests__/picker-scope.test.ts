import { describe, expect, it } from 'vitest'

import type { LocalSong } from '@/lib/local/types'
import {
    chipsFor,
    collectionLabel,
    defaultPickerCollection,
    inCollection,
    isPickableFor,
    type PickerCollection,
} from '../picker-scope'

const song = (id: string, extra: Partial<LocalSong> = {}): LocalSong => ({
    id,
    title: `Song ${id}`,
    normalizedTitle: `song ${id}`,
    ...extra,
})

describe('picker scope (David ask 2)', () => {
    it('offers only the host org, reading a missing orgId as crc', () => {
        const legacy = song('a')
        const crc = song('b', { orgId: 'crc' })
        const bl = song('c', { orgId: 'brotherslazaroff' })
        const rows = [legacy, crc, bl]
        expect(rows.filter((s) => isPickableFor(s, 'crc')).map((s) => s.id)).toEqual(['a', 'b'])
        expect(rows.filter((s) => isPickableFor(s, 'brotherslazaroff')).map((s) => s.id)).toEqual(['c'])
    })

    it('hides archived, duplicate and orphaned rows', () => {
        for (const status of ['archived', 'duplicate', 'orphaned']) {
            expect(isPickableFor(song('x', { status: status as LocalSong['status'] }), 'crc')).toBe(false)
        }
        expect(isPickableFor(song('x', { status: 'active' }), 'crc')).toBe(true)
    })

    it('CRC opens on core with the library labels; other tenants open on everything', () => {
        expect(defaultPickerCollection('crc')).toBe('core')
        expect(defaultPickerCollection('brotherslazaroff')).toBeNull()
        expect(collectionLabel('crc', 'supplemental')).toBe('Shireinu')
        expect(collectionLabel('crc', 'core')).toBe('CRC Charts')
        expect(collectionLabel('brotherslazaroff', 'core')).toBe('Charts')
    })

    it('shows chips only for collections the site uses, and none for a single collection', () => {
        const m = new Map<string, PickerCollection>([
            ['1', 'core'],
            ['2', 'supplemental'],
            ['3', 'nava'],
            ['4', 'uploads'],
        ])
        const all = ['1', '2', '3', '4'].map((id) => song(id))
        expect(chipsFor(all, m)).toEqual(['core', 'supplemental', 'nava', 'uploads'])
        // Brothers Lazaroff: every row is an upload → no Shireinu chip, no chips at all.
        expect(chipsFor([song('4')], m)).toEqual([])
        // No listing loaded → no chips, nothing filtered.
        expect(chipsFor(all, new Map())).toEqual([])
    })

    it('a row the listing does not know yet shows under every chip', () => {
        const m = new Map<string, PickerCollection>([
            ['1', 'core'],
            ['2', 'supplemental'],
        ])
        expect(inCollection(song('2'), 'supplemental', m)).toBe(true)
        expect(inCollection(song('2'), 'core', m)).toBe(false)
        expect(inCollection(song('new'), 'core', m)).toBe(true)
        expect(inCollection(song('1'), null, m)).toBe(true)
    })
})
