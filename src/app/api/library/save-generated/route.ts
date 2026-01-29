import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Missing token" }, { status: 401 })
        }

        const token = authHeader.split(" ")[1]
        const decodedToken = await verifyIdToken(token)

        if (!decodedToken) {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 })
        }

        // Check roles (optional, but good practice)
        // const roles = decodedToken.roles || []
        // if (!roles.includes('admin') && !roles.includes('leader')) ...

        const { xmlContent, title, sourceFileId, originalName } = await req.json()

        if (!xmlContent || !title) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        const docRef = await db.collection("digitized_charts").add({
            title,
            originalName,
            sourceFileId,
            xmlContent,
            createdAt: new Date().toISOString(),
            createdBy: decodedToken.uid,
            createdByName: decodedToken.name || decodedToken.email || "Unknown"
        })

        return NextResponse.json({
            success: true,
            id: `db-${docRef.id}`, // Prefix to distinguish from Drive IDs
            message: "Saved to Application Library"
        })

    } catch (error: any) {
        console.error("Save Generated Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
