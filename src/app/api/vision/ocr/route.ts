import { NextResponse } from "next/server"
import { ImageAnnotatorClient } from "@google-cloud/vision"

// Initialize Vision Client
// We reuse the credentials env vars we already set up for Drive
const getCredentials = () => {
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            let jsonString = process.env.GOOGLE_CREDENTIALS_JSON
            // Unwrap if double-quoted string
            if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
                jsonString = JSON.parse(jsonString)
            }
            return typeof jsonString === 'object' ? jsonString : JSON.parse(jsonString as string)
        } catch (e) {
            console.error("Failed to parse GOOGLE_CREDENTIALS_JSON for Vision", e)
        }
    }
    return {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
}

const client = new ImageAnnotatorClient({
    credentials: getCredentials()
})

export async function POST(request: Request) {
    try {
        const { imageBase64 } = await request.json()

        if (!imageBase64) {
            return new NextResponse("Missing image data", { status: 400 })
        }

        // Remove data URL prefix if present (e.g., "data:image/png;base64,...")
        const base64Content = imageBase64.replace(/^data:image\/\w+;base64,/, "")

        // Call Vision API
        const [result] = await client.textDetection({
            image: {
                content: base64Content
            }
        })

        const detections = result.textAnnotations || []

        if (detections.length === 0) {
            return NextResponse.json({ text: "", blocks: [] })
        }

        // The first annotation is the full text
        const fullText = detections[0].description

        // Subsequent annotations are individual words/blocks with bounding boxes
        const blocks = detections.slice(1).map(text => ({
            text: text.description,
            poly: text.boundingPoly?.vertices // [{x,y}, {x,y}...]
        }))

        return NextResponse.json({
            text: fullText,
            blocks: blocks
        })

    } catch (error) {
        console.error("Vision API Error:", error)
        return new NextResponse(JSON.stringify({ error: "OCR Failed", details: String(error) }), { status: 500 })
    }
}
