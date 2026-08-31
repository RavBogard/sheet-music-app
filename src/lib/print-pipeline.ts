/**
 * Print Pipeline — Background-capable PDF generation with caching.
 * 
 * Optimizations over the original synchronous print route:
 * 1. Chord extraction cache — reads from Firestore chordData subcollection,
 *    skips OCR if cached. Writes back after extraction for next time.
 * 2. Result caching — stores completed PDFs in Firebase Storage keyed by
 *    content hash. Identical print requests return instantly.
 * 3. Track-level progress — reports progress after each track for UI feedback.
 * 4. Incremental resilience — individual track failures don't kill the job.
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage } from "pdf-lib"
import { fetchFileById } from "@/lib/file-fetcher"
import { renderTextChartToPdf, toWinAnsi } from "@/lib/pdf/text-chart-pdf"
import { getTransposedKeyName } from "@/lib/music-math"
import { initAdmin, getFirestore, getStorage } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createHash } from "crypto"
import type { ExtractionResult, PageChords, ExtractedChord } from "@/lib/pdf-chord-extractor"
import { congregationDocId, coerceOrgId, DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

// ── Types ──

export interface PrintTrack {
    title: string
    key: string
    notes: string
    leadMusician?: string
    fileId?: string
    /** v70-01-01 Task 3: optional fileName for the image-track skip guard
     *  (extension fallback when mimeType isn't persisted on legacy tracks). */
    fileName?: string
    /** v70-01-01 Task 3: cached library_index.mimeType. When present and
     *  starts with `image/`, the print pipeline skips this track for
     *  v70-01-01 (full image embed lands in v70-01-02). */
    mimeType?: string
    transposition?: number
    preferFlats?: boolean
    capoFret?: number
    omitPdf?: boolean
    // Service flow fields
    type?: string
    performer?: string
    estimatedMinutes?: number
    description?: string
    /** Phase 4: printed page in the service's prayer book. The musician's
     *  packet needs this for the same reason the rabbi's sheet does. */
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
}

/** v70-01-01 Task 3: detects image-typed tracks for the print-pipeline skip
 *  guard. Mirrors PrintModal.isImageTrack and queue-utils image detection.
 *  v70-01-02 will replace the SKIP with `embedJpg`/`embedPng`. */
function isImageTrack(t: PrintTrack): boolean {
    if (t.mimeType?.startsWith('image/')) return true
    const name = (t.fileName ?? t.fileId ?? '').toLowerCase()
    return /\.(png|jpe?g|heic|heif)$/.test(name)
}

export interface PrintRequest {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    rabbi?: string
    tracks: PrintTrack[]
    coverOnly?: boolean
    /**
     * Phase 4: display title of the prayer book the folio column's page numbers
     * refer to — e.g. "CRC Friday Siddur". Resolved by the caller from the
     * setlist's `book` slug via `bookTitle()` in @/lib/books/titles (NOT
     * ./registry, which statically imports every book's page JSON).
     *
     * Without it the packet prints `p. 12` and names no book, and a musician
     * holding both a Friday and a Saturday packet gets two unqualified numbers
     * for prayers the two books share at different pages. Absent → the cover
     * draws nothing; never a placeholder.
     */
    bookTitle?: string
    /**
     * v11-05-04: tenant org for the print job. Drives the per-org congregation
     * read (printFooter identity). Resolved by the route from the setlist's
     * orgId (public/personal) or the host `x-org-id` (gig-packet POST). Absent /
     * crc → the bare `config/congregation` doc (byte-identical to pre-change).
     */
    org?: OrgId
}

export interface PrintProgress {
    phase: 'preparing' | 'processing' | 'merging' | 'complete' | 'error'
    currentTrack: number
    totalTracks: number
    currentTitle: string
    message: string
}

export interface PrintResult {
    pdf: Uint8Array
    stats: {
        totalTracks: number
        appendedTracks: number
        transposedTracks: number
        cacheHits: number
        cacheMisses: number
        fromResultCache: boolean
    }
}

// ── Content Hash ──

/**
 * Generate a deterministic hash of the print request for result caching.
 * Any change to tracks, transpositions, or metadata produces a different hash.
 */
function computeContentHash(req: PrintRequest): string {
    const significant = {
        cacheVersion: 6, // Increment when PDF rendering logic changes to bypass stale cache. v70-01-02: 2→3 (image tracks embed instead of skip). v70-01-02-fix: 3→4 — library_index mimeType backstop now embeds image tracks that lack a persisted track.mimeType; prints cached since the v70-01-02 deploy dropped those images and must not serve. Phase 4: 4→5 — the cover page now draws the liturgyRef folio column; every packet cached before this deploy has no page numbers and must not serve. Phase 4 fix wave: 5→6 — the cover table now PAGINATES (a v5 packet of >26 rows silently stopped mid-service, folios and all) and names the prayer book. Any v5 entry written by a preview deploy into the shared print-cache bucket would serve a truncated, unattributed packet.
        title: req.title,
        date: req.date,
        musicianName: req.musicianName,
        // Phase 4: the book that qualifies every folio on the cover. Two
        // setlists identical but for their prayer book must not collide.
        bookTitle: req.bookTitle,
        coverOnly: req.coverOnly || false,
        tracks: req.tracks.map(t => ({
            fileId: t.fileId,
            transposition: t.transposition || 0,
            preferFlats: t.preferFlats || false,
            capoFret: t.capoFret || 0,
            omitPdf: t.omitPdf || false,
            // Phase 4: the folio is drawn on the cover page, so two otherwise
            // identical setlists that differ only in their page numbers must
            // not collide on one cache key. `honors` is deliberately absent —
            // PrintTrack carries it but the packet renders no honors cell.
            folio: t.liturgyRef?.folio ?? null,
        })),
    } as Record<string, unknown>
    // v11-05-04: per-org congregation footer differs, so non-CRC orgs must NOT
    // share a result-cache key with CRC (would serve the wrong footer). Add org
    // to the hash ONLY when non-default → CRC keys stay byte-identical (no
    // cache-version bump, existing cached prints preserved).
    const hashOrg = coerceOrgId(req.org)
    if (hashOrg !== DEFAULT_ORG_ID) significant.org = hashOrg
    return createHash('sha256').update(JSON.stringify(significant)).digest('hex').slice(0, 16)
}

