import { NextResponse } from "next/server"
import { ImageAnnotatorClient } from "@google-cloud/vision"

export const dynamic = 'force-dynamic'

// Helper to get credentials from various env vars
const getCredentials = () => {
    let creds: any = undefined;

    // 1. Explicit JSON content var
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        try {
            creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
        } catch (e) {
            console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON")
        }
    }
    // 2. Firebase Service Account (often same project)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY")
        }
    }

    if (creds && typeof creds.private_key === 'string') {
        // Sanitize private key (handle actual newlines vs escaped newlines)
        creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }

    return creds;
}

// Initialize Client (Lazy load to catch init errors inside handler if possible, 
// strictly though it's better to fail fast, but we want to log WHY)
let client: ImageAnnotatorClient | null = null;
try {
    const creds = getCredentials()
    if (creds) {
        client = new ImageAnnotatorClient({ credentials: creds })
    } else {
        console.warn("No Vision API credentials found. OCR will fail.")
    }
} catch (e) {
    console.error("Failed to initialize Vision Client:", e)
}

export async function POST(request: Request) {
    console.log("[Vision API] Usage requested")
    try {
        if (!client) {
            console.error("[Vision API] Client not initialized. Checking credentials...")
            const creds = getCredentials()
            console.log("[Vision API] Credentials present:", !!creds)
            if (creds) {
                console.log("[Vision API] Project ID from creds:", creds.project_id)
                // Attempt re-init
                try {
                    client = new ImageAnnotatorClient({ credentials: creds })
                    console.log("[Vision API] Client re-initialized successfully")
                } catch (initErr) {
                    console.error("[Vision API] Client re-init failed:", initErr)
                }
            }

            if (!client) {
                console.error("[Vision API] returning 500 due to missing credentials")
                return NextResponse.json({ error: "Server Configuration Error: Missing Vision Credentials" }, { status: 500 })
            }
        }

        const body = await request.json()
        const { imageBase64 } = body

        if (!imageBase64) {
            console.error("[Vision API] Missing imageBase64 in body")
            return NextResponse.json({ error: "Missing image data" }, { status: 400 })
        }

        const base64Length = imageBase64.length
        console.log(`[Vision API] Received image data. Length: ${base64Length} chars (~${Math.round(base64Length * 0.75 / 1024)} KB)`)

        // Remove data URL prefix if present
        const content = imageBase64.replace(/^data:image\/\w+;base64,/, '')

        // Detect text
        console.log("[Vision API] Calling client.textDetection...")
        const [result] = await client.textDetection({
            image: { content }
        })
        console.log("[Vision API] client.textDetection returned")

        const annotations = result.textAnnotations || []
        console.log(`[Vision API] Found ${annotations.length} annotations`)

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
        console.error("[Vision API] Unhandled Error:", error)
        // Log deep details if available
        if (error.response) {
            console.error("[Vision API] Upstream Response:", JSON.stringify(error.response))
        }
        return NextResponse.json(
            { error: "OCR Failed", details: error.message || String(error) },
            { status: 500 }
        )
    }
}
