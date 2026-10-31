import { describe, expect, it } from 'vitest'

import type { LocalTrack } from '@/lib/local/types'
import { HUE_CYCLE, hueForSectionName, sectionBands } from '../section-bands'

const row = (id: string, extra: Partial<LocalTrack> & Record<string, unknown> = {}): LocalTrack => ({
    id,
    setlistId: 's1',
    order: 0,
    ...extra,
})

describe('section bands', () => {
    it('known section names keep their hue whatever their position', () => {
        expect(hueForSectionName('Kabbalat Shabbat')).toBe('green')
        expect(hueForSectionName("Ma'ariv")).toBe('blue')
        expect(hueForSectionName('Shacharit')).toBe('ochre')
        expect(hueForSectionName('Torah Service')).toBe('oxblood')
        expect(hueForSectionName('Concluding Prayers')).toBe('green')
        expect(hueForSectionName('Set 1')).toBe(HUE_CYCLE[0])
        expect(hueForSectionName('SET 2')).toBe(HUE_CYCLE[1])
        expect(hueForSectionName('Pre-service')).toBeNull()
    })

    it('unknown headers cycle by header order; the range covers only that section', () => {
        const tracks = [
            row('h1', { type: 'header', title: 'Pre-service' }),
            row('a', { type: 'song', liturgyRef: { book: 'b', folio: 12 } }),
            row('b', { type: 'prayer', liturgyRef: { book: 'b', folio: 9 } }),
            row('h2', { type: 'section', title: 'Something else' }),
            row('c', { type: 'song' }),
            row('h3', { type: 'header', title: 'Torah Service' }),
            row('d', { type: 'song', liturgyRef: { book: 'b', folio: 40 } }),
        ]
        const bands = sectionBands(tracks)
        expect(Object.keys(bands)).toEqual(['h1', 'h2', 'h3'])
        expect(bands.h1).toEqual({ hue: HUE_CYCLE[0], folioFrom: 9, folioTo: 12 })
        expect(bands.h2).toEqual({ hue: HUE_CYCLE[1] })
        expect(bands.h3).toEqual({ hue: 'oxblood', folioFrom: 40, folioTo: 40 })
    })

    it('reads rows in the given order and never changes them', () => {
        const tracks = [row('h', { type: 'header', title: 'Set 2' }), row('x', { type: 'song' })]
        const before = JSON.stringify(tracks)
        sectionBands(tracks)
        expect(JSON.stringify(tracks)).toBe(before)
    })
})