// ── Chord Extraction Cache ──

/**
 * Read cached chord data from Firestore chordData subcollection.
 * Returns null if no cache exists for this file.
 */
async function getCachedChords(fileId: string): Promise<ExtractionResult | null> {
    try {
        const db = getFirestore()
        const snapshot = await db
            .collection("library_index")
            .doc(fileId)
            .collection("chordData")
            .get()

        if (snapshot.empty) return null

        const pages: PageChords[] = []
        let totalChords = 0

        snapshot.forEach(doc => {
            const data = doc.data()
            const pageNum = parseInt(doc.id.replace('page_', ''))
            if (isNaN(pageNum) || !data.chords) return
            // Skip stale caches from older scanner versions
            if (!data.cacheVersion || data.cacheVersion < 5) return

            const chords: ExtractedChord[] = data.chords.map((c: Record<string, unknown>) => ({
                text: String(c.text || c.originalText || ''),
                x: Number(c.x || 0),
                y: Number(c.y || 0),
                w: Number(c.w || 0),
                h: Number(c.h || 0),
            }))

            pages.push({
                page: pageNum + 1, // chordData is 0-indexed, PageChords is 1-indexed
                chords,
                pageWidth: 612,  // Standard letter
                pageHeight: 792,
            })
            totalChords += chords.length
        })

        if (totalChords === 0) return null

        return { pages: pages.sort((a, b) => a.page - b.page), totalChords }
    } catch (err) {
        logger.warn(`[PrintPipeline] Chord cache read failed for ${fileId}:`, err)
        return null
    }
}

/**
 * Write extracted chords to Firestore chordData subcollection for future reuse.
 */
async function cacheChords(fileId: string, result: ExtractionResult): Promise<void> {
    try {
        const db = getFirestore()
        const batch = db.batch()

        for (const page of result.pages) {
            const docRef = db
                .collection("library_index")
                .doc(fileId)
                .collection("chordData")
                .doc(`page_${page.page - 1}`) // Convert 1-indexed to 0-indexed

            batch.set(docRef, {
                chords: page.chords.map(c => ({
                    text: c.text,
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    w: c.w,
                    h: c.h,
                })),
                scannedAt: new Date().toISOString(),
                scanMethod: 'textLayer',
                cacheVersion: 5,
            }, { merge: true })
        }

        await batch.commit()
        logger.info(`[PrintPipeline] Cached chords for ${fileId}: ${result.totalChords} chords across ${result.pages.length} pages`)
    } catch (err) {
        logger.warn(`[PrintPipeline] Chord cache write failed for ${fileId}:`, err)
    }
}

// ── Result Cache (Firebase Storage) ──

const RESULT_CACHE_BUCKET_PATH = 'print-cache'

async function getCachedResult(hash: string): Promise<Uint8Array | null> {
    try {
        const bucket = getStorage().bucket()
        const file = bucket.file(`${RESULT_CACHE_BUCKET_PATH}/${hash}.pdf`)
        const [exists] = await file.exists()
        if (!exists) return null

        const [buffer] = await file.download()
        logger.info(`[PrintPipeline] Result cache hit: ${hash}`)
        return new Uint8Array(buffer)
    } catch {
        return null
    }
}

async function cacheResult(hash: string, pdf: Uint8Array): Promise<void> {
    try {
        const bucket = getStorage().bucket()
        const file = bucket.file(`${RESULT_CACHE_BUCKET_PATH}/${hash}.pdf`)
        await file.save(Buffer.from(pdf), {
            contentType: 'application/pdf',
            metadata: {
                cacheControl: 'public, max-age=604800', // 7 days
                customMetadata: { generatedAt: new Date().toISOString() },
            },
        })
        logger.info(`[PrintPipeline] Cached result: ${hash}`)
    } catch (err) {
        logger.warn(`[PrintPipeline] Result cache write failed:`, err)
    }
}

// ── Cover Page Builder ──

/**
 * Sanitise a string for a pdf-lib StandardFont.
 *
 * The cover page draws with Helvetica, which is WinAnsi/CP1252 only. pdf-lib
 * THROWS on an unencodable codepoint — from `drawText` *and* from
 * `widthOfTextAtSize` — so a single Hebrew character in a track title used to
 * take down gig-packet generation for the whole setlist. Mirrors
 * `clean()` in src/lib/pdf/service-sheet-pdf.ts: Hebrew degrades to '?' rather
 * than crashing or corrupting the document. Every string this page measures or
 * draws goes through here, and it must run BEFORE any width measurement.
 */
