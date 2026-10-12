import { afterEach, describe, expect, it } from 'vitest'

import { clearPrimedOrgConfigs } from '@/lib/org/config-cache'
import { ALLOWED_LIBRARY_COLLECTIONS } from '@/lib/library-upload'
import {
    PICKER_COLLECTIONS,
    collectionLabel,
    defaultPickerCollection,
    normalizeCollection,
    type PickerCollection,
} from '../picker-scope'

/**
 * Multi-tenant phase 1 golden (lane 3, surface 1+2): the picker labels, the
 * default collection and the collection vocabulary, exactly as they were
 * before the library section moved into tenant config (e0ad18b4).
 */
const ALL: PickerCollection[] = ['core', 'supplemental', 'nava', 'uploads']

const GOLDEN_LABELS: Record<string, Record<PickerCollection, string>> = {
    crc: { core: 'CRC Charts', supplemental: 'Shireinu', nava: 'Nava Tehilah', uploads: 'Uploads' },
    brotherslazaroff: { core: 'Charts', supplemental: 'Shireinu', nava: 'Nava Tehilah', uploads: 'Uploads' },
}

describe('P1 golden: picker collections for crc and brotherslazaroff', () => {
    afterEach(() => clearPrimedOrgConfigs())

    for (const org of ['crc', 'brotherslazaroff']) {
        for (const c of ALL) {
            it(`${org} ${c} label`, () => {
                expect(collectionLabel(org, c)).toBe(GOLDEN_LABELS[org][c])
            })
        }
    }

    it('default collection: crc opens on core, BL on everything', () => {
        expect(defaultPickerCollection('crc')).toBe('core')
        expect(defaultPickerCollection('brotherslazaroff')).toBeNull()
    })

    it('picker order and the upload allow-list are unchanged', () => {
        expect([...PICKER_COLLECTIONS]).toEqual(['core', 'supplemental', 'nava', 'uploads'])
        expect([...ALLOWED_LIBRARY_COLLECTIONS]).toEqual(['core', 'supplemental', 'uploads', 'nava'])
    })

    it('normalizeCollection: anything not supplemental/nava/uploads is core', () => {
        const inputs: unknown[] = ['core', 'supplemental', 'nava', 'uploads', 'crc', '', undefined, null, 42, 'Shireinu']
        expect(inputs.map(normalizeCollection)).toEqual([
            'core', 'supplemental', 'nava', 'uploads', 'core', 'core', 'core', 'core', 'core', 'core',
        ])
    })
})
