import { NextResponse } from "next/server"

export async function GET(request: Request) {
    return new NextResponse("Migration Disabled", { status: 410 })
}

// Legacy code removed for safety and build stability
