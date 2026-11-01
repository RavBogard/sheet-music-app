import { NextResponse } from "next/server"
import { isHostTenantDoc } from "@/lib/org/setlist-tenant"
import { getT } from "@/i18n/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { assignMusiciansService } from "@/lib/scheduling/assignment-service"

const assignSchema = z.object({
    setlistId: z.string().min(1),
    setlistName: z.string().min(1),
    eventDate: z.string().nullable().optional(), // ISO string or null
    serviceType: z.string().optional(),
    musicians: z.array(z.object({
        uid: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        instrument: z.string().optional(),
        schedulingTier: z.enum(['core', 'regular', 'guest']).optional(),
    })).min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-003: rate-limit bulk assigns (each fires email + SMS + notification)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, setlistName, eventDate, serviceType, musicians } = ctx.body!
        const db = getFirestore()

        // BET-5 fix round: only the host tenant's setlist; another tenant's
        // (or a missing one) is not found, before any write or send.
        const setlistSnap = await db.collection("setlists").doc(setlistId).get()
        if (!isHostTenantDoc(setlistSnap.exists ? setlistSnap.data() : null, ctx.auth.orgId)) {
            const t = await getT()
            return NextResponse.json({ error: t("api-setlist.setlistNotFound") }, { status: 404 })
        }

        // Cycle-3 c1: shared service module — same logic the MCP `assign_musician`
        // tool calls. Wire response shape is unchanged.
        const result = await assignMusiciansService(db, {
            setlistId,
            setlistName,
            eventDate: eventDate ?? null,
            serviceType: serviceType ?? null,
            musicians,
            actor: {
                uid: ctx.auth.uid,
                email: ctx.auth.email ?? null,
            },
        })

        return NextResponse.json({
            success: true,
            assigned: result.assigned,
            errors: result.errors,
        })
    },
    { role: 'band_leader', schema: assignSchema }
)
