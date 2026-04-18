import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import {
  extractMscx,
  convertMscxToMusicXml,
  processMuseScoreFile,
} from '../musescore-converter'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')

describe('musescore-converter', () => {
  let sampleMscxContent: string
  let sampleMsczBuffer: Buffer

  beforeAll(async () => {
    sampleMscxContent = fs.readFileSync(
      path.join(FIXTURES_DIR, 'sample.mscx'),
      'utf-8'
    )

    // Create .mscz buffer from fixture
    const zip = new JSZip()
    zip.file('score.mscx', sampleMscxContent)
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    sampleMsczBuffer = Buffer.from(zipBuffer)
  })

  describe('extractMscx', () => {
    it('extracts .mscx XML string from a .mscz ZIP buffer', async () => {
      const result = await extractMscx(sampleMsczBuffer)
      expect(result).toContain('<museScore')
      expect(result).toContain('<Score>')
      expect(result).toContain('<Staff')
    })

    it('throws Error when ZIP contains no .mscx file', async () => {
      const zip = new JSZip()
      zip.file('readme.txt', 'no mscx here')
      const badBuffer = Buffer.from(
        await zip.generateAsync({ type: 'nodebuffer' })
      )

      await expect(extractMscx(badBuffer)).rejects.toThrow(
        /no .mscx file found/i
      )
    })
  })

  describe('convertMscxToMusicXml', () => {
    it('returns a string containing <score-partwise', async () => {
      const result = await convertMscxToMusicXml(sampleMscxContent)
      expect(result).toContain('<score-partwise')
    })

    it('output contains <part-list> and <part id=', async () => {
      const result = await convertMscxToMusicXml(sampleMscxContent)
      expect(result).toContain('<part-list>')
      expect(result).toMatch(/<part id=/)
    })

    it('output contains <measure number=', async () => {
      const result = await convertMscxToMusicXml(sampleMscxContent)
      expect(result).toMatch(/<measure number=/)
    })
  })

  describe('processMuseScoreFile', () => {
    it('with mscz extension extracts and converts end-to-end', async () => {
      const result = await processMuseScoreFile(sampleMsczBuffer, 'mscz')
      expect(result.musicXml).toContain('<score-partwise')
      expect(result.musicXml).toContain('<part-list>')
      expect(result.musicXml).toMatch(/<measure number=/)
    })

    it('with mscx extension converts directly (no ZIP extraction)', async () => {
      const mscxBuffer = Buffer.from(sampleMscxContent, 'utf-8')
      const result = await processMuseScoreFile(mscxBuffer, 'mscx')
      expect(result.musicXml).toContain('<score-partwise')
    })

    it('returns originalContent as the input buffer', async () => {
      const result = await processMuseScoreFile(sampleMsczBuffer, 'mscz')
      expect(Buffer.isBuffer(result.originalContent)).toBe(true)
      expect(result.originalContent).toEqual(sampleMsczBuffer)
    })
  })
})
