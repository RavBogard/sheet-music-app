import {
    PDFArray,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFString,
    degrees,
    drawText as drawTextOperators,
    type Color,
    type PDFDocument,
    type PDFPage,
    type PDFRef,
} from "pdf-lib"

/**
 * Minimal TrueType embedder for pdf-lib that does NOT need @pdf-lib/fontkit.
 *
 * pdf-lib can only embed custom fonts through fontkit, which this repo does not
 * ship. Everything the service sheet needs from a TTF is simple table reads:
 * metrics, advance widths and the Unicode→glyph cmap. The font is embedded
 * whole (no subsetting — Alef is ~90 KB) as a Type0 / CIDFontType2 font with
 * Identity-H encoding and CIDToGIDMap Identity, so a CID is a glyph id and text
 * is written as 2-byte glyph ids. A ToUnicode CMap makes the text extractable
 * and searchable (copy/paste out of the PDF gives back the characters).
 *
 * What it deliberately does NOT do: shaping. No GSUB (ligatures, contextual
 * forms), no GPOS (kerning, mark positioning). Glyphs are laid out with their
 * plain advance widths in the order given — callers handle bidi reordering
 * (see bidi-visual.ts). Hebrew needs no contextual shaping, so this is enough
 * for Hebrew + Latin; it would NOT be enough for Arabic.
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedTtf {
    postScriptName: string
    unitsPerEm: number
    bbox: { xMin: number; yMin: number; xMax: number; yMax: number }
    ascender: number
    descender: number
    capHeight: number
    italicAngle: number
    isFixedPitch: boolean
    numGlyphs: number
    /** Advance width per glyph id, in font units. */
    advances: Uint16Array
    /** Unicode code point → glyph id (only mapped, non-zero glyphs). */
    cmap: Map<number, number>
}

class Reader {
    private readonly view: DataView
    constructor(readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }
    u8(o: number) {
        return this.view.getUint8(o)
    }
    u16(o: number) {
        return this.view.getUint16(o)
    }
    i16(o: number) {
        return this.view.getInt16(o)
    }
    u32(o: number) {
        return this.view.getUint32(o)
    }
    fixed(o: number) {
        return this.view.getInt32(o) / 65536
    }
    tag(o: number) {
        return String.fromCharCode(this.u8(o), this.u8(o + 1), this.u8(o + 2), this.u8(o + 3))
    }
}

function readTables(r: Reader): Map<string, { offset: number; length: number }> {
    const sfnt = r.u32(0)
    // 0x00010000 = TrueType outlines; 'true' = legacy Apple. 'OTTO' is CFF,
    // which FontFile2 cannot carry.
    if (sfnt !== 0x00010000 && sfnt !== 0x74727565) {
        throw new Error(`embed-ttf: not a TrueType-outline font (sfnt 0x${sfnt.toString(16)})`)
    }
    const numTables = r.u16(4)
    const tables = new Map<string, { offset: number; length: number }>()
    for (let i = 0; i < numTables; i++) {
        const rec = 12 + i * 16
        tables.set(r.tag(rec), { offset: r.u32(rec + 8), length: r.u32(rec + 12) })
    }
    for (const req of ["head", "hhea", "maxp", "hmtx", "cmap"]) {
        if (!tables.has(req)) throw new Error(`embed-ttf: missing required table '${req}'`)
    }
    return tables
}

