
import { geminiFlash } from "@/lib/gemini"
import { fetchFileById } from "@/lib/file-fetcher"
import { getFirestore } from "firebase-admin/firestore"
import { initAdmin } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

export interface EnrichedMetadata {
    key?: string
    bpm?: number
    timeSignature?: string
    topics?: string[]
    summary?: string
    artist?: string
    title?: string
    originalKey?: string
}

export async function enrichFile(fileId: string): Promise<EnrichedMetadata> {
    logger.info(`[Enrichment] Starting for ${fileId}...`)

    // 1. Init Services
    initAdmin()
    const db = getFirestore()

    // 2. Fetch File Content (Storage first, Drive fallback)
    const fetched = await fetchFileById(fileId)
    if (!fetched) {
        throw new Error(`File not found: ${fileId}`)
    }
    const base64Data = fetched.buffer.toString("base64")

    // 3. Prompt Gemini
    const prompt = `
    You are an expert music librarian. 
    Analyze the first page of this sheet music PDF.
    Extract the following metadata in strict JSON format:

    {
        "title": "Song Title",
        "artist": "Composer/Artist Name",
        "key": "Musical Key (e.g. Eb Major, G Minor)",
        "bpm": 120 (approximate integer if not specified, guess based on tempo marking like 'Fast' or 'Adagio'),
        "timeSignature": "4/4",
        "topics": ["theme1", "theme2"] (e.g. Worship, Christmas, Jazz, Sorrow, Joy),
        "summary": "One sentence description of the song style/content"
    }

    Rules:
    - If you cannot be sure, omit the field or use null.
    - Return ONLY the raw JSON string.
    - Do not include markdown formatting.
    `

    logger.info(`[Enrichment] Sending to Gemini...`)
    const result = await geminiFlash.generateContent([
        prompt,
        {
            inlineData: {
                data: base64Data,
                mimeType: "application/pdf"
            }
        }
    ])

    const text = result.response.text()

    // 4. Parse & Clean
    let data: EnrichedMetadata = {}
    try {
        const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim()
        data = JSON.parse(cleanJson)
    } catch {
        logger.error("Failed to parse JSON from AI:", text)
        throw new Error("AI returned invalid JSON")
    }

    logger.info(`[Enrichment] Extracted:`, data)

    // 5. Save to Firestore
    await db.collection('library_index').doc(fileId).set({
        metadata: {
            ...data,
            enrichedAt: new Date().toISOString(),
            enrichmentVersion: "1.0"
        }
    }, { merge: true })

    return data
}
