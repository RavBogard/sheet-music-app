import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"

export async function POST(req: NextRequest) {
    try {
        const { fileId, corrections } = await req.json()

        if (!fileId || !Array.isArray(corrections)) {
            return NextResponse.json({ error: "Missing fileId or corrections array" }, { status: 400 })
        }

        // 1. Auth & RBAC
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const token = authHeader.split(" ")[1]
        const decoded = await verifyIdToken(token)
        if (!decoded) {
            return NextResponse.json({ error: "Invalid Token" }, { status: 401 })
        }

        // Only Admin or Leader can edit global OMR data
        const role = decoded.role || 'member'
        if (role !== 'admin' && role !== 'leader') {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
        }

        initAdmin()
        const db = getFirestore()

        // 2. Update Firestore
        // We assume fileId matches the document ID in library_index
        await db.collection('library_index').doc(fileId).update({
            'metadata.omrCorrections': corrections,
            'metadata.lastEditedBy': decoded.uid,
            'metadata.lastEditedAt': new Date().toISOString()
        })

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error("Save Corrections Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
