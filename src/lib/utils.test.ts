import { describe, it, expect } from 'vitest'
import { levenshtein, parseFileId } from './utils'

describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
        expect(levenshtein('hello', 'hello')).toBe(0)
    })

    it('returns string length for empty comparison', () => {
        expect(levenshtein('hello', '')).toBe(5)
        expect(levenshtein('', 'hello')).toBe(5)
    })

    it('returns 0 for two empty strings', () => {
        expect(levenshtein('', '')).toBe(0)
    })

    it('counts single character difference', () => {
        expect(levenshtein('cat', 'bat')).toBe(1)
        expect(levenshtein('cat', 'car')).toBe(1)
    })

    it('counts insertions', () => {
        expect(levenshtein('cat', 'cats')).toBe(1)
        expect(levenshtein('at', 'cat')).toBe(1)
    })

    it('counts deletions', () => {
        expect(levenshtein('cats', 'cat')).toBe(1)
    })

    it('handles multiple edits', () => {
        expect(levenshtein('kitten', 'sitting')).toBe(3)
    })

    it('is symmetric', () => {
        expect(levenshtein('abc', 'def')).toBe(levenshtein('def', 'abc'))
        expect(levenshtein('hello', 'world')).toBe(levenshtein('world', 'hello'))
    })

    it('works with real song name matching', () => {
        // This is the actual use case — fuzzy matching song titles
        expect(levenshtein('Lecha Dodi', 'Lecha Dodi')).toBe(0)
        expect(levenshtein('Lecha Dodi', 'Lcha Dodi')).toBe(1)
        expect(levenshtein('Shalom Rav', 'Shalom Rav (Friedman)')).toBe(11)
    })
})

describe('parseFileId', () => {
    it('identifies database files by db- prefix', () => {
        const result = parseFileId('db-abc123')
        expect(result.isDbFile).toBe(true)
        expect(result.defaultType).toBe('musicxml')
        expect(result.apiUrl).toBe('/api/library/file/db-abc123')
    })

    it('identifies Drive files without db- prefix', () => {
        const result = parseFileId('1abc123def456')
        expect(result.isDbFile).toBe(false)
        expect(result.defaultType).toBe('pdf')
        expect(result.apiUrl).toBe('/api/drive/file/1abc123def456')
    })

    it('preserves the original id', () => {
        expect(parseFileId('db-test').id).toBe('db-test')
        expect(parseFileId('drive-id').id).toBe('drive-id')
    })

    it('handles edge case of "db-" as the entire id', () => {
        const result = parseFileId('db-')
        expect(result.isDbFile).toBe(true)
    })
})
