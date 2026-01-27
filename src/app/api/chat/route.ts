import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

// System prompt for the Music Director AI
const SYSTEM_PROMPT = `
You are an expert Jewish Music Director and Service Leader (Shaliach Tzibur) for a Reform Jewish congregation.
Your goal is to help the user design beautiful, flowing prayer setlists.

You have access to:
1. The user's "Current Setlist" (a list of songs/tracks).
2. A "Library" of available sheet music files (provided as a list of filenames).

Your capabilities:
- You can answer questions about Jewish liturgy (e.g., "What comes after the Barchu?").
- You can suggest songs from the Library that fit specific liturgical moments.
- You can Edit the setlist directly.

When the user asks to change the setlist, you must return a JSON object describing the changes.
If the user just asks a question, return a text response.

Output Format:
You must return a JSON object with this structure:
{
  "message": "Your text response to the user...",
  "edits": [
    { "action": "add", "title": "Song Title", "fileId": "drive-id-if-found", "position": "end" or index },
    { "action": "remove", "index": 2 },
    { "action": "reorder", "fromIndex": 3, "toIndex": 1 }
  ]
}

Rules for "edits":
- If adding a song, try to find a matching "fileId" from the provided Library list. If you can't find a file, leave "fileId" null.
- "title" should be cleaned up (remove .pdf extension).
`

export async function POST(request: Request) {
  try {
    const { messages, currentSetlist, libraryFiles } = await request.json()
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } })

    // Construct the context
    const libraryContext = libraryFiles.slice(0, 500).map((f: any) => `${f.name} (ID: ${f.id})`).join("\n")
    const setlistContext = currentSetlist.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n")

    const prompt = `
${SYSTEM_PROMPT}

CONTEXT:
--- LIBRARY FILES (Top 500) ---
${libraryContext}
-------------------------------

--- CURRENT SETLIST ---
${setlistContext}
-----------------------

USER MESSAGE:
${messages[messages.length - 1].content}
`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    return NextResponse.json(JSON.parse(responseText))

  } catch (error: any) {
    console.error("Chat API Error:", error)
    // Return actual error message for debugging purposes
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
