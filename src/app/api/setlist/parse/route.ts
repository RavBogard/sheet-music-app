import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { DriveClient } from "@/lib/google-drive"

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
                const exported = await drive.exportDoc(fileId)
                textContent = typeof exported === 'string' ? exported : String(exported)
            } else if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) {
                // Excel -> We'll need to parse it differently
                const buffer = await drive.getFile(fileId) as unknown as ArrayBuffer
                textContent = Buffer.from(buffer).toString("utf-8")
            } else {
                // Other text files
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

        // 2. Send to Gemini for parsing
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

        const prompt = `You are a setlist parser for a music app. Extract song names from this setlist document.

Rules:
- Return ONLY a JSON array of objects
- Each object should have: { "title": "Song Name", "key": "optional key like 'G' or 'Bm'", "notes": "any other info" }
- Ignore headers, dates, page numbers, and other non-song content
- If a line has a number prefix like "1." or "-", strip it
- If you see key information like "(Key of G)" or "[Em]", extract it to the "key" field
- Be intelligent about what is a song vs what is metadata

Document content:
${textContent.substring(0, 10000)}

Return ONLY the JSON array, no markdown, no explanation.`

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // 3. Parse the JSON response
        let tracks = []
        try {
            // Clean up potential markdown code blocks
            const cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
            tracks = JSON.parse(cleanJson)
        } catch (e) {
            console.error("Failed to parse Gemini response:", text)
            return NextResponse.json({
                error: "Failed to parse AI response",
                raw: text
            }, { status: 500 })
        }

        // 4. Add IDs to each track
        const tracksWithIds = tracks.map((track: any, index: number) => ({
            id: `track-${Date.now()}-${index}`,
            title: track.title || "Untitled",
            key: track.key || "",
            notes: track.notes || "",
            fileId: null // Will be matched later
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
