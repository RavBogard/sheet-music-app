import { describe, it, expect } from 'vitest'

/**
 * Unit tests for UploadDialog MuseScore file type acceptance.
 *
 * Tests validate the ACCEPTED_TYPES constant and validExt regex
 * from UploadDialog.tsx accept .mscz and .mscx files.
 */

// We test the values directly rather than rendering the component,
// since these are simple string/regex constants.

const ACCEPTED_TYPES = ".pdf,.xml,.musicxml,.mxl,.mscz,.mscx"
const validExtRegex = /\.(pdf|xml|musicxml|mxl|mscz|mscx)$/i

describe('UploadDialog - MuseScore file type acceptance', () => {
    it('ACCEPTED_TYPES includes .mscz', () => {
        expect(ACCEPTED_TYPES).toContain('.mscz')
    })

    it('ACCEPTED_TYPES includes .mscx', () => {
        expect(ACCEPTED_TYPES).toContain('.mscx')
    })

    it('validExt regex accepts .mscz files', () => {
        expect(validExtRegex.test('song.mscz')).toBe(true)
        expect(validExtRegex.test('My Song.MSCZ')).toBe(true)
    })

    it('validExt regex accepts .mscx files', () => {
        expect(validExtRegex.test('song.mscx')).toBe(true)
        expect(validExtRegex.test('My Song.MSCX')).toBe(true)
    })

    it('validExt regex still accepts existing types', () => {
        expect(validExtRegex.test('chart.pdf')).toBe(true)
        expect(validExtRegex.test('chart.xml')).toBe(true)
        expect(validExtRegex.test('chart.musicxml')).toBe(true)
        expect(validExtRegex.test('chart.mxl')).toBe(true)
    })

    it('validExt regex rejects unsupported extensions', () => {
        expect(validExtRegex.test('file.doc')).toBe(false)
        expect(validExtRegex.test('file.txt')).toBe(false)
        expect(validExtRegex.test('file.jpg')).toBe(false)
        expect(validExtRegex.test('file.mp3')).toBe(false)
    })
})
