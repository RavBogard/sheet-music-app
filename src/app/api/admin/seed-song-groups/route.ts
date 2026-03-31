/**
 * POST /api/admin/seed-song-groups
 *
 * Seeds the config/songGroups document from liturgical templates
 * and library index. Idempotent — merges with existing groups.
 *
 * For each template slot with type 'song' and queries,
 * searches library_index for matching files by name.
 *
 * Requires admin role.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { TEMPLATES } from "@/lib/liturgical-templates"
import { logger } from "@/lib/logger"

export const POST = createApiHandler(
    async (ctx) => {
        initAdmin()
        const db = getFirestore()

        // 1. Extract unique song slots from all templates
        const slotsMap = new Map<string, { label: string; queries: string[] }>()
        for (const slots of Object.values(TEMPLATES)) {
            for (const slot of slots) {
                if (slot.type === 'song' && slot.queries.length > 0 && !slotsMap.has(slot.label)) {
                    slotsMap.set(slot.label, { label: slot.label, queries: slot.queries })
                }
            }
        }

        // 2. Load library index for matching
        const indexSnap = await db.collection("library_index").limit(500).get()

        // 3. For each slot, find matching files
        const groups: Record<string, any> = {}
        let sortOrder = 0

        for (const [label, slotInfo] of slotsMap) {
            const groupId = label.toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '')

            const matchingFiles: any[] = []

            for (const fileDoc of indexSnap.docs) {
                const file = fileDoc.data()
                const fileName = (file.name || "").toLowerCase()

                const isMatch = slotInfo.queries.some((q) => {
                    const qLower = q.toLowerCase()
                    return fileName.includes(qLower)
                })

                if (isMatch) {
                    matchingFiles.push({
                        fileId: fileDoc.id,
                        title: file.displayName || file.name || "Untitled",
                        key: file.metadata?.key || undefined,
                        addedAt: new Date().toISOString(),
                        addedBy: ctx.auth!.uid,
                    })
                }
            }

            if (matchingFiles.length > 0) {
                groups[groupId] = {
                    id: groupId,
                    label,
                    liturgicalSlot: label,
                    songs: matchingFiles,
                    sortOrder: sortOrder++,
                }
            }
        }

        // 4. Merge with existing config/songGroups (don't overwrite manual edits)
        const existing = await db.doc("config/songGroups").get()
        const existingGroups = existing.exists ? existing.data()?.groups || {} : {}

        const merged = { ...groups }
        // Preserve any manually-created groups not in templates
        for (const [id, group] of Object.entries(existingGroups)) {
            if (!merged[id]) {
                merged[id] = group
            }
        }

        await db.doc("config/songGroups").set({
            groups: merged,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.auth!.uid,
        })

        // 5. Update liturgicalSlot on matched library_index docs
        let taggedCount = 0
        for (const group of Object.values(groups) as any[]) {
            for (const song of group.songs) {
                try {
                    await db.collection("library_index").doc(song.fileId).update({
                        "metadata.liturgicalSlot": group.liturgicalSlot,
                    })
                    taggedCount++
                } catch (e) {
                    logger.warn(`[SeedSongGroups] Failed to tag ${song.fileId}:`, e)
                }
            }
        }

        return NextResponse.json({
            success: true,
            seededCount: Object.keys(groups).length,
            totalGroups: Object.keys(merged).length,
            taggedSongs: taggedCount,
        })
    },
    { role: 'admin' }
)
