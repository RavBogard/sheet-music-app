import { NextResponse } from 'next/server'
import { syncLibraryIndex } from '@/lib/sync-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        // Vercel Cron Authentication
        // In production, Vercel sends this header.
        const authHeader = request.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        console.log("[Cron] Starting Library Sync...")
        const result = await syncLibraryIndex()

        return NextResponse.json({
            success: true,
            message: "Sync completed",
            stats: result
        })
    } catch (error: any) {
        console.error("[Cron] Sync Failed:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
