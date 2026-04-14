import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const POST = createApiHandler(async (ctx) => {
    try {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const db = getFirestore()
        const userRef = db.collection('users').doc(ctx.auth!.uid)

        await userRef.update({
            lastNudgeAt: new Date().toISOString(),
            nudgedAdmin: true
        })

        return NextResponse.json({ success: true, message: "Admin notified" })
    } catch (error) {
        logger.error("Nudge admin error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
})
