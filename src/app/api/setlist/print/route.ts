import { NextResponse } from "next/server"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { DriveClient } from "@/lib/google-drive"

interface PrintTrack {
    title: string
    key: string
    notes: string
    leadMusician?: string
    fileId?: string
}

interface PrintRequest {
    title: string
    date: string
    musicianName?: string
    eventName?: string
    tracks: PrintTrack[]
}

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
        const coverPage = mergedPdf.addPage([612, 792]) // Letter size
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

        // Event name (if provided)
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

        // Musician name (if provided)
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

        // Divider line
        yOffset -= 10
        coverPage.drawLine({
            start: { x: 50, y: yOffset },
            end: { x: width - 50, y: yOffset },
            thickness: 1.5,
            color: rgb(0.2, 0.4, 0.8),
        })
        yOffset -= 25

        // Column positions
        const colNum = 50
        const colTitle = 75
        const colLead = 300
        const colKey = 420
        const colNotes = 460

        // Table header
        coverPage.drawText("#", { x: colNum, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Song", { x: colTitle, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Lead", { x: colLead, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Key", { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })
        coverPage.drawText("Notes", { x: colNotes, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) })

        // Header underline
        yOffset -= 8
        coverPage.drawLine({
            start: { x: 50, y: yOffset },
            end: { x: width - 50, y: yOffset },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.85),
        })
        yOffset -= 16

        // Table rows - list all songs
        tracks.forEach((track, index) => {
            if (yOffset < 50) return // Don't overflow page

            const num = `${index + 1}.`

            // Truncate fields to fit columns
            const maxTitleLen = 32
            const songTitle = track.title.length > maxTitleLen
                ? track.title.substring(0, maxTitleLen - 1) + "…"
                : track.title

            const lead = track.leadMusician
                ? (track.leadMusician.length > 16 ? track.leadMusician.substring(0, 15) + "…" : track.leadMusician)
                : ""

            const key = track.key || "—"

            const maxNotesLen = 20
            const notes = track.notes
                ? (track.notes.length > maxNotesLen ? track.notes.substring(0, maxNotesLen - 1) + "…" : track.notes)
                : ""

            // Row number
            coverPage.drawText(num, { x: colNum, y: yOffset, size: 11, font: helvetica, color: rgb(0.5, 0.5, 0.5) })

            // Song title
            coverPage.drawText(songTitle, { x: colTitle, y: yOffset, size: 11, font: helvetica, color: rgb(0, 0, 0) })

            // Lead vocalist
            if (lead) {
                coverPage.drawText(lead, { x: colLead, y: yOffset, size: 10, font: helveticaOblique, color: rgb(0.3, 0.3, 0.3) })
            }

            // Key (bold, blue accent)
            coverPage.drawText(key, { x: colKey, y: yOffset, size: 11, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) })

            // Notes
            if (notes) {
                coverPage.drawText(notes, { x: colNotes, y: yOffset, size: 9, font: helveticaOblique, color: rgb(0.45, 0.45, 0.45) })
            }

            // Subtle row separator
            yOffset -= 4
            coverPage.drawLine({
                start: { x: 50, y: yOffset },
                end: { x: width - 50, y: yOffset },
                thickness: 0.25,
                color: rgb(0.92, 0.92, 0.92),
            })
            yOffset -= 14
        })

        // Footer on cover page
        coverPage.drawLine({
            start: { x: 50, y: 48 },
            end: { x: width - 50, y: 48 },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.85),
        })
        coverPage.drawText(`${tracks.length} songs · CRC Music Books · centralreform.live`, {
            x: 50,
            y: 32,
            size: 9,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
        })

        // 3. Fetch and append each PDF file
        let appendedCount = 0
        for (const track of tracks) {
            if (!track.fileId) continue

            try {
                console.log(`Fetching PDF for: ${track.title} (${track.fileId})`)

                const fileBuffer = await drive.getFile(track.fileId)

                if (fileBuffer && fileBuffer instanceof ArrayBuffer && fileBuffer.byteLength > 0) {
                    try {
                        const pdfBytes = new Uint8Array(fileBuffer)
                        const sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
                        const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())

                        pages.forEach(page => {
                            mergedPdf.addPage(page)
                        })

                        appendedCount++
                        console.log(`Appended ${pages.length} pages for: ${track.title}`)
                    } catch (pdfError) {
                        console.error(`PDF parse error for ${track.title}:`, pdfError)
                        // Skip this file but continue with others
                    }
                }
            } catch (fetchError) {
                console.error(`Failed to fetch ${track.title}:`, fetchError)
                // Skip this file but continue with others
            }
        }

        console.log(`Successfully appended ${appendedCount} PDF files`)

        // 4. Generate final PDF
        const finalPdfBytes = await mergedPdf.save()

        // 5. Return as downloadable PDF (convert Uint8Array to Buffer for NextResponse)
        const pdfBuffer = Buffer.from(finalPdfBytes)

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_')}.pdf"`,
            },
        })

    } catch (error: any) {
        console.error("Print generation error:", error)
        return NextResponse.json({
            error: "Failed to generate PDF"
        }, { status: 500 })
    }
}
