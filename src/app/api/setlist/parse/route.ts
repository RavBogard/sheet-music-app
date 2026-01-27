import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { DriveClient } from "@/lib/google-drive"
import * as XLSX from 'xlsx'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function POST(request: Request) {
    try {
        const { fileId, mimeType } = await request.json()

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        const drive = new DriveClient()
        let textContent = ""

        // 1. Get file content based on type
        try {
            if (mimeType === "application/vnd.google-apps.document") {
                // Google Doc -> Export as text
                const buffer = await drive.exportDoc(fileId, 'text/plain') as any
                textContent = Buffer.from(buffer).toString("utf-8")
            } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
                // Google Sheet -> Export as Excel then parse
                const buffer = await drive.exportDoc(fileId, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') as any
                const workbook = XLSX.read(buffer, { type: 'buffer' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                // Convert to CSV to keep structure for AI context
                textContent = XLSX.utils.sheet_to_csv(worksheet)
            } else if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel") || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
                // Excel File -> Read directly
                const buffer = await drive.getFile(fileId) as any
                const workbook = XLSX.read(buffer, { type: 'buffer' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                textContent = XLSX.utils.sheet_to_csv(worksheet)
            } else {
                // Other text files (PDFs might fallback here but they need OCR - we assume text/plain compatible here)
                const buffer = await drive.getFile(fileId) as unknown as ArrayBuffer
                textContent = Buffer.from(buffer).toString("utf-8")
            }
        } catch (driveError: any) {
            console.error("Drive fetch error:", driveError)
            return NextResponse.json({
                error: "Failed to fetch file from Drive",
                details: driveError.message
            }, { status: 500 })
        }

        if (!textContent || textContent.length === 0) {
            return NextResponse.json({
                error: "File content is empty"
            }, { status: 400 })
        }

        console.log("Document content preview:", textContent.substring(0, 500))

        // 2. Send to Gemini for parsing with improved prompt
        // ⚠️ DO NOT CHANGE THIS MODEL - User requirement: gemini-3-flash-preview
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

        const prompt = `You are a setlist parser for a music app. Parse the following document content into a structured setlist.
        
CRITICAL: You MUST return ONLY a valid JSON array. No text before or after.

Rules:
1. Identify "Songs" vs "Section Headers".
   - A **Section Header** is usually a broad category like "Torah Service", "Kabbalat Shabbat", "Shacharit", "Encores". It often appears alone on a line, or is formatted differently (like bold in the original, though here you only have text). Use context to distinguish.
   - A **Song** is specific musical piece.
2. Return a JSON array of objects.
3. Schema:
   {
      "title": "String (Required)",
      "type": "song" OR "header",
      "key": "String (Optional, e.g. 'G', 'Am')",
      "notes": "String (Optional)"
   }
4. Ignore useless filler like date, page numbers, or "Chazan / Leader".
5. For songs, strip numbering (e.g. "1. Adon Olam" -> "Adon Olam").

Document content (CSV/Text representation):
${textContent.substring(0, 15000)}

Remember: Return ONLY the JSON array.`

        let text = ""
        try {
            const result = await model.generateContent(prompt)
            const response = await result.response
            text = response.text()
            console.log("Gemini raw response:", text.substring(0, 500))
        } catch (geminiError: any) {
            console.error("Gemini API error:", geminiError)
            return NextResponse.json({
                error: "AI processing failed",
                details: geminiError.message
            }, { status: 500 })
        }

        // 3. Parse the JSON response
        let tracks = []
        try {
            const cleanJson = text
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim()
            tracks = JSON.parse(cleanJson)
        } catch (e1) {
            console.log("Direct parse failed, trying extraction...")
            try {
                const arrayMatch = text.match(/\[[\s\S]*\]/)
                if (arrayMatch) {
                    tracks = JSON.parse(arrayMatch[0])
                } else {
                    throw new Error("No JSON array found")
                }
            } catch (e2) {
                console.error("Parsing failed completely")
                return NextResponse.json({
                    error: "Failed to parse AI response",
                    raw: text
                }, { status: 500 })
            }
        }

        // Validate tracks is an array
        if (!Array.isArray(tracks)) {
            tracks = []
        }

        // 4. Add IDs to each track
        const tracksWithIds = tracks.map((track: any, index: number) => ({
            id: `track-${Date.now()}-${index}`,
            title: String(track.title || track.name || "Untitled").substring(0, 100),
            key: String(track.key || "").substring(0, 10),
            notes: String(track.notes || "").substring(0, 200),
            type: (track.type === 'header' || track.type === 'section') ? 'header' : 'song',
            fileId: null
        }))

        return NextResponse.json({ tracks: tracksWithIds })

    } catch (error: any) {
        console.error("Parse error:", error)
        return NextResponse.json({
            error: "Internal server error",
            details: error.message
        }, { status: 500 })
    }
}
