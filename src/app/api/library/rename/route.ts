import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"
import { normalizeChartTitle } from "@/lib/library/normalize-chart-title"
import {
    recomputeIndexNameFields,
} from "@/lib/library/recompute-index-name-fields"
import { bareStem } from "@/lib/mcp/title-specificity"

const schema = z.object({
    fileId: z.string().min(1),
    displayName: z.string().min(1, "displayName cannot be empty"),
})

/**
 * PATCH /api/library/rename
 *
 * Renames a library item. Writes `displayName` + the five W-02 trust-
 * calibration fields (name + nameLower + normalizedName + stem +
 * titleSpecificity) so PCU's exact + fuzzy dedup remains correct
 * against the renamed row. See Wave-2 ingest-mutator-matrix F-7 +
 * `src/lib/library/recompute-index-name-fields.ts`.
 *
 * Requires 'band_leader' role or above.
 *
 * Body: { fileId: string, displayName: string }
 */
export const PATCH = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileId, displayName } = ctx.body!
        // C4-007 dedup-bucket parity: every `name` write site funnels
        // through `normalizeChartTitle` so a stray NBSP or leading space
        // cannot fork the dedupe bucket.
        const trimmed = normalizeChartTitle(displayName)
        if (!trimmed) {
            return NextResponse.json(
                { error: "displayName cannot be empty after trimming." },
                { status: 400 },
            )
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const docRef = db.collection('library_index').doc(fileId)
        const docSnap = await docRef.get()

        if (!docSnap.exists) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        // F-7 W-02 recompute: count non-orphaned siblings sharing the
        // new title's stem (excluding self) + 1 so titleSpecificity gets
        // the same `siblingsInCatalog` PCU computes at upload time
        // (`library-upload.ts:537`). Read scope is library_index — same
        // collection this handler is writing to, so band_leader auth
        // covers it.
        const newStem = bareStem(trimmed)
        const siblingSnap = newStem
            ? await db
                  .collection("library_index")
                  .where("stem", "==", newStem)
                  .select("stem", "name", "status")
                  .get()
            : null
        const existingSiblings = siblingSnap
            ? siblingSnap.docs.filter(
                  (d) =>
                      d.id !== fileId &&
                      (d.data().status as string | undefined) !==
                          "orphaned",
              )
            : []
        const siblingsInCatalog = existingSiblings.length + 1
        const w02 = recomputeIndexNameFields(trimmed, siblingsInCatalog)

        // v60-09-01: mirror rename to songs/{fileId} so the ChartBindPopover
        // picker (driven by Dexie via subscribeSongsLibrary) reflects the new
        // title across devices without a manual reload.
        const songRef = db.collection('songs').doc(fileId)
        const [, songWriteResult] = await Promise.allSettled([
            docRef.update({
                // Canonical name + W-02 derivatives (F-7).
                name: trimmed,
                nameLower: w02.nameLower,
                normalizedName: w02.normalizedName,
                stem: w02.stem,
                titleSpecificity: w02.titleSpecificity,
                // Pre-F-7 fields preserved verbatim — UI consumers (library
                // grid, bind picker fallback) read `displayName` directly.
                displayName: trimmed,
                modifiedTime: new Date().toISOString(),
            }),
            songRef.set(
                {
                    title: trimmed,
                    normalizedTitle: trimmed.toLowerCase(),
                    updatedAt: Date.now(),
                },
                { merge: true },
            ),
        ])
        if (songWriteResult.status === 'rejected') {
            logger.warn(`[Rename] songs/{${fileId}} mirror failed`, songWriteResult.reason)
        }

        logger.info(`[Rename] ${fileId} → "${trimmed}"`)

        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, displayName: trimmed })
    },
    { role: 'band_leader', schema }
)
