/**
 * MuseScore File Converter
 *
 * Converts MuseScore files (.mscz, .mscx) to MusicXML format.
 * - .mscz files are ZIP archives containing a .mscx XML file
 * - .mscx files are MuseScore's proprietary XML format
 * - MusicXML (score-partwise) is the standard output for OSMD rendering
 *
 * Uses JSZip for ZIP extraction and SaxonJS for XSLT transformation.
 */

import JSZip from 'jszip'
import SaxonJS from 'saxon-js'
import fs from 'fs'
import path from 'path'

/** Path to the pre-compiled XSLT stylesheet (SEF format) */
const SEF_PATH = path.resolve(process.cwd(), 'src/lib/xslt/mscx-to-musicxml.sef.json')

/** Path to the raw XSLT stylesheet (fallback) */
const XSL_PATH = path.resolve(process.cwd(), 'src/lib/xslt/mscx-to-musicxml.xsl')

/**
 * Extract the .mscx XML content from a .mscz ZIP archive.
 *
 * MuseScore .mscz files are ZIP archives containing a .mscx file
 * (the actual score XML) along with optional assets like images.
 *
 * @param buffer - The .mscz file contents as a Buffer
 * @returns The .mscx XML content as a string
 * @throws Error if no .mscx file is found in the archive
 */
export async function extractMscx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

  // Find the first file ending in .mscx (could be at root or in subfolder)
  const mscxFileName = Object.keys(zip.files).find((name) =>
    name.endsWith('.mscx')
  )

  if (!mscxFileName) {
    throw new Error(
      'No .mscx file found in .mscz archive. The ZIP may be corrupted or not a valid MuseScore file.'
    )
  }

  const content = await zip.files[mscxFileName].async('text')
  return content
}

/**
 * Convert MSCX XML content to MusicXML (score-partwise) format.
 *
 * Uses an XSLT 3.0 stylesheet via SaxonJS to transform MuseScore's
 * proprietary XML schema into standard MusicXML. Supports core elements:
 * notes, rests, chords, time signatures, key signatures, parts, and harmony.
 *
 * @param mscxContent - The MSCX XML content as a string
 * @returns The converted MusicXML content as a string
 * @throws Error if the XSLT transformation fails
 */
export async function convertMscxToMusicXml(
  mscxContent: string
): Promise<string> {
  try {
    // Try pre-compiled SEF first (faster)
    if (fs.existsSync(SEF_PATH)) {
      const result = await SaxonJS.transform(
        {
          stylesheetFileName: SEF_PATH,
          sourceText: mscxContent,
          sourceType: 'xml',
          destination: 'serialized',
        },
        'async'
      )
      return result.principalResult as string
    }

    // Fallback: load raw XSLT stylesheet
    const xslContent = fs.readFileSync(XSL_PATH, 'utf-8')
    const result = await SaxonJS.transform(
      {
        stylesheetText: xslContent,
        sourceText: mscxContent,
        sourceType: 'xml',
        destination: 'serialized',
      },
      'async'
    )
    return result.principalResult as string
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`XSLT conversion failed: ${message}`)
  }
}

/**
 * Process any MuseScore file (.mscz or .mscx) into MusicXML.
 *
 * High-level orchestrator that handles both file types:
 * - .mscz: extracts .mscx from ZIP, then converts to MusicXML
 * - .mscx: converts directly to MusicXML
 *
 * Returns both the converted MusicXML and the original buffer
 * for archival storage.
 *
 * @param buffer - The file contents as a Buffer
 * @param extension - The file extension ('mscz' or 'mscx')
 * @returns Object with musicXml string and originalContent buffer
 */
export async function processMuseScoreFile(
  buffer: Buffer,
  extension: 'mscz' | 'mscx'
): Promise<{
  musicXml: string
  originalContent: Buffer
}> {
  let mscxContent: string

  if (extension === 'mscz') {
    mscxContent = await extractMscx(buffer)
  } else {
    mscxContent = buffer.toString('utf-8')
  }

  const musicXml = await convertMscxToMusicXml(mscxContent)

  return {
    musicXml,
    originalContent: buffer,
  }
}
