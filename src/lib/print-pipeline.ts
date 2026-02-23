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

import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { fetchFileById } from "@/lib/file-fetcher"
import { getTransposedKeyName } from "@/lib/music-math"
import { initAdmin, getFirestore, getStorage } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createHash } from "crypto"
import type { ExtractionResult, PageChords, ExtractedChord } from "@/lib/pdf-chord-extractor"

// ── Types ──

export interface PrintTrack {
    title: string
    key: string
    notes: string
    leadMusician?: string
    fileId?: string
    transposition?: number
    preferFlats?: boolean
    capoFret?: number
    // Service flow fields
    type?: string
    performer?: string
    estimatedMinutes?: number
    description?: string
}

export interface PrintRequest {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    tracks: PrintTrack[]
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
        title: req.title,
        date: req.date,
        musicianName: req.musicianName,
        tracks: req.tracks.map(t => ({
            fileId: t.fileId,
            transposition: t.transposition || 0,
            preferFlats: t.preferFlats || false,
            capoFret: t.capoFret || 0,
        })),
    }
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

async function buildCoverPage(
    mergedPdf: PDFDocument,
    req: PrintRequest,
    hasTranspositions: boolean,
    printFooter: string
): Promise<void> {
    const coverPage = mergedPdf.addPage([612, 792])
    const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
    const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica)
    const helveticaOblique = await mergedPdf.embedFont(StandardFonts.HelveticaOblique)

    const { width, height } = coverPage.getSize()

    // Title
    coverPage.drawText(req.title, {
        x: 50, y: height - 80, size: 28,
        font: helveticaBold, color: rgb(0, 0, 0),
    })

    // Date
    coverPage.drawText(req.date, {
        x: 50, y: height - 110, size: 13,
        font: helvetica, color: rgb(0.4, 0.4, 0.4),
    })

    let yOffset = height - 138
    if (req.eventName) {
        coverPage.drawText(req.eventName, {
            x: 50, y: yOffset, size: 13,
            font: helvetica, color: rgb(0.4, 0.4, 0.4),
        })
        yOffset -= 22
    }

    if (req.musicianName) {
        coverPage.drawText(`Prepared for: ${req.musicianName}`, {
            x: 50, y: yOffset, size: 13,
            font: helveticaBold, color: rgb(0, 0, 0),
        })
        yOffset -= 28
    }

    // Divider
    yOffset -= 10
    coverPage.drawLine({
        start: { x: 50, y: yOffset }, end: { x: width - 50, y: yOffset },
        thickness: 1.5, color: rgb(0.2, 0.4, 0.8),
    })
    yOffset -= 25

    // Column positions
    const colNum = 50
    const colTitle = 75
    const colLead = hasTranspositions ? 280 : 310
    const colKey = hasTranspositions ? 380 : 430
    const colTransKey = 430
    const colNotes = hasTranspositions ? 490 : 475

    // Header
    coverPage.drawText("#", { x: colNum, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
    coverPage.drawText("Song", { x: colTitle, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
    coverPage.drawText("Lead", { x: colLead, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
    coverPage.drawText("Key", { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
    if (hasTranspositions) {
        coverPage.drawText("As", { x: colTransKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
    }
    coverPage.drawText("Notes", { x: colNotes, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })

    yOffset -= 8
    coverPage.drawLine({
        start: { x: 50, y: yOffset }, end: { x: width - 50, y: yOffset },
        thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    })
    yOffset -= 16

    // Rows
    req.tracks.forEach((track, index) => {
        if (yOffset < 60) return

        const trackType = track.type || 'song'
        const isServiceFlow = trackType !== 'song'

        const maxTitleLen = hasTranspositions ? 26 : 30
        const songTitle = track.title.length > maxTitleLen
            ? track.title.substring(0, maxTitleLen - 3) + "..." : track.title
        const key = isServiceFlow ? "" : (track.key || "-")
        const maxLeadLen = hasTranspositions ? 12 : 15
        const lead = isServiceFlow ? (track.performer || "") : (track.leadMusician || "")
        const leadDisplay = lead.length > maxLeadLen
            ? lead.substring(0, maxLeadLen - 3) + "..." : lead

        let notesStr = isServiceFlow
            ? (track.estimatedMinutes ? `~${track.estimatedMinutes} min` : "")
            : (track.notes || "")
        if (!isServiceFlow && track.capoFret && track.capoFret > 0) {
            const capoNote = `Capo ${track.capoFret}`
            notesStr = notesStr ? `${capoNote} • ${notesStr}` : capoNote
        }
        const maxNotesLen = hasTranspositions ? 14 : 18
        const notesDisplay = notesStr.length > maxNotesLen
            ? notesStr.substring(0, maxNotesLen - 3) + "..." : notesStr

        const transKey = (!isServiceFlow && track.transposition && track.transposition !== 0 && track.key)
            ? getTransposedKeyName(track.key, track.transposition) : null

        // Headers render as bold centered labels (no number)
        if (trackType === 'header') {
            yOffset -= 4 // Extra space before header
            coverPage.drawText(songTitle.toUpperCase(), { x: colTitle, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
            yOffset -= 18
            return
        }

        // Use italic font for non-song service flow items
        const titleFont = isServiceFlow ? helveticaOblique : helvetica
        const titleColor = isServiceFlow ? rgb(0.4, 0.4, 0.4) : rgb(0, 0, 0)

        coverPage.drawText(`${index + 1}.`, { x: colNum, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
        coverPage.drawText(songTitle, { x: colTitle, y: yOffset, size: 10, font: titleFont, color: titleColor })
        if (leadDisplay) coverPage.drawText(leadDisplay, { x: colLead, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
        if (key) coverPage.drawText(key, { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) })
        if (hasTranspositions && transKey) {
            coverPage.drawText(transKey, { x: colTransKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.42, 0.16, 0.84) })
        }
        if (notesDisplay) coverPage.drawText(notesDisplay, { x: colNotes, y: yOffset, size: 9, font: helveticaOblique, color: rgb(0.5, 0.5, 0.5) })

        yOffset -= 18
    })

    // Footer
    const songCount = req.tracks.filter(t => !t.type || t.type === 'song').length
    const footerParts = [`${songCount} song${songCount !== 1 ? 's' : ''}`]
    if (hasTranspositions) footerParts.push("transposed")
    footerParts.push(printFooter)
    coverPage.drawText(footerParts.join(" • "), {
        x: 50, y: 30, size: 9, font: helvetica, color: rgb(0.6, 0.6, 0.6),
    })
}

// ── Service Flow Item Renderer ──

/**
 * Render a non-song service flow item (header, reading, prayer, transition, note)
 * as a formatted label/card in the printed PDF.
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

    // Read congregation branding
    let printFooter = "Generated by CRC Music Books"
    try {
        const configSnap = await getFirestore().collection("config").doc("congregation").get()
        if (configSnap.exists) {
            printFooter = configSnap.data()?.printFooter || printFooter
        }
    } catch { /* default footer */ }

    // ── Step 1: Build merged PDF with cover page ──
    const mergedPdf = await PDFDocument.create()
    await buildCoverPage(mergedPdf, req, hasTranspositions, printFooter)

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

    // ── Step 3: Process each track ──
    let trackIndex = 0
    for (const track of req.tracks) {
        // Render non-song service flow items as formatted labels
        if (!track.fileId && track.type && track.type !== 'song') {
            await renderServiceFlowItem(mergedPdf, track)
            continue
        }

        if (!track.fileId) continue
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
