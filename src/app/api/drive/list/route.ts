import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DriveClient } from "@/lib/google-drive"

export async function GET(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.accessToken) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const drive = new DriveClient(session.accessToken as string)
        const files = await drive.listFiles()

        return NextResponse.json(files)
    } catch (error) {
        console.error("Drive API Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
