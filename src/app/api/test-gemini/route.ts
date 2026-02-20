export const maxDuration = 60
import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import Papa from "papaparse"
import { initAdmin } from "@/lib/firebase-admin"
import { getFirestore } from "firebase-admin/firestore"

const timeoutPromise = (ms: number, name: string) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} TIMED OUT after ${ms}ms`)), ms));

export async function GET() {
    const traces: Record<string, any> = {
        start: Date.now()
    }
    const addTrace = (name: string, data?: any) => {
        traces[name] = { time: Date.now() - traces.start, ...data }
    }

    try {
        addTrace("init")

        // 1. Fetch CSV
        const url = "https://docs.google.com/spreadsheets/d/19pSctdr2Mi6KHO-LPlN6RcCAH8P1bMp8hyIWMoz0434/export?format=csv&gid=1580772210"

        const fetchStart = Date.now()
        const res = await Promise.race([
            fetch(url, { signal: AbortSignal.timeout(10000) }),
            timeoutPromise(12000, "Google Sheets Fetch")
        ]) as Response

        if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`)
        const rawCsv = await res.text()
        addTrace("fetched_csv", { durationMs: Date.now() - fetchStart, length: rawCsv.length })

        // 2. Papa Parse
        const papaStart = Date.now()
        const parsed = Papa.parse(rawCsv, { header: true, skipEmptyLines: true })
        addTrace("parsed_csv", { durationMs: Date.now() - papaStart, rows: parsed.data.length })

        // 3. Gemini Parse
        const geminiStart = Date.now()
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
        if (!apiKey) throw new Error("No API key")

        const contextStr = JSON.stringify(parsed.data, null, 2)
        const prompt = `You are an expert musical setlist parser. Your job is to take a raw JSON array representing rows from a spreadsheet and extract a clean list of setlist items.
                    
Return a JSON object with a single root key 'items' containing an array of objects.
Each item must have a 'type' of either "header" or "song".

Rules for "header" items:
- Represents a structural section (e.g. "Pre service", "Awakening", "Torah Service").
- Set 'title' to the header name. All other fields should be null.

Rules for "song" items:
- Identify if a row is a song/tune/prayer.
- Set 'title' to the primary name of the song.
- Set 'key' to the musical key if listed (e.g. Dm, E minor, F). Normalize capitalization if you can (e.g., "D minor" -> "Dm").
- Set 'chartUrl' to any Google Drive link or PDF URL found in the row.
- Set 'performer' to the lead vocalist/musician if indicated.
- Set 'referenceLink' to any YouTube/Spotify links found in the row.
- Ignore blank/empty rows.

Make educated guesses on column mapping based on standard terms.

Here is the JSON array:
${contextStr}`

        const genAI = new GoogleGenerativeAI(apiKey)
        const geminiFlash = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

        const resultObj = await Promise.race([
            geminiFlash.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
            }),
            timeoutPromise(25000, "Gemini GenerateContent")
        ]) as any

        const content = resultObj.response.text()
        let items: any[] = []
        try {
            const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim()
            items = JSON.parse(cleanedContent).items || []
        } catch { }
        addTrace("gemini_finished", { durationMs: Date.now() - geminiStart, itemsParsed: items.length })

        // 4. Firestore Init & Fetch
        const fsStart = Date.now()

        await Promise.race([
            (async () => {
                initAdmin()
                const db = getFirestore()
                const snap = await db.collection('library_index').where('status', '==', 'active').select('name').get()
                return snap.size
            })(),
            timeoutPromise(10000, "Firestore Library Index Fetch")
        ])

        addTrace("firestore_finished", { durationMs: Date.now() - fsStart })

        const totalTime = Date.now() - traces.start
        return NextResponse.json({
            status: "SUCCESS_ALL_STEPS",
            totalDurationMs: totalTime,
            traces,
        })
    } catch (e: any) {
        return NextResponse.json({
            status: "FAILED_WITH_ERROR",
            error: e.message,
            traces,
            totalDurationMs: Date.now() - traces.start
        })
    }
}
