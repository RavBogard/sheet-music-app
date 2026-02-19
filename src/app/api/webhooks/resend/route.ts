/**
 * POST /api/webhooks/resend
 *
 * Receives delivery status webhooks from Resend.
 * Updates the corresponding emailEvents doc in Firestore.
 *
 * Events handled: email.sent, email.delivered, email.opened, email.bounced, email.complained
 *
 * Setup: In Resend dashboard → Webhooks → Add endpoint:
 *   URL: https://centralreform.live/api/webhooks/resend
 *   Events: email.sent, email.delivered, email.opened, email.bounced
 *   Copy signing secret → RESEND_WEBHOOK_SECRET env var
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createHmac } from "crypto"

// Map Resend event types to our status values
const EVENT_STATUS_MAP: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.opened": "opened",
    "email.clicked": "opened",
    "email.bounced": "bounced",
    "email.complained": "complained",
}

/**
 * Verify Svix webhook signature.
 * Resend uses Svix under the hood: headers are svix-id, svix-timestamp, svix-signature.
 */
function verifyWebhook(body: string, headers: Headers): boolean {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
        logger.warn("[Webhook] RESEND_WEBHOOK_SECRET not configured — skipping verification")
        return true // Allow in dev, but log warning
    }

    const svixId = headers.get("svix-id")
    const svixTimestamp = headers.get("svix-timestamp")
    const svixSignature = headers.get("svix-signature")

    if (!svixId || !svixTimestamp || !svixSignature) {
        return false
    }

    // Check timestamp freshness (within 5 minutes)
    const ts = parseInt(svixTimestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > 300) {
        return false
    }

    // Compute expected signature
    // Secret from Resend starts with "whsec_" — strip prefix and base64-decode
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
    const signPayload = `${svixId}.${svixTimestamp}.${body}`
    const expected = createHmac("sha256", secretBytes).update(signPayload).digest("base64")

    // svix-signature may contain multiple signatures separated by spaces
    const signatures = svixSignature.split(" ").map(s => s.replace(/^v1,/, ""))
    return signatures.some(sig => sig === expected)
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.text()

        // Verify signature
        if (!verifyWebhook(body, request.headers)) {
            logger.warn("[Webhook] Invalid Resend webhook signature")
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
        }

        const event = JSON.parse(body)
        const eventType: string = event.type
        const status = EVENT_STATUS_MAP[eventType]

        if (!status) {
            // Unhandled event type — acknowledge but ignore
            return NextResponse.json({ ok: true, ignored: true })
        }

        const messageId: string | undefined = event.data?.email_id
        if (!messageId) {
            logger.warn("[Webhook] No email_id in event:", eventType)
            return NextResponse.json({ ok: true, ignored: true })
        }

        // Find and update the emailEvent doc
        initAdmin()
        const db = getFirestore()

        // emailEvents are stored as: setlists/{setlistId}/emailEvents/{messageId}
        // We need to find which setlist this belongs to.
        // Use a collectionGroup query on emailEvents.
        const snap = await db.collectionGroup("emailEvents")
            .where("resendMessageId", "==", messageId)
            .limit(1)
            .get()

        if (snap.empty) {
            // Message ID not found — possibly old email or different sender
            logger.info(`[Webhook] No emailEvent found for messageId ${messageId}`)
            return NextResponse.json({ ok: true, notFound: true })
        }

        const docRef = snap.docs[0].ref
        const currentStatus = snap.docs[0].data().status

        // Only upgrade status (don't downgrade opened → delivered)
        const statusOrder = ["sent", "delayed", "delivered", "opened", "bounced", "complained"]
        const currentIdx = statusOrder.indexOf(currentStatus)
        const newIdx = statusOrder.indexOf(status)

        if (newIdx > currentIdx) {
            await docRef.update({
                status,
                [`${status}At`]: new Date(),
            })
            logger.info(`[Webhook] Updated ${messageId}: ${currentStatus} → ${status}`)
        }

        return NextResponse.json({ ok: true, status })
    } catch (err) {
        logger.error("[Webhook] Resend webhook error:", err)
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
    }
}
