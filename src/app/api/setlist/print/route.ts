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
        const colLead = 310
        const colKey = 430
        const colNotes = 475

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
            color: rgb(0.8, 0.8, 0.8),
        })
        yOffset -= 16

        // Table rows - list all songs
        tracks.forEach((track, index) => {
            if (yOffset < 60) return // Don't overflow page

            const num = `${index + 1}.`
            const maxTitleLen = 30
            const songTitle = track.title.length > maxTitleLen ? track.title.substring(0, maxTitleLen - 3) + "..." : track.title
            const key = track.key || "-"
            const lead = track.leadMusician || ""
            const maxLeadLen = 15
            const leadDisplay = lead.length > maxLeadLen ? lead.substring(0, maxLeadLen - 3) + "..." : lead
            const notes = track.notes || ""
            const maxNotesLen = 18
            const notesDisplay = notes.length > maxNotesLen ? notes.substring(0, maxNotesLen - 3) + "..." : notes

            coverPage.drawText(num, { x: colNum, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
            coverPage.drawText(songTitle, { x: colTitle, y: yOffset, size: 10, font: helvetica, color: rgb(0, 0, 0) })
            if (leadDisplay) {
                coverPage.drawText(leadDisplay, { x: colLead, y: yOffset, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
            }
            coverPage.drawText(key, { x: colKey, y: yOffset, size: 10, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) })
            if (notesDisplay) {
                coverPage.drawText(notesDisplay, { x: colNotes, y: yOffset, size: 9, font: helveticaOblique, color: rgb(0.5, 0.5, 0.5) })
            }

            yOffset -= 18
        })

        // Footer on cover page
        coverPage.drawText(`${tracks.length} songs • Generated by CRC Music Books`, {
            x: 50,
            y: 30,
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
                    }
                }
            } catch (fetchError) {
                console.error(`Failed to fetch ${track.title}:`, fetchError)
            }
        }

        console.log(`Successfully appended ${appendedCount} PDF files`)

        // 4. Generate final PDF
        const finalPdfBytes = await mergedPdf.save()

        // 5. Return as downloadable PDF
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