function parseCmap(r: Reader, base: number): Map<number, number> {
    const n = r.u16(base + 2)
    let fmt4 = -1
    let fmt12 = -1
    for (let i = 0; i < n; i++) {
        const rec = base + 4 + i * 8
        const platform = r.u16(rec)
        const encoding = r.u16(rec + 2)
        const off = base + r.u32(rec + 4)
        const format = r.u16(off)
        const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
        if (!unicode) continue
        if (format === 12 && fmt12 < 0) fmt12 = off
        if (format === 4 && fmt4 < 0) fmt4 = off
    }
    const map = new Map<number, number>()
    if (fmt12 >= 0) {
        const nGroups = r.u32(fmt12 + 12)
        for (let g = 0; g < nGroups; g++) {
            const p = fmt12 + 16 + g * 12
            const start = r.u32(p)
            const end = r.u32(p + 4)
            const gid = r.u32(p + 8)
            for (let cp = start; cp <= end; cp++) {
                const id = gid + (cp - start)
                if (id !== 0) map.set(cp, id)
            }
        }
        return map
    }
    if (fmt4 < 0) throw new Error("embed-ttf: no Unicode cmap (format 4 or 12)")
    const segX2 = r.u16(fmt4 + 6)
    const segs = segX2 / 2
    const endO = fmt4 + 14
    const startO = endO + segX2 + 2
    const deltaO = startO + segX2
    const rangeO = deltaO + segX2
    for (let s = 0; s < segs; s++) {
        const end = r.u16(endO + s * 2)
        const start = r.u16(startO + s * 2)
        const delta = r.i16(deltaO + s * 2)
        const rangeOffset = r.u16(rangeO + s * 2)
        for (let cp = start; cp <= end; cp++) {
            if (cp === 0xffff) break
            let gid: number
            if (rangeOffset === 0) {
                gid = (cp + delta) & 0xffff
            } else {
                const at = rangeO + s * 2 + rangeOffset + (cp - start) * 2
                gid = r.u16(at)
                if (gid !== 0) gid = (gid + delta) & 0xffff
            }
            if (gid !== 0) map.set(cp, gid)
        }
    }
    return map
}

function parseName(r: Reader, base: number): string | null {
    const count = r.u16(base + 2)
    const strBase = base + r.u16(base + 4)
    let mac: string | null = null
    for (let i = 0; i < count; i++) {
        const rec = base + 6 + i * 12
        const platform = r.u16(rec)
        const nameId = r.u16(rec + 6)
        if (nameId !== 6) continue
        const len = r.u16(rec + 8)
        const off = strBase + r.u16(rec + 10)
        if (platform === 3 || platform === 0) {
            let s = ""
            for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(r.u16(off + k))
            return s
        }
        if (platform === 1 && mac === null) {
            mac = ""
            for (let k = 0; k < len; k++) mac += String.fromCharCode(r.u8(off + k))
        }
    }
    return mac
}

