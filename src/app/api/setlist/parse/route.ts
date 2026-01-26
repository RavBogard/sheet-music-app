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

        console.log("Document content preview:", textContent.substring(0, 500))

        // 2. Send to Gemini for parsing with improved prompt
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

        const prompt = `You are a setlist parser for a music app. Extract song names from this setlist document.

CRITICAL: You MUST return ONLY a valid JSON array. No text before or after.

Rules:
- Return ONLY a JSON array of objects, nothing else
- Each object: { "title": "Song Name", "key": "", "notes": "" }
- Ignore headers, dates, page numbers, footers
- Strip number prefixes like "1." or "-"
- Extract key info like "(Key of G)" to the "key" field
- If you can't parse it, return an empty array: []

Document content:
${textContent.substring(0, 8000)}

Remember: Return ONLY the JSON array. Example: [{"title":"Song 1","key":"G","notes":""},{"title":"Song 2","key":"","notes":""}]`

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

        // 3. Parse the JSON response with multiple fallback strategies
        let tracks = []

        // Strategy 1: Direct parse
        try {
            const cleanJson = text
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim()
            tracks = JSON.parse(cleanJson)
        } catch (e1) {
            console.log("Direct parse failed, trying extraction...")

            // Strategy 2: Find JSON array in response
            try {
                const arrayMatch = text.match(/\[[\s\S]*\]/)
                if (arrayMatch) {
                    tracks = JSON.parse(arrayMatch[0])
                } else {
                    throw new Error("No JSON array found")
                }
            } catch (e2) {
                console.log("Array extraction failed, trying line-by-line...")

                // Strategy 3: Parse as simple line list and create tracks
                try {
                    const lines = textContent
                        .split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 2 && l.length < 100)
                        .filter(l => !l.match(/^(page|date|setlist|service|shabbat|morning|evening|friday|saturday)/i))
                        .filter(l => !l.match(/^\d{1,2}[\/\-]\d{1,2}/)) // Skip dates
                        .slice(0, 30) // Max 30 songs

                    tracks = lines.map((line, i) => ({
                        title: line.replace(/^[\d\.\-\s]+/, '').trim(),
                        key: "",
                        notes: ""
                    })).filter(t => t.title.length > 1)

                    console.log("Fallback line parsing created", tracks.length, "tracks")
                } catch (e3) {
                    console.error("All parsing strategies failed")
                    return NextResponse.json({
                        error: "Failed to parse document",
                        details: "The document format couldn't be processed. Try a simpler format.",
                        raw: text.substring(0, 500)
                    }, { status: 500 })
                }
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
            fileId: null
        }))

        console.log("Successfully parsed", tracksWithIds.length, "tracks")

        return NextResponse.json({ tracks: tracksWithIds })

    } catch (error: any) {
        console.error("Parse error:", error)
        return NextResponse.json({
            error: "Internal server error",
            details: error.message
        }, { status: 500 })
    }
}
