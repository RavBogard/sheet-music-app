import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

import { verifyIdToken } from "@/lib/firebase-admin"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const authHeader = request.headers.get("Authorization")
    const token = authHeader?.split("Bearer ")[1]

    if (!token || !(await verifyIdToken(token))) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    try {
        const { fileId } = await params
        const drive = new DriveClient()

        // Export Doc logic
        const textContent = await drive.exportDoc(fileId)

        return new NextResponse(String(textContent), {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            }
        })
    } catch (error) {
        console.error("Drive Doc Export Error:", error)
        return new NextResponse("Failed to export doc", { status: 500 })
    }
}