export function parseTtf(bytes: Uint8Array): ParsedTtf {
    const r = new Reader(bytes)
    const t = readTables(r)
    const head = t.get("head")!.offset
    const hhea = t.get("hhea")!.offset
    const maxp = t.get("maxp")!.offset
    const hmtx = t.get("hmtx")!.offset

    const unitsPerEm = r.u16(head + 18)
    const bbox = {
        xMin: r.i16(head + 36),
        yMin: r.i16(head + 38),
        xMax: r.i16(head + 40),
        yMax: r.i16(head + 42),
    }
    const ascender = r.i16(hhea + 4)
    const descender = r.i16(hhea + 6)
    const numberOfHMetrics = r.u16(hhea + 34)
    const numGlyphs = r.u16(maxp + 4)

    const advances = new Uint16Array(numGlyphs)
    let last = 0
    for (let g = 0; g < numGlyphs; g++) {
        if (g < numberOfHMetrics) last = r.u16(hmtx + g * 4)
        advances[g] = last
    }

    let capHeight = ascender
    const os2 = t.get("OS/2")
    if (os2 && os2.length >= 90 && r.u16(os2.offset) >= 2) {
        capHeight = r.i16(os2.offset + 88)
    }

    let italicAngle = 0
    let isFixedPitch = false
    const post = t.get("post")
    if (post) {
        italicAngle = r.fixed(post.offset + 4)
        isFixedPitch = r.u32(post.offset + 12) !== 0
    }

    const nameTable = t.get("name")
    const rawName = (nameTable && parseName(r, nameTable.offset)) || "EmbeddedTTF"
    // PDF names must not carry spaces/delimiters.
    const postScriptName = rawName.replace(/[^\x21-\x7e]|[()<>[\]{}/%#]/g, "") || "EmbeddedTTF"

    return {
        postScriptName,
        unitsPerEm,
        bbox,
        ascender,
        descender,
        capHeight,
        italicAngle,
        isFixedPitch,
        numGlyphs,
        advances,
        cmap: parseCmap(r, t.get("cmap")!.offset),
    }
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export interface DrawTtfTextOptions {
    x: number
    y: number
    size: number
    color: Color
}

export interface EmbeddedTtf {
    readonly ref: PDFRef
    readonly name: string
    readonly parsed: ParsedTtf
    /** Glyph id drawn for a code point (the fallback glyph when unmapped). */
    glyphFor(codePoint: number): number
    /** True when the font has a real glyph for the code point. */
    hasGlyph(codePoint: number): boolean
    widthOfTextAtSize(text: string, size: number): number
    heightAtSize(size: number, options?: { descender?: boolean }): number
    /** Identity-H encoding: 2-byte glyph ids, in the order given. */
    encodeText(text: string): PDFHexString
    /** Draw one line in the order given (callers do bidi reordering first). */
    drawText(page: PDFPage, text: string, options: DrawTtfTextOptions): void
}

const COMBINING_MARK = /^\p{M}$/u

function hex4(n: number): string {
    return n.toString(16).padStart(4, "0").toUpperCase()
}

function utf16Hex(cp: number): string {
    if (cp <= 0xffff) return hex4(cp)
    const v = cp - 0x10000
    return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff))
}

function toUnicodeCMap(gidToCp: Map<number, number>): string {
    const entries = [...gidToCp.entries()].sort((a, b) => a[0] - b[0])
    const blocks: string[] = []
    for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100)
        blocks.push(
            `${chunk.length} beginbfchar\n` +
                chunk.map(([gid, cp]) => `<${hex4(gid)}> <${utf16Hex(cp)}>`).join("\n") +
                "\nendbfchar",
        )
    }
    return [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
        ...blocks,
        "endcmap",
        "CMapName currentdict /CMap defineresource pop",
        "end",
        "end",
    ].join("\n")
}

export interface EmbedTtfOptions {
    /** Character drawn for code points the font lacks. Default "?". */
    fallbackChar?: string
}

/**
 * Embed a whole TrueType font into `doc` (eagerly — the objects are written
 * now, with widths and ToUnicode for every mapped glyph, so nothing has to be
 * flushed at save time).
 */
