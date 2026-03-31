/**
 * Song Groups CRUD API
 *
 * GET  /api/admin/song-groups — List all song groups
 * PUT  /api/admin/song-groups — Upsert a song group
 * DELETE /api/admin/song-groups?groupId=xxx — Remove a song group
 *
 * Requires band_leader role.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { z } from "zod"
import { FieldValue } from "firebase-admin/firestore"

const putSchema = z.object({
    group: z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        liturgicalSlot: z.string().min(1),
        description: z.string().optional(),
        songs: z.array(z.object({
            fileId: z.string(),
            title: z.string(),
            key: z.string().optional(),
            addedAt: z.string(),
            addedBy: z.string(),
        })),
        sortOrder: z.number(),
    }),
})

// GET: Return all groups
export const GET = createApiHandler(
    async () => {
        initAdmin()
        const db = getFirestore()
        const snap = await db.doc("config/songGroups").get()
        const data = snap.exists ? snap.data() : { groups: {} }
        return NextResponse.json(data)
    },
    { role: 'band_leader' }
)

// PUT: Upsert a group
export const PUT = createApiHandler(
    async (ctx) => {
        const { group } = ctx.body!
        initAdmin()
        const db = getFirestore()
        await db.doc("config/songGroups").set(
            {
                [`groups.${group.id}`]: group,
                updatedAt: new Date().toISOString(),
                updatedBy: ctx.auth!.uid,
            },
            { merge: true }
        )
        return NextResponse.json({ success: true })
    },
    { role: 'band_leader', schema: putSchema }
)

// DELETE: Remove a group
export const DELETE = createApiHandler(
    async (ctx) => {
        const url = new URL(ctx.req.url)
        const groupId = url.searchParams.get("groupId")
        if (!groupId) {
            return NextResponse.json({ error: "groupId required" }, { status: 400 })
        }
        initAdmin()
        const db = getFirestore()
        await db.doc("config/songGroups").update({
            [`groups.${groupId}`]: FieldValue.delete(),
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.auth!.uid,
        })
        return NextResponse.json({ success: true })
    },
    { role: 'band_leader' }
)
