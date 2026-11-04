import { NextResponse } from "next/server"
import { z } from "zod"

import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { saveSongDefaults } from "@/lib/library/catalog-mirror"
import { rowOrg } from "@/lib/org/membership"

/**
 * POST /api/songs/defaults — the grid's sticky song memory (the key, Vocal
 * Lead and bpm a song was last used with). Browser writes to `songs/*` are
 * denied by the rules; this is the server write (src/lib/library/
 * catalog-mirror.ts): tenant-checked, versioned and broadcast.
 *
 * Auth: band leader or admin of the host tenant (`x-org-id`, set by the
 * proxy). The song must belong to that tenant; a chart shared from another
 * tenant is refused, and unknown or foreign songs both read as not found.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const schema = z.object({
    songId: z.string().min(1).max(200).regex(/^[^/]+$/),
    setlistId: z.string().min(1).max(200).regex(/^[^/]+$/),
    patch: z
        .object({
            key: z.string().max(16).optional(),
            lead: z.string().max(200).optional(),
            bpm: z.number().int().min(1).max(400).optional(),
        })
        .strict(),
})

const STATUS = { "not-found": 404, "not-owner": 404, invalid: 400 } as const

export const POST = createApiHandler(
    async (ctx) => {
        if (!initAdmin()) {
            return NextResponse.json({ ok: false, reason: "not-ready" }, { status: 503 })
        }
        const body = ctx.body!
        const db = getFirestore()
        // `recent[]` names the setlist the song was used on. Keep it only when
        // it is a setlist of the host tenant: another tenant's id (or a made-up
        // one) is dropped, never stored on this tenant's song.
        const sl = await db.collection("setlists").doc(body.setlistId).get()
        const setlistId = sl.exists && rowOrg(sl.data()?.orgId) === ctx.auth.orgId ? body.setlistId : null
        const result = await saveSongDefaults(db, ctx.auth.orgId, { ...body, setlistId })
        if (!result.ok) {
            const reason = result.reason === "not-owner" ? "not-found" : result.reason
            return NextResponse.json({ ok: false, reason }, { status: STATUS[result.reason] })
        }
        return NextResponse.json(result)
    },
    { role: "band_leader", schema },
)
