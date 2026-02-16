import { NextResponse } from "next/server"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { DriveClient } from "@/lib/google-drive"
import { getTransposedKeyName } from "@/lib/music-math"
import { logger } from "@/lib/logger"

interface PrintTrack {
    title: string
    key: string
    notes: string
    leadMusician?: string
    fileId?: string
    transposition?: number
    preferFlats?: boolean
    capoFret?: number
}

interface PrintRequest {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    tracks: PrintTrack[]
}

export const maxDuration = 120 // Allow up to 2 min for large setlists with transposition

export async function POST(request: Request) {
    try {
        const body: PrintRequest = await request.json()
        const { title, date, musicianName, eventName, tracks } = body

        if (!title || !tracks || tracks.length === 0) {
            return NextResponse.json({ error: "Missing title or tracks" }, { status: 400 })
        }

        const drive = new DriveClient()

        // 1. Create the merged PDF document
        const mergedPdf = await PDFDocument.create()

        // 2. Create cover page
        const coverPage = mergedPdf.addPage([612, 792])
        const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
        const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica)
        const helveticaOblique = await mergedPdf.embedFont(StandardFonts.HelveticaOblique)

        const { width, height } = coverPage.getSize()

        // Title
        coverPage.drawText(title, {
            x: 50,
            y: height - 80,
            size: 28,
            font: helveticaBold,
            color: rgb(0, 0, 0),
        })

        // Date
        coverPage.drawText(date, {
            x: 50,
            y: height - 110,
            size: 13,
            font: helvetica,
            color: rgb(0.4, 0.4, 0.4),
        })

        // Event name
        let yOffset = height - 138
        if (eventName) {
            coverPage.drawText(eventName, {
                x: 50,
                y: yOffset,
                size: 13,
                font: helvetica,
                color: rgb(0.4, 0.4, 0.4),
            })
            yOffset -= 22
        }

        // Musician name
        if (musicianName) {
            coverPage.drawText(`Prepared for: ${musicianName}`, {
                x: 50,
                y: yOffset,
                size: 13,
                font: helveticaBold,
                color: rgb(0, 0, 0),
            })
            yOffset -= 28
        }

        // Check if any tracks have transposition
        const hasTranspositions = tracks.some(t => t.transposition && t.transposition !== 0)

        // Divider line
        yOffset -= 10
        coverPage.drawLine({
            start: { x: 50, y: yOffset },
            end: { x: width - 50, y: yOffset },
            thickness: 1.5,
            color: rgb(0.2, 0.4, 0.8),
        })
        yOffset -= 25

        // Column positions — adjust based on whether we need transpose column
        const colNum = 50
        const colTitle = 75
        const colLead = hasTranspositions ? 280 : 310
        const colKey = hasTranspositions ? 380 : 430
        const colTransKey = 430 // Only used when hasTranspositions
        const colNotes = hasTranspositions ? 490 : 475

        // Table header
        coverPage.drawText("#", { x: colNum, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Song", { x: colTitle, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Lead", { x: colLead, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Key", { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        if (hasTranspositions) {
            coverPage.drawText("As", { x: colTransKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        }
        coverPage.drawText("Notes", { x: colNotes, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })

        // Header underline
        yOffset -= 8
        coverPage.drawLine({
            start: { x: 50, y: yOffset },
            end: { x: width - 50, y: yOffset },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
        })
        yOffset -= 16

        // Table rows
        tracks.forEach((track, index) => {
            if (yOffset < 60) return

            const num = `${index + 1}.`
            const maxTitleLen = hasTranspositions ? 26 : 30
            const songTitle = track.title.length > maxTitleLen
                ? track.title.substring(0, maxTitleLen - 3) + "..."
                : track.title
            const key = track.key || "-"
            const lead = track.leadMusician || ""
            const maxLeadLen = hasTranspositions ? 12 : 15
            const leadDisplay = lead.length > maxLeadLen
                ? lead.substring(0, maxLeadLen - 3) + "..."
                : lead

            // Build notes string — include capo info
            let notesStr = track.notes || ""
            if (track.capoFret && track.capoFret > 0) {
                const capoNote = `Capo ${track.capoFret}`
                notesStr = notesStr ? `${capoNote} • ${notesStr}` : capoNote
            }
            const maxNotesLen = hasTranspositions ? 14 : 18
            const notesDisplay = notesStr.length > maxNotesLen
                ? notesStr.substring(0, maxNotesLen - 3) + "..."
                : notesStr

            // Transposed key display
            const transKey = (track.transposition && track.transposition !== 0 && track.key)
                ? getTransposedKeyName(track.key, track.transposition)
                : null

            coverPage.drawText(num, { x: colNum, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
            coverPage.drawText(songTitle, { x: colTitle, y: yOffset, size: 10, font: helvetica, color: rgb(0, 0, 0) })
            if (leadDisplay) {
                coverPage.drawText(leadDisplay, { x: colLead, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
            }
            coverPage.drawText(key, { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) })

            if (hasTranspositions && transKey) {
                coverPage.drawText(transKey, {
                    x: colTransKey, y: yOffset, size: 10,
                    font: helveticaBold,
                    color: rgb(0.42, 0.16, 0.84),
                })
            }

            if (notesDisplay) {
                coverPage.drawText(notesDisplay, { x: colNotes, y: yOffset, size: 9, font: helveticaOblique, color: rgb(0.5, 0.5, 0.5) })
            }

            yOffset -= 18
        })

        // Footer
        const footerParts = [`${tracks.length} songs`]
        if (hasTranspositions) footerParts.push("transposed")
        footerParts.push("Generated by CRC Music Books")
        coverPage.drawText(footerParts.join(" • "), {
            x: 50,
            y: 30,
            size: 9,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
        })

        // 3. Fetch and append each PDF file, with transposition when needed
        let appendedCount = 0
        let transposedCount = 0

        // Lazy-load transposition modules only if needed
        let extractChordsFromPdf: any = null
        let transposePdf: any = null
        if (hasTranspositions) {
            try {
                const extractor = await import("@/lib/pdf-chord-extractor")
                const renderer = await import("@/lib/pdf-transpose-renderer")
                extractChordsFromPdf = extractor.extractChordsFromPdf
                transposePdf = renderer.transposePdf
            } catch (importErr) {
                logger.error("[Print] Failed to load transposition modules:", importErr)
                // Fall back to no transposition
            }
        }

        for (const track of tracks) {
            if (!track.fileId) continue

            try {
                logger.info(`[Print] Fetching: ${track.title} (${track.fileId})`)
                const fileBuffer = await drive.getFile(track.fileId)

                if (!fileBuffer || !(fileBuffer instanceof ArrayBuffer) || fileBuffer.byteLength === 0) {
                    logger.warn(`[Print] Empty file for: ${track.title}`)
                    continue
                }

                let pdfBytes = new Uint8Array(fileBuffer)

                // Apply transposition if requested and modules are available
                const needsTransposition = track.transposition &&
                    track.transposition !== 0 &&
                    extractChordsFromPdf &&
                    transposePdf

                if (needsTransposition) {
                    try {
                        logger.info(`[Print] Transposing ${track.title}: ${track.transposition! > 0 ? '+' : ''}${track.transposition} semitones`)

                        // Extract chords from this PDF
                        const extraction = await extractChordsFromPdf(pdfBytes)

                        if (extraction.totalChords > 0) {
                            // Apply transposition
                            const transposeResult = await transposePdf(
                                pdfBytes,
                                extraction.pages,
                                {
                                    semitones: track.transposition!,
                                    preferFlats: track.preferFlats,
                                    capoFret: track.capoFret,
                                }
                            )

                            pdfBytes = transposeResult.pdf
                            transposedCount++
                            logger.info(`[Print] Transposed ${transposeResult.stats.chordsTransposed} chords in ${track.title}`)
                        } else {
                            logger.warn(`[Print] No chords found in ${track.title}, using original`)
                        }
                    } catch (transposeErr) {
                        logger.error(`[Print] Transposition failed for ${track.title}:`, transposeErr)
                        // Fall back to original PDF
                    }
                }

                // Merge into final document
                try {
                    const sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
                    const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
                    pages.forEach(page => mergedPdf.addPage(page))
                    appendedCount++
                    logger.info(`[Print] Appended ${pages.length} pages for: ${track.title}`)
                } catch (pdfError) {
                    logger.error(`[Print] PDF parse error for ${track.title}:`, pdfError)
                }
            } catch (fetchError) {
                logger.error(`[Print] Failed to fetch ${track.title}:`, fetchError)
            }
        }

        logger.info(`[Print] Complete: ${appendedCount} files, ${transposedCount} transposed`)

        // 4. Generate final PDF
        const finalPdfBytes = await mergedPdf.save()
        const pdfBuffer = new Uint8Array(finalPdfBytes)

        return new NextResponse(pdfBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${title.replace(/[^a-z0-9]/gi, "_")}.pdf"`,
            },
        })
    } catch (error: unknown) {
        logger.error("[Print] Generation error:", error)
        return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 })
    }
}
