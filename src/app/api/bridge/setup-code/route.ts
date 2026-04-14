import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { sendBridgeRedemptionAlert } from "@/lib/email"
import { randomBytes } from "crypto"

/**
 * Bridge Setup Code API
 *
 * Eliminates the need to visit Firebase Console for service account keys.
 * The admin panel generates a short-lived code; the bridge exe redeems it
 * for credentials.
 *
 * POST /api/bridge/setup-code  — Admin-only: generate a new setup code
 * GET  /api/bridge/setup-code?code=ABC123  — Bridge: redeem code for credentials
 */

const CODE_LENGTH = 10

function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0/O/1/I confusion
    const bytes = randomBytes(CODE_LENGTH)
    let code = ""
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += chars[bytes[i] % chars.length]
    }
    return code
}

// POST: Admin generates a setup code
export const POST = createApiHandler(async (ctx) => {
    initAdmin()
    const db = getFirestore()

    // Invalidate any existing unused codes from this user
    const existing = await db.collection("bridge-setup-codes")
        .where("createdBy", "==", ctx.auth!.uid)
        .where("used", "==", false)
        .get()
    if (!existing.empty) {
        const batch = db.batch()
        existing.docs.forEach(doc => batch.update(doc.ref, { used: true }))
        await batch.commit()
    }

    // Generate a new code
    const code = generateCode()
    const now = Date.now()
    const expiresAt = now + 10 * 60 * 1000 // 10 minutes

    await db.collection("bridge-setup-codes").doc(code).set({
        createdBy: ctx.auth!.uid,
        createdAt: now,
        expiresAt,
        used: false,
    })

    return NextResponse.json({ code, expiresAt })
}, { role: 'band_leader' })

// GET: Bridge redeems a setup code for credentials
export async function GET(req: NextRequest) {
    try {
        // Rate limit redemption attempts to prevent brute-force
        const limited = await checkRateLimit(req, 'bridgeSetup')
        if (limited) return limited

        const url = new URL(req.url)
        const code = url.searchParams.get("code")?.toUpperCase().trim()

        if (!code || code.length !== CODE_LENGTH) {
            return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        // Atomically check and mark as used in a single transaction
        // Prevents race condition where two requests both pass the check
        const codeRef = db.collection("bridge-setup-codes").doc(code)

        let createdBy: string | undefined
        const redeemed = await db.runTransaction(async (tx) => {
            const snap = await tx.get(codeRef)
            if (!snap.exists) return { error: "Invalid code", status: 404 }

            const data = snap.data()!
            if (data.used) return { error: "Code already used", status: 410 }
            if (Date.now() > data.expiresAt) return { error: "Code expired", status: 410 }

            createdBy = data.createdBy

            // Mark as used atomically
            tx.update(codeRef, { used: true, usedAt: Date.now() })
            return { success: true }
        })

        if ("error" in redeemed) {
            return NextResponse.json({ error: redeemed.error }, { status: redeemed.status })
        }

        // S02 — audit-log + admin email on successful redemption.
        // Best-effort: failures here must never fail the redemption itself.
        const redeemedAt = new Date()
        const redeemerIp =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            req.headers.get("x-real-ip") ??
            "unknown"
        const redeemerUserAgent = req.headers.get("user-agent") ?? "unknown"

        await db
            .collection("bridge-redemptions")
            .add({
                code,
                createdBy: createdBy ?? null,
                redeemedAt,
                redeemerIp,
                redeemerUserAgent,
                success: true,
            })
            .catch((err) => logger.error("bridge audit write failed:", err))

        // Fire-and-forget: don't block the response on email delivery.
        sendBridgeRedemptionAlert({ code, redeemedAt, redeemerIp, redeemerUserAgent })
            .then((r) => {
                if (!r.ok) logger.warn("bridge alert email:", r.reason)
            })
            .catch((err) => logger.error("bridge alert email threw:", err))

        // Build a minimal service account key from environment variables
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

        if (!projectId || !clientEmail || !privateKey) {
            return NextResponse.json({ error: "Server credentials not configured" }, { status: 500 })
        }

        const serviceAccountKey = {
            type: "service_account",
            project_id: projectId,
            private_key: privateKey,
            client_email: clientEmail,
            // These fields are required by cert() for full compatibility
            private_key_id: "bridge-generated",
            client_id: "",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
        }

        return NextResponse.json({ credentials: serviceAccountKey })
    } catch (error) {
        logger.error("Setup code activation error:", error)
        return NextResponse.json({ error: "Activation failed" }, { status: 500 })
    }
}
