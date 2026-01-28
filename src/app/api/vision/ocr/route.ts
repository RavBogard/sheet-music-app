import { NextResponse } from "next/server"
import { ImageAnnotatorClient } from "@google-cloud/vision"

export const dynamic = 'force-dynamic'

// Helper to get credentials from various env vars
const getCredentials = () => {
    // 1. Explicit JSON content var
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        try {
            return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        } catch (e) {
            console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON")
        }
    }
    // 2. Firebase Service Account (often same project)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY")
        }
    }
    // 3. Fallback to default (checking GOOGLE_APPLICATION_CREDENTIALS path or metadata server)
    return undefined
}

// Initialize Client
const client = new ImageAnnotatorClient({
    credentials: getCredentials()
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { imageBase64 } = body

        if (!imageBase64) {
            return NextResponse.json({ error: "Missing image data" }, { status: 400 })
        }

        // Remove data URL prefix if present
        const content = imageBase64.replace(/^data:image\/\w+;base64,/, '')

        // Detect text
        const [result] = await client.textDetection({
            image: { content }
        })

        const annotations = result.textAnnotations || []

        if (annotations.length === 0) {
            return NextResponse.json({ blocks: [] })
        }

        // Map Google Vision format to our internal format
        // Skip the first element (full page text)
        const blocks = annotations.slice(1).map(ann => ({
            text: ann.description || "",
            poly: ann.boundingPoly?.vertices || []
        }))

        return NextResponse.json({ blocks })

    } catch (error: any) {
        console.error("Vision API Error:", error)
        return NextResponse.json(
            { error: "OCR Failed", details: error.message || String(error) },
            { status: 500 }
        )
    }
}