export function embedTtf(
    doc: PDFDocument,
    bytes: Uint8Array,
    options: EmbedTtfOptions = {},
): EmbeddedTtf {
    const parsed = parseTtf(bytes)
    const { unitsPerEm, cmap, advances } = parsed
    const scale = 1000 / unitsPerEm
    const ctx = doc.context

    const fallbackCp = (options.fallbackChar ?? "?").codePointAt(0) ?? 0x3f
    const fallbackGid = cmap.get(fallbackCp) ?? 0

    // gid → first (lowest) code point that maps to it, for ToUnicode.
    const gidToCp = new Map<number, number>()
    for (const [cp, gid] of [...cmap.entries()].sort((a, b) => a[0] - b[0])) {
        if (!gidToCp.has(gid)) gidToCp.set(gid, cp)
    }

    const fontFile = ctx.flateStream(bytes, { Length1: bytes.length })
    const fontFileRef = ctx.register(fontFile)

    // Flags: bit 3 (4) Symbolic — the font carries glyphs outside the Adobe
    // standard Latin set (Hebrew), and a CID font is addressed by glyph id, not
    // a standard encoding. Bit 1 (1) FixedPitch, bit 7 (64) Italic.
    const flags = 4 | (parsed.isFixedPitch ? 1 : 0) | (parsed.italicAngle !== 0 ? 64 : 0)
    const descriptorRef = ctx.register(
        ctx.obj({
            Type: "FontDescriptor",
            FontName: parsed.postScriptName,
            Flags: flags,
            FontBBox: [
                Math.round(parsed.bbox.xMin * scale),
                Math.round(parsed.bbox.yMin * scale),
                Math.round(parsed.bbox.xMax * scale),
                Math.round(parsed.bbox.yMax * scale),
            ],
            ItalicAngle: parsed.italicAngle,
            Ascent: Math.round(parsed.ascender * scale),
            Descent: Math.round(parsed.descender * scale),
            CapHeight: Math.round(parsed.capHeight * scale),
            StemV: 80,
            FontFile2: fontFileRef,
        }),
    )

    // W: [0 [w0 w1 ... wN-1]] — every glyph, so any text drawn later is covered.
    const widths = PDFArray.withContext(ctx)
    for (let g = 0; g < parsed.numGlyphs; g++) {
        widths.push(PDFNumber.of(Math.round(advances[g] * scale)))
    }
    const W = PDFArray.withContext(ctx)
    W.push(PDFNumber.of(0))
    W.push(widths)

    const cidFontRef = ctx.register(
        ctx.obj({
            Type: "Font",
            Subtype: "CIDFontType2",
            BaseFont: parsed.postScriptName,
            CIDSystemInfo: ctx.obj({
                Registry: PDFString.of("Adobe"),
                Ordering: PDFString.of("Identity"),
                Supplement: 0,
            }),
            FontDescriptor: descriptorRef,
            W,
            CIDToGIDMap: "Identity",
        }),
    )

    const toUnicodeRef = ctx.register(ctx.flateStream(toUnicodeCMap(gidToCp)))

    const ref = ctx.register(
        ctx.obj({
            Type: "Font",
            Subtype: "Type0",
            BaseFont: parsed.postScriptName,
            Encoding: "Identity-H",
            DescendantFonts: [cidFontRef],
            ToUnicode: toUnicodeRef,
        }),
    )

    const glyphFor = (cp: number) => cmap.get(cp) ?? fallbackGid
    // A combining mark the font lacks (e.g. cantillation) is dropped rather than
    // drawn as a fallback '?' on top of its letter; any other unmapped
    // character becomes the fallback glyph so its absence stays visible.
    const glyphs = (text: string) => {
        const out: number[] = []
        for (const ch of text) {
            const cp = ch.codePointAt(0)!
            const gid = cmap.get(cp)
            if (gid !== undefined) out.push(gid)
            else if (!COMBINING_MARK.test(ch)) out.push(fallbackGid)
        }
        return out
    }

    const pageKeys = new WeakMap<PDFPage, PDFName>()

    const font: EmbeddedTtf = {
        ref,
        name: parsed.postScriptName,
        parsed,
        glyphFor,
        hasGlyph: (cp) => cmap.has(cp),
        widthOfTextAtSize(text, size) {
            let units = 0
            for (const g of glyphs(text)) units += advances[g]
            return (units / unitsPerEm) * size
        },
        heightAtSize(size, opts) {
            // Mirrors pdf-lib's CustomFontEmbedder.heightOfFontAtSize.
            const top = parsed.ascender || parsed.bbox.yMax
            const bottom = parsed.descender || parsed.bbox.yMin
            let h = top - bottom
            if (opts?.descender === false) h -= Math.abs(parsed.descender) || 0
            return (h / unitsPerEm) * size
        },
        encodeText(text) {
            return PDFHexString.of(glyphs(text).map(hex4).join(""))
        },
        drawText(page, text, { x, y, size, color }) {
            let key = pageKeys.get(page)
            if (!key) {
                key = page.node.newFontDictionary(parsed.postScriptName, ref)
                pageKeys.set(page, key)
            }
            page.pushOperators(
                ...drawTextOperators(font.encodeText(text), {
                    color,
                    font: key,
                    size,
                    rotate: degrees(0),
                    xSkew: degrees(0),
                    ySkew: degrees(0),
                    x,
                    y,
                }),
            )
        },
    }
    return font
}