function clean(s: unknown): string {
    if (typeof s !== "string") return ""
    // toWinAnsi maps every codepoint above 0xFF to '?', which would turn the
    // existing bullet separators (U+2022, used in the congregation's configured
    // printFooter) into question marks. U+00B7 MIDDLE DOT is inside WinAnsi and
    // is the separator glyph the rabbi's service sheet already uses.
    return toWinAnsi(s.replace(/•/g, "·"))
        // Control characters are the asymmetric trap: pdf-lib's drawText
        // TOLERATES them (it splits lines on \n) but widthOfTextAtSize THROWS.
        // Any cell that is measured therefore rejects the entire packet. Track
        // notes are edited in a free multi-line <textarea>
        // (grid/MobileRowCard.tsx), so a newline here is ordinary use, not a
        // synthetic input. toWinAnsi leaves them alone — they are all inside
        // 0x00-0xFF — so they have to be stripped here. Collapsing whitespace
        // afterwards keeps a wrapped note from printing as a ragged gap.
        .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Cover-table page geometry — US Letter portrait, 50pt side margins. */
const COVER_PAGE_W = 612
const COVER_PAGE_H = 792
/**
 * Lowest baseline a table row may occupy. The packet footer draws at y=30
 * (occupying roughly y=30-39 at size 9), and a NORMAL row's zebra rectangle
 * extends 4pt below its baseline (a header row's extends 8pt, but header rows
 * break at `yOffset - 4`, which lands at the same floor) — so 50 keeps even
 * the deepest row band clear of the footer with room to spare. This was the
 * old truncation cap; it is now the page-break trigger instead.
 */
const COVER_ROW_BOTTOM = 50
/** First row-band baseline on a continuation page (no header block above it). */
const COVER_CONTINUATION_TOP = COVER_PAGE_H - 60

async function buildCoverPage(
    mergedPdf: PDFDocument,
    req: PrintRequest,
    hasTranspositions: boolean,
    printFooter: string
): Promise<void> {
    // Phase-4 fix wave: the cover table PAGINATES. It used to be one page that
    // dropped every row past `yOffset < 60` with no marker — 26 rows for a
    // "Prepared for" packet, 29 for a public one, against production templates
    // of 30, 28 and 21 tracks. Once the folio column moved onto this page that
    // truncation started eating prayer-book page numbers: a Shabbat-morning
    // packet printed folios through the middle of the service and stopped
    // before Aleinu and Mourner's Kaddish.
    //
    // `page` is reassigned on every break, so every draw helper below closes
    // over the CURRENT page rather than capturing the first one.
    let page: PDFPage = mergedPdf.addPage([COVER_PAGE_W, COVER_PAGE_H])
    /** Every page of the cover table, in order. The footer is drawn on each. */
    const tablePages: PDFPage[] = [page]

    const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
    const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica)
    const helveticaOblique = await mergedPdf.embedFont(StandardFonts.HelveticaOblique)

    const { width, height } = page.getSize()

    // ── Header block — PAGE 1 ONLY ──
    // Continuation pages carry the column headers and rows, nothing else.

    // Title. Sized to FIT the content width rather than a fixed 28pt — at 28pt
    // a realistic service title ("Shabbat Morning — Parashat
    // Nitzavim-Vayeilech — September 5") measured ~830pt against this page's
    // 512pt content width and ran off the right edge of the paper, drawn in
    // full and never truncated. Character caps have caused two off-page bugs
    // in this file already (the header title and the notes cell both used to
    // cap by length); `widthOfTextAtSize` is the only correct instrument, so
    // the title shrinks by measured width and only ellipsizes — by measured
    // width, never by character count — if it still doesn't fit at the floor.
    const titleContentWidth = (width - 50) - 50
    let titleSize = 16
    let titleText = clean(req.title)
    while (titleSize > 11 && helveticaBold.widthOfTextAtSize(titleText, titleSize) > titleContentWidth) {
        titleSize -= 0.5
    }
    if (helveticaBold.widthOfTextAtSize(titleText, titleSize) > titleContentWidth) {
        let n = titleText.length
        while (n > 5 && helveticaBold.widthOfTextAtSize(titleText.substring(0, n) + "...", titleSize) > titleContentWidth) {
            n--
        }
        titleText = titleText.substring(0, n) + "..."
    }
    page.drawText(titleText, {
        x: 50, y: height - 52, size: titleSize,
        font: helveticaBold, color: rgb(0, 0, 0),
    })

    // Date
    const dateText = clean(req.date)
    const dateY = height - 70
    page.drawText(dateText, {
        x: 50, y: dateY, size: 10,
        font: helvetica, color: rgb(0.4, 0.4, 0.4),
    })

    let yOffset = height - 86

    // Prayer book (Phase 4). Drawn on the SAME line as the date when it fits,
    // in the same brand blue as the folio column so the eye ties `p. 12` to
    // the book it indexes. Both sibling renderers already name the book — the
    // iPad (SetlistPerformClient) and the rabbi's sheet
    // (pdf/service-sheet-pdf) — and this packet is the one a musician carries
    // next to another week's. No book on the setlist → nothing is drawn.
    // Never a placeholder. Falls back to its own line beneath the date only
    // when the combined date + separator + book would overrun the content
    // width — the shrunk-header-block trade-off buys back vertical space, and
    // this is the one place that could give it back if a book title runs long.
    const coverBookTitle = clean(req.bookTitle)
    if (coverBookTitle) {
        const dateWidth = helvetica.widthOfTextAtSize(dateText, 10)
        const sep = " · "
        const sepWidth = helvetica.widthOfTextAtSize(sep, 10)
        const bookWidth = helvetica.widthOfTextAtSize(coverBookTitle, 10)
        if (50 + dateWidth + sepWidth + bookWidth <= width - 50) {
            page.drawText(sep, {
                x: 50 + dateWidth, y: dateY, size: 10,
                font: helvetica, color: rgb(0.4, 0.4, 0.4),
            })
            page.drawText(coverBookTitle, {
                x: 50 + dateWidth + sepWidth, y: dateY, size: 10,
                font: helvetica, color: rgb(0.2, 0.4, 0.8),
            })
        } else {
            page.drawText(coverBookTitle, {
                x: 50, y: yOffset, size: 10,
                font: helvetica, color: rgb(0.2, 0.4, 0.8),
            })
            yOffset -= 14
        }
    }

    if (req.eventName) {
        page.drawText(clean(req.eventName), {
            x: 50, y: yOffset, size: 10,
            font: helvetica, color: rgb(0.4, 0.4, 0.4),
        })
        yOffset -= 14
    }

    if (req.rabbi) {
        page.drawText(`Led by: ${clean(req.rabbi)}`, {
            x: 50, y: yOffset, size: 10,
            font: helvetica, color: rgb(0.4, 0.4, 0.4),
        })
        yOffset -= 14
    }

    if (req.musicianName) {
        page.drawText(`Prepared for: ${clean(req.musicianName)}`, {
            x: 50, y: yOffset, size: 10,
            font: helveticaBold, color: rgb(0, 0, 0),
        })
        yOffset -= 18
    }

    // Divider
    yOffset -= 8
    page.drawLine({
        start: { x: 50, y: yOffset }, end: { x: width - 50, y: yOffset },
        thickness: 1.5, color: rgb(0.2, 0.4, 0.8),
    })
    yOffset -= 16

    // Column positions
    const colNum = 50
    const colTitle = 75
    const colKey = hasTranspositions ? 280 : 310
    // colLead shifted left 20pt in v51-04 so the "Vocal Lead" header
    // (~52pt wide @ 10pt Helvetica-Bold) fits without overflowing colTransKey
    // (with-trans variant) or colNotes (no-trans variant).
    const colLead = hasTranspositions ? 360 : 410
    const colTransKey = 430
    const colNotes = hasTranspositions ? 490 : 475

    // ── Folio column (Phase 4) ──
    // The printed page in the prayer book the congregation is holding. Mirrors
    // the rabbi's sheet (src/lib/pdf/service-sheet-pdf.ts): right-aligned,
    // `p. <n>`, in a column RESERVED before any row text is drawn.
    //
    // The reservation is the point. The service sheet shipped a bug where an
    // unwrapped cue line ran a congregant's name past the physical edge of the
    // paper inside a perfectly valid PDF. This table had the same latent
    // defect: the Notes cell is capped by CHARACTER COUNT (maxNotesLen), never
    // by width, so 18 wide glyphs at x=475 already ran off the right edge of
    // the page. `rowRight` is now the single width budget every cell on the row
    // is measured against, so nothing can reach the folio or the paper's edge.
    const FOLIO_LABEL = "Page"
    const FOLIO_GUTTER = 8
    const FOLIO_SIZE = 9
    const contentRight = width - 50
    /** `p. <n>` for a row that has a folio, `""` for one that doesn't. A row
     *  with no liturgyRef prints no number and never blocks generation. */
    const folioTextFor = (t: PrintTrack): string => {
        const f = t.liturgyRef?.folio
        return typeof f === "number" && Number.isFinite(f) ? clean(`p. ${f}`) : ""
    }
    const folioTexts = req.tracks.map(folioTextFor)
    const anyFolio = folioTexts.some(Boolean)
    const folioColW = anyFolio
        ? Math.max(
            helveticaBold.widthOfTextAtSize(FOLIO_LABEL, 10),
            ...folioTexts.map(s => (s ? helveticaBold.widthOfTextAtSize(s, FOLIO_SIZE) : 0)),
        )
        : 0
    /** Right-hand limit for every non-folio cell on a row. */
    const rowRight = anyFolio ? contentRight - folioColW - FOLIO_GUTTER : contentRight
    const drawFolio = (text: string, y: number) => {
        page.drawText(text, {
            x: contentRight - helveticaBold.widthOfTextAtSize(text, FOLIO_SIZE),
            y, size: FOLIO_SIZE, font: helveticaBold, color: rgb(0.2, 0.4, 0.8),
        })
    }

    /**
     * Column-header band + rule, drawn at the current yOffset and advancing past
     * it. Called once under the page-1 header block and again at the top of
     * every continuation page — a table that continues without repeating its
     * headers is a table whose right-hand "Page" column is unlabelled.
     */
    const drawColumnHeaders = () => {
        page.drawText("#", { x: colNum, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText("Song", { x: colTitle, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText("Key", { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        page.drawText("Vocal Lead", { x: colLead, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        if (hasTranspositions) {
            page.drawText("As", { x: colTransKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        }
        page.drawText("Notes", { x: colNotes, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        if (anyFolio) {
            page.drawText(FOLIO_LABEL, {
                x: contentRight - helveticaBold.widthOfTextAtSize(FOLIO_LABEL, 10),
                y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4),
            })
        }

        yOffset -= 8
        page.drawLine({
            start: { x: 50, y: yOffset }, end: { x: width - 50, y: yOffset },
            thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
        })
        yOffset -= 14
    }

    /** Break to a fresh table page and re-establish the column headers. */
    const startContinuationPage = () => {
        page = mergedPdf.addPage([COVER_PAGE_W, COVER_PAGE_H])
        tablePages.push(page)
        yOffset = COVER_CONTINUATION_TOP
        drawColumnHeaders()
    }

    drawColumnHeaders()

    // Rows — show all items in the order of service (songs, readings, prayers, headers)
    const printableTracks = req.tracks
    let rowNum = 0
    let songNum = 0
    printableTracks.forEach((track, trackIdx) => {
        const trackType = track.type || 'song'

        // A cover-table row is an ATOMIC single baseline: number, title, key,
        // lead, transposed key, notes and folio all draw at the same y (header
        // rows one notch lower, after their extra 4pt of lead-in). Deciding to
        // break BEFORE any ink is laid down is what makes it impossible for a
        // row — or its folio — to be split across two pages.
        const rowBaseline = trackType === 'header' ? yOffset - 4 : yOffset
        if (rowBaseline < COVER_ROW_BOTTOM) startContinuationPage()

        const isServiceFlow = trackType !== 'song'
        const rowFolio = folioTexts[trackIdx]

        // Determine font and max width constraints based on layout and track type
        const titleFont = isServiceFlow ? helveticaOblique : helvetica
        const titleColor = isServiceFlow ? rgb(0.4, 0.4, 0.4) : rgb(0, 0, 0)
        let finalTitleSize = 10
        let songTitle = clean(track.title)

        if (trackType === 'header') {
            // Capped against the reserved folio column, not just the nominal 300.
            const headerMax = Math.max(40, Math.min(300, rowRight - colTitle))
            // Re-cleaned AFTER the case fold: case folding can leave WinAnsi.
            // "µ" (U+00B5) upper-cases to U+039C GREEK CAPITAL MU, and the
            // very next line measures it.
            let headerTitle = clean(songTitle.toUpperCase())
            while (finalTitleSize > 7 && helveticaBold.widthOfTextAtSize(headerTitle, finalTitleSize) > headerMax) finalTitleSize -= 0.5
            if (helveticaBold.widthOfTextAtSize(headerTitle, finalTitleSize) > headerMax) {
                let truncateLen = headerTitle.length
                while (truncateLen > 5 && helveticaBold.widthOfTextAtSize(headerTitle.substring(0, truncateLen) + "...", finalTitleSize) > headerMax) truncateLen--
                headerTitle = headerTitle.substring(0, truncateLen) + "..."
            }
            songTitle = headerTitle
        } else {
            const maxAvailableWidth = Math.max(
                40, Math.min(hasTranspositions ? 190 : 220, rowRight - colTitle),
            )
            while (finalTitleSize > 6.5 && titleFont.widthOfTextAtSize(songTitle, finalTitleSize) > maxAvailableWidth) finalTitleSize -= 0.5
            if (titleFont.widthOfTextAtSize(songTitle, finalTitleSize) > maxAvailableWidth) {
                let truncateLen = songTitle.length
                while (truncateLen > 5 && titleFont.widthOfTextAtSize(songTitle.substring(0, truncateLen) + "...", finalTitleSize) > maxAvailableWidth) truncateLen--
                songTitle = songTitle.substring(0, truncateLen) + "..."
            }
        }

        const cleanKey = clean(track.key)
        const key = isServiceFlow ? "" : (cleanKey || "-")
        const maxLeadLen = hasTranspositions ? 12 : 15
        const lead = isServiceFlow ? clean(track.performer) : clean(track.leadMusician)
        const leadDisplay = lead.length > maxLeadLen
            ? lead.substring(0, maxLeadLen - 3) + "..." : lead

        // estimatedMinutes is typed `number`, but /api/setlist/print validates
        // its tracks with `z.array(z.any())` passthrough, so at runtime it is
        // whatever the client sent. Interpolating it unsanitised would put an
        // arbitrary string into a measured cell.
        let notesStr = isServiceFlow
            ? (track.estimatedMinutes ? clean(`~${track.estimatedMinutes} min`) : "")
            : clean(track.notes)
        if (!isServiceFlow && track.capoFret && track.capoFret > 0) {
            const capoNote = `Capo ${track.capoFret}`
            // Composed AFTER clean(track.notes), so the literal separator has to
            // be re-cleaned or it reaches drawText as a raw U+2022.
            notesStr = clean(notesStr ? `${capoNote} • ${notesStr}` : capoNote)
        }
        const maxNotesLen = hasTranspositions ? 14 : 18
        let notesDisplay = notesStr.length > maxNotesLen
            ? notesStr.substring(0, maxNotesLen - 3) + "..." : notesStr

        // Notes are the rightmost cell, so they are what would run into the
        // reserved folio column — or, before this change, straight off the
        // right edge of the paper, since the cap above counts characters and
        // never measures them. Measure and re-truncate against rowRight.
        const notesMaxW = Math.max(0, rowRight - colNotes)
        if (notesDisplay && helveticaOblique.widthOfTextAtSize(notesDisplay, 9) > notesMaxW) {
            let n = notesDisplay.length
            while (n > 1 && helveticaOblique.widthOfTextAtSize(notesDisplay.substring(0, n) + "...", 9) > notesMaxW) n--
            const candidate = notesDisplay.substring(0, n) + "..."
            // If even one glyph plus the ellipsis doesn't fit, drop the cell
            // rather than draw something that overlaps the folio.
            notesDisplay = helveticaOblique.widthOfTextAtSize(candidate, 9) <= notesMaxW ? candidate : ""
        }

        // Built from the CLEANED key, and cleaned again on the way out:
        // getTransposedKeyName returns its input unchanged when the key doesn't
        // match ^[A-G], so an unsanitised key would pass straight through to
        // drawText even though the adjacent key cell is clean.
        const transKey = (!isServiceFlow && track.transposition && track.transposition !== 0 && cleanKey)
            ? clean(getTransposedKeyName(cleanKey, track.transposition)) : null

        rowNum++

        // Draw alternating background row for zebra striping for ALL rows (including headers)
        if (rowNum % 2 === 0) {
            page.drawRectangle({
                x: 45,
                y: trackType === 'header' ? yOffset - 8 : yOffset - 4,
                width: width - 90,
                height: trackType === 'header' ? 18 : 14,
                color: rgb(0.96, 0.96, 0.97), // very slightly gray/cool
            })
        }

        // Headers render as bold centered labels (no number)
        if (trackType === 'header') {
            yOffset -= 4 // Extra space before header
            page.drawText(songTitle, { x: colTitle, y: yOffset, size: finalTitleSize, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
            if (rowFolio) drawFolio(rowFolio, yOffset)
            yOffset -= 16
            return
        }

        songNum++

        page.drawText(`${songNum}.`, { x: colNum, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
        page.drawText(songTitle, { x: colTitle, y: yOffset, size: finalTitleSize, font: titleFont, color: titleColor })
        if (leadDisplay) page.drawText(leadDisplay, { x: colLead, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
        if (key) page.drawText(key, { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) })
        if (hasTranspositions && transKey) {
            page.drawText(transKey, { x: colTransKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.42, 0.16, 0.84) })
        }
        if (notesDisplay) page.drawText(notesDisplay, { x: colNotes, y: yOffset, size: 9, font: helveticaOblique, color: rgb(0.5, 0.5, 0.5) })
        if (rowFolio) drawFolio(rowFolio, yOffset)

        yOffset -= 16
    })

    // Footer — on EVERY table page. A continuation page with no footer reads as
    // a stray sheet; the band prints these double-sided and shuffles them.
    const songCount = printableTracks.filter(t => !t.type || t.type === 'song').length
    const footerParts = [`${songCount} song${songCount !== 1 ? 's' : ''}`]
    if (hasTranspositions) footerParts.push("transposed")
    footerParts.push(clean(printFooter))
    const footerText = clean(footerParts.join(" • "))
    for (const tablePage of tablePages) {
        tablePage.drawText(footerText, {
            x: 50, y: 30, size: 9, font: helvetica, color: rgb(0.6, 0.6, 0.6),
        })
    }
}

// ── Service Flow Item Renderer ──

/**
 * Render a non-song service flow item (header, reading, prayer, transition, note)
 * as a formatted label/card in the printed PDF.
 *
 * DEAD CODE — nothing calls this. Service-flow rows have no `fileId`, and
 * `generatePrintPdf` skips them outright ("they appear on cover page only"), so
 * the cover-page table in `buildCoverPage` is the only place such a row is drawn.
 *
 * It is also the ONLY drawing code in this file that does not sanitise: every
 * `drawText`/`widthOfTextAtSize` below takes a raw `track.*` string, and
 * `widthOfTextAtSize` throws on a control character or any codepoint outside
 * WinAnsi. If you ever wire this up, route every string through `clean()` first.
 */
async function renderServiceFlowItem(
    doc: PDFDocument,
    track: PrintTrack
): Promise<void> {
    const helvetica = await doc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique)

    const type = track.type || 'note'
    const pageWidth = 612 // Letter width in points

    // Headers: add a subtle separator — no new page, just a small divider section
    if (type === 'header') {
        const page = doc.addPage([pageWidth, 100]) // Short "page" acts as a divider
        const title = track.title.toUpperCase()
        const titleWidth = helveticaBold.widthOfTextAtSize(title, 14)
        page.drawText(title, {
            x: (pageWidth - titleWidth) / 2,
            y: 45,
            size: 14,
            font: helveticaBold,
            color: rgb(0.25, 0.25, 0.25),
        })
        // Underline
        page.drawLine({
            start: { x: pageWidth * 0.2, y: 38 },
            end: { x: pageWidth * 0.8, y: 38 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
        })
        return
    }

    // Transition: thin separator with label — minimal height
    if (type === 'transition') {
        const page = doc.addPage([pageWidth, 60])
        const label = `— ${track.title} —`
        const labelWidth = helveticaOblique.widthOfTextAtSize(label, 10)
        page.drawText(label, {
            x: (pageWidth - labelWidth) / 2,
            y: 28,
            size: 10,
            font: helveticaOblique,
            color: rgb(0.5, 0.5, 0.5),
        })
        if (track.estimatedMinutes) {
            const dur = `~${track.estimatedMinutes} min`
            const durWidth = helvetica.widthOfTextAtSize(dur, 8)
            page.drawText(dur, {
                x: (pageWidth - durWidth) / 2,
                y: 14,
                size: 8,
                font: helvetica,
                color: rgb(0.6, 0.6, 0.6),
            })
        }
        return
    }

    // Note: italic text block
    if (type === 'note') {
        const page = doc.addPage([pageWidth, 60])
        const text = track.title || track.description || ''
        if (text) {
            const textWidth = helveticaOblique.widthOfTextAtSize(text, 10)
            page.drawText(text, {
                x: (pageWidth - textWidth) / 2,
                y: 28,
                size: 10,
                font: helveticaOblique,
                color: rgb(0.4, 0.4, 0.4),
            })
        }
        return
    }

    // Reading / Prayer: formatted card with title, performer, duration, description
    const cardHeight = track.description ? 120 : 80
    const page = doc.addPage([pageWidth, cardHeight])

    // Title
    const titleWidth = helveticaBold.widthOfTextAtSize(track.title.toUpperCase(), 13)

    // Draw title centered
    page.drawText(track.title.toUpperCase(), {
        x: (pageWidth - titleWidth) / 2,
        y: cardHeight - 30,
        size: 13,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
    })

    // Performer + Duration line
    const metaParts: string[] = []
    if (track.performer) metaParts.push(track.performer)
    if (track.estimatedMinutes) metaParts.push(`~${track.estimatedMinutes} min`)
    if (metaParts.length > 0) {
        const metaText = metaParts.join('  •  ')
        const metaWidth = helvetica.widthOfTextAtSize(metaText, 10)
        page.drawText(metaText, {
            x: (pageWidth - metaWidth) / 2,
            y: cardHeight - 48,
            size: 10,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
        })
    }

    // Description
    if (track.description) {
        const descWidth = helveticaOblique.widthOfTextAtSize(track.description, 10)
        page.drawText(track.description, {
            x: (pageWidth - Math.min(descWidth, pageWidth - 100)) / 2,
            y: cardHeight - 70,
            size: 10,
            font: helveticaOblique,
            color: rgb(0.4, 0.4, 0.4),
            maxWidth: pageWidth - 100,
        })
    }

    // Bottom rule
    page.drawLine({
        start: { x: pageWidth * 0.15, y: 10 },
        end: { x: pageWidth * 0.85, y: 10 },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.8),
    })
}

// ── Image Track Embed (v70-01-02) ──

/**
 * Embed an image-typed track (PNG / JPEG) as its own letter-size page.
 *
 * HEIC is server-converted to JPEG at upload time (v70-01-01 Task 1), so a raw
 * HEIC byte stream should never reach here — if one does, it is logged and
 * skipped rather than throwing.
 *
 * Returns `true` only on a successful embed. Every failure path (missing file,
 * empty buffer, unsupported/corrupt image, pdf-lib decode throw) is caught,
 * logged with a structured warning, and returns `false` so the rest of the
 * packet still prints. Mirrors the per-track resilience of the PDF merge path.
 *
 * Known limitation: `embedJpg` draws raw pixels and does NOT honor EXIF
 * orientation tags — a phone photo may embed rotated. Tracked as a carry-forward.
 *
 * Image source bytes are capped at 25MB by `/api/library/upload` (MAX_FILE_SIZE),
 * so no separate size guard is needed here.
 *
 * Layout per /ui-ux-pro-max: 18pt margin (maximizes chart size for stage reading,
 * consistent with the edge-merged PDF chart pages), aspect-preserved, centered,
 * no title caption (the cover page already lists every track's title/key/lead).
 */
async function embedImageTrack(mergedPdf: PDFDocument, track: PrintTrack): Promise<boolean> {
    try {
        const fetched = await fetchFileById(track.fileId!, track.mimeType)
        if (!fetched || fetched.buffer.byteLength === 0) {
            logger.warn(`[PrintPipeline] Image embed: empty or missing file for "${track.title}" (fileId ${track.fileId})`)
            return false
        }

        const signal = `${fetched.contentType} ${track.mimeType ?? ''} ${track.fileName ?? track.fileId ?? ''}`.toLowerCase()

        if (/heic|heif/.test(signal)) {
            logger.warn(`[PrintPipeline] Image embed: unexpected raw HEIC at print time for "${track.title}" (fileId ${track.fileId}) — skipping`)
            return false
        }

        const isJpeg = /jpeg|jpg/.test(signal)
        const isPng = /png/.test(signal)
        if (!isJpeg && !isPng) {
            logger.warn(`[PrintPipeline] Image embed: unsupported image type "${fetched.contentType}" for "${track.title}" (fileId ${track.fileId}) — skipping`)
            return false
        }

        const image = isJpeg
            ? await mergedPdf.embedJpg(fetched.buffer)
            : await mergedPdf.embedPng(fetched.buffer)

        const PAGE_W = 612, PAGE_H = 792, MARGIN = 18
        const page = mergedPdf.addPage([PAGE_W, PAGE_H])
        const dims = image.scaleToFit(PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2)
        page.drawImage(image, {
            x: (PAGE_W - dims.width) / 2,
            y: (PAGE_H - dims.height) / 2,
            width: dims.width,
            height: dims.height,
        })
        return true
    } catch (err) {
        logger.warn(`[PrintPipeline] Image embed failed for "${track.title}" (fileId ${track.fileId}): ${err instanceof Error ? err.message : String(err)}`)
        return false
    }
}

// ── Main Pipeline ──

export async function generatePrintPdf(
    req: PrintRequest,
    onProgress?: (progress: PrintProgress) => void
): Promise<PrintResult> {
    initAdmin()

    const stats = {
        totalTracks: req.tracks.filter(t => t.fileId).length,
        appendedTracks: 0,
        transposedTracks: 0,
        cacheHits: 0,
        cacheMisses: 0,
        fromResultCache: false,
    }

    // ── Step 0: Check result cache ──
    const contentHash = computeContentHash(req)
    const cachedPdf = await getCachedResult(contentHash)
    if (cachedPdf) {
        stats.fromResultCache = true
        return { pdf: cachedPdf, stats }
    }

    onProgress?.({
        phase: 'preparing', currentTrack: 0, totalTracks: stats.totalTracks,
        currentTitle: '', message: 'Preparing print job...',
    })

    const hasTranspositions = req.tracks.some(t => t.transposition && t.transposition !== 0)

    // Read congregation branding (v11-05-04: per-org doc; crc = bare doc).
    let printFooter = "Generated by CRC Music Books • a project of Rabbi Daniel Bogard"
    try {
        const org = coerceOrgId(req.org)
        const configSnap = await getFirestore().collection("config").doc(congregationDocId(org)).get()
        if (configSnap.exists) {
            printFooter = configSnap.data()?.printFooter || printFooter
        }
    } catch { /* default footer */ }

    // ── Step 1: Build merged PDF with cover page ──
    const mergedPdf = await PDFDocument.create()
    await buildCoverPage(mergedPdf, req, hasTranspositions, printFooter)

    // ── Step 1b: Cover-only mode — skip all track processing ──
    if (req.coverOnly) {
        const finalPdfBytes = await mergedPdf.save()
        const pdf = new Uint8Array(finalPdfBytes)
        cacheResult(contentHash, pdf).catch(err => logger.warn("[PrintPipeline] Result cache write failed:", err))
        logger.info(`[PrintPipeline] Cover-only complete for "${req.title}"`)
        return { pdf, stats }
    }

    // ── Step 2: Lazy-load transposition modules ──
    let extractChordsFromPdf: typeof import("@/lib/pdf-chord-extractor")["extractChordsFromPdf"] | null = null
    let transposePdf: typeof import("@/lib/pdf-transpose-renderer")["transposePdf"] | null = null

    if (hasTranspositions) {
        try {
            const extractor = await import("@/lib/pdf-chord-extractor")
            const renderer = await import("@/lib/pdf-transpose-renderer")
            extractChordsFromPdf = extractor.extractChordsFromPdf
            transposePdf = renderer.transposePdf
        } catch (err) {
            logger.error("[PrintPipeline] Failed to load transposition modules:", err)
        }
    }

    // ── Step 2.5: library_index mimeType backstop ──
    // Track docs bound via the picker / chart-binder don't reliably carry
    // `mimeType` (and never carry `fileName`) — so the client-forwarded signal
    // that isImageTrack() depends on is often absent, especially for
    // Drive-synced charts. Resolve the missing mimeType server-side from the
    // authoritative `library_index.{fileId}.mimeType` before per-track type
    // routing, so image charts route to embedImageTrack instead of silently
    // falling through to the PDF merge path. One batched read per print job.
    const libIndexMime = new Map<string, string>()
    const missingMimeFileIds = [
        ...new Set(req.tracks.filter(t => t.fileId && !t.mimeType).map(t => t.fileId!)),
    ]
    if (missingMimeFileIds.length > 0) {
        try {
            const db = getFirestore()
            const refs = missingMimeFileIds.map(id => db.collection("library_index").doc(id))
            const snaps = await db.getAll(...refs)
            for (const snap of snaps) {
                const mt = snap.exists ? (snap.data()?.mimeType as string | undefined) : undefined
                if (mt) libIndexMime.set(snap.id, mt)
            }
        } catch (err) {
            logger.warn("[PrintPipeline] library_index mimeType backstop failed:", err)
        }
    }

    // ── Step 3: Process each track ──
    let trackIndex = 0
    for (const track of req.tracks) {
        // Skip non-song service flow items (they appear on cover page only)
        if (!track.fileId && track.type && track.type !== 'song') {
            continue
        }

        if (!track.fileId || track.omitPdf) continue

        // Apply the library_index mimeType backstop: a track bound without a
        // persisted mimeType still gets correctly routed below.
        if (!track.mimeType && libIndexMime.has(track.fileId)) {
            track.mimeType = libIndexMime.get(track.fileId)
        }

        // v70-01-02: image-typed tracks (PNG/JPEG) embed as their own letter-size
        // page via embedImageTrack. Image tracks carry fileId, so they are already
        // counted in stats.totalTracks — incrementing trackIndex + appendedTracks
        // here keeps progress reporting and stats accurate. A failed embed returns
        // false (logged) and is simply not counted; the rest of the packet prints.
        if (isImageTrack(track)) {
            trackIndex++
            onProgress?.({
                phase: 'processing', currentTrack: trackIndex, totalTracks: stats.totalTracks,
                currentTitle: track.title, message: `Processing: ${track.title}`,
            })
            const embedded = await embedImageTrack(mergedPdf, track)
            if (embedded) stats.appendedTracks++
            continue
        }
        trackIndex++

        onProgress?.({
            phase: 'processing', currentTrack: trackIndex, totalTracks: stats.totalTracks,
            currentTitle: track.title, message: `Processing: ${track.title}`,
        })

        try {
            // Fetch PDF — Storage first, Drive fallback
            const fetched = await fetchFileById(track.fileId)
            if (!fetched || fetched.buffer.byteLength === 0) {
                logger.warn(`[PrintPipeline] Empty or missing file: ${track.title}`)
                continue
            }

            // Text/plain scraped chord charts can't be parsed by PDFDocument.load
            // (it throws on non-PDF bytes → caught below → the chart was silently
            // dropped from the packet). Render them to monospace Courier pages
            // instead — chord-over-lyric, transpose-aware — matching the Perform
            // TextScoreViewer. Shared with MCP generate_gig_packet.
            const fetchedCt = (fetched.contentType || "").toLowerCase()
            if (fetchedCt.startsWith("text/")) {
                await renderTextChartToPdf(
                    mergedPdf,
                    track.title,
                    Buffer.from(fetched.buffer).toString("utf-8"),
                    { transposition: track.transposition, preferFlats: track.preferFlats },
                )
                stats.appendedTracks++
                continue
            }

            let pdfBytes = new Uint8Array(fetched.buffer)

            // Transpose if needed
            const needsTransposition = track.transposition && track.transposition !== 0
                && extractChordsFromPdf && transposePdf

            if (needsTransposition) {
                try {
                    logger.info(`[PrintPipeline] Transposing ${track.title}: ${track.transposition! > 0 ? '+' : ''}${track.transposition}`)

                    // Try chord cache first
                    let extraction = await getCachedChords(track.fileId)

                    if (extraction && extraction.totalChords > 0) {
                        stats.cacheHits++
                        logger.info(`[PrintPipeline] Chord cache HIT for ${track.title}: ${extraction.totalChords} chords`)
                    } else {
                        stats.cacheMisses++
                        // Extract chords via OCR
                        extraction = await extractChordsFromPdf!(pdfBytes)
                        logger.info(`[PrintPipeline] Chord cache MISS for ${track.title}: extracted ${extraction.totalChords} chords`)

                        // Cache for next time (fire-and-forget)
                        if (extraction.totalChords > 0) {
                            cacheChords(track.fileId, extraction).catch(err => logger.warn(`[PrintPipeline] Chord cache write failed for ${track.title}:`, err))
                        }
                    }

                    if (extraction.totalChords > 0) {
                        const transposeResult = await transposePdf!(
                            pdfBytes, extraction.pages,
                            {
                                semitones: track.transposition!,
                                preferFlats: track.preferFlats,
                                capoFret: track.capoFret,
                            }
                        )
                        pdfBytes = new Uint8Array(transposeResult.pdf)
                        stats.transposedTracks++
                    }
                } catch (err) {
                    logger.error(`[PrintPipeline] Transposition failed for ${track.title}:`, err)
                    // Fall back to original PDF
                }
            }

            // Merge into final document
            try {
                const sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
                const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
                pages.forEach(page => mergedPdf.addPage(page))
                stats.appendedTracks++
            } catch (err) {
                logger.error(`[PrintPipeline] PDF parse error for ${track.title}:`, err)
            }
        } catch (err) {
            logger.error(`[PrintPipeline] Failed to fetch ${track.title}:`, err)
        }
    }

    // ── Step 4: Generate final PDF ──
    onProgress?.({
        phase: 'merging', currentTrack: stats.totalTracks, totalTracks: stats.totalTracks,
        currentTitle: '', message: 'Generating final PDF...',
    })

    const finalPdfBytes = await mergedPdf.save()
    const pdf = new Uint8Array(finalPdfBytes)

    // Cache result for future requests (fire-and-forget)
    cacheResult(contentHash, pdf).catch(err => logger.warn("[PrintPipeline] Result cache write failed:", err))

    logger.info(`[PrintPipeline] Complete: ${stats.appendedTracks} files, ${stats.transposedTracks} transposed, ${stats.cacheHits} cache hits, ${stats.cacheMisses} misses`)

    return { pdf, stats }
}

// ── Pre-extraction (warm the chord cache for a setlist) ──

export interface PreExtractResult {
    total: number
    extracted: number
    alreadyCached: number
    errors: number
}

/**
 * Pre-extract chords for all files in a set of tracks.
 * Called when a setlist is opened to warm the cache before print time.
 * Each track is processed independently — failures don't affect others.
 */
export async function preExtractChords(fileIds: string[]): Promise<PreExtractResult> {
    initAdmin()
    const { extractChordsFromPdf } = await import("@/lib/pdf-chord-extractor")

    const result: PreExtractResult = { total: fileIds.length, extracted: 0, alreadyCached: 0, errors: 0 }

    for (const fileId of fileIds) {
        try {
            // Check if already cached
            const cached = await getCachedChords(fileId)
            if (cached && cached.totalChords > 0) {
                result.alreadyCached++
                continue
            }

            // Fetch from Storage (fast) or Drive (fallback)
            const fetched = await fetchFileById(fileId)
            if (!fetched || fetched.buffer.byteLength === 0) {
                result.errors++
                continue
            }

            const extraction = await extractChordsFromPdf(new Uint8Array(fetched.buffer))
            if (extraction.totalChords > 0) {
                await cacheChords(fileId, extraction)
                result.extracted++
            }
        } catch {
            result.errors++
        }
    }

    logger.info(`[PreExtract] Done: ${result.extracted} extracted, ${result.alreadyCached} cached, ${result.errors} errors`)
    return result
}

