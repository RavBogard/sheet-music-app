import { describe, expect, it } from 'vitest'

import { changedRowIds } from '../use-changed-row-highlight'

const prev = new Map([['a', 1], ['b', 1]])

describe('changedRowIds', () => {
    it('flags a row whose version rose', () => {
        expect(changedRowIds(prev, [{ id: 'a', version: 2 }, { id: 'b', version: 1 }], () => false)).toEqual(['a'])
    })
    it('does not flag a new row, an unchanged row or a lower version', () => {
        expect(changedRowIds(prev, [{ id: 'c', version: 9 }, { id: 'a', version: 1 }, { id: 'b', version: 0 }], () => false)).toEqual([])
    })
    it("does not flag this device's own just-written row", () => {
        expect(changedRowIds(prev, [{ id: 'a', version: 2 }], (id) => id === 'a')).toEqual([])
    })
})
