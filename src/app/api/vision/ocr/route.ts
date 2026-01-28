import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'



// import { ImageAnnotatorClient } from "@google-cloud/vision"
// import { db } from "@/lib/firebase"
// import { doc, getDoc, setDoc } from "firebase/firestore"

export async function POST(request: Request) {
    return NextResponse.json({ error: "OCR Temporarily Disabled for Build Debugging" }, { status: 503 })
    /*
    try {
        // ... (Original Code commented out)
    } catch (error) {
        console.error("Vision API Error:", error)
        return new NextResponse(JSON.stringify({ error: "OCR Failed", details: String(error) }), { status: 500 })
    }
    */
}
