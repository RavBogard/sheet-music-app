import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    if (!id || !id.startsWith('db-')) {
        return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    try {
        initAdmin()
        const db = getFirestore()

        // Strip prefix
        const docId = id.replace('db-', '')

        const docSnap = await db.collection("digitized_charts").doc(docId).get()

        if (!docSnap.exists) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        const data = docSnap.data()
        const xmlContent = data?.xmlContent

        if (!xmlContent) {
            return NextResponse.json({ error: "No content in file" }, { status: 404 })
        }

        // Return as XML file
        return new NextResponse(xmlContent, {
            headers: {
                'Content-Type': 'application/vnd.recordare.musicxml+xml',
                'Content-Disposition': `inline; filename="${data.title}.musicxml"`
            }
        })

    } catch (error: any) {
        console.error("Fetch Generated Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
