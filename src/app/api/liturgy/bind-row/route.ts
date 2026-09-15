import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { rowOrg } from "@/lib/mcp/org-context"
import { resolveOrgIdByDomain } from "@/lib/org/registry"
import { autoBindLiturgyRef } from "@/lib/liturgy/bind-on-type"
import { logger } from "@/lib/logger"

/**
 * POST /api/liturgy/bind-row — bind on type, for the browser.
 *
 * Round 3, item 5. The MCP write tools bind inside the tool; the grid cannot,
 * because it writes through the local-first sync engine straight to Firestore
 * with no server in the path. The two honest options were to ship the lookup
 * table into the setlist bundle — a hundred-odd kilobytes of tables and a
 * Levenshtein matcher onto the iPads, to decide something no one is waiting
 * for — or to ask the server. This is asking the server.
 *
 * FIRE AND FORGET. The grid calls this after a title commit and ignores the
 * answer; the row is already saved and correct without it. A page number is an
 * enrichment, so being offline, rate-limited or unlucky costs nothing and
 * `propose_liturgy_bindings` sweeps up whatever was missed. Nothing here ever
 * blocks or reverts an edit.
 *
 * NEVER OVERWRITES, NEVER GUESSES. A row already carrying a `liturgyRef` is
 * returned untouched, and a merely plausible match is reported and not
 * written — the same two rules the batch tool and the MCP paths follow. The
 * caller is whoever can already edit the setlist; this writes one field that
 * that person's own client could write directly.
 */

const schema = z.object({
    setlistId: z.string().min(1),
    trackId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            return apiError("Server not ready", 500, "FIREBASE_NOT_INITIALIZED")
        }
        const db = getFirestore()
        const org = resolveOrgIdByDomain(ctx.req.headers.get("host"))
        const { setlistId, trackId } = ctx.body!

        const setlistSnap = await db.collection("setlists").doc(setlistId).get()
        if (!setlistSnap.exists) return apiError("Setlist not found", 404, "NOT_FOUND")
        const setlist = setlistSnap.data() as Record<string, unknown>
        // Same wall the MCP loader keeps: another tenant's id reads as absent.
        if (rowOrg(setlist.orgId) !== org) {
            return apiError("Setlist not found", 404, "NOT_FOUND")
        }
        const book = typeof setlist.book === "string" ? setlist.book : null
        if (!book) return NextResponse.json({ ok: true, outcome: "no-book" })

        const trackRef = db.collection("tracks").doc(trackId)
        const trackSnap = await trackRef.get()
        if (!trackSnap.exists) return apiError("Track not found", 404, "NOT_FOUND")
        const track = trackSnap.data() as Record<string, unknown>
        if (track.setlistId !== setlistId) {
            return apiError("Track is not on that setlist", 400, "TRACK_SETLIST_MISMATCH")
        }
        if (track.liturgyRef && typeof track.liturgyRef === "object") {
            return NextResponse.json({ ok: true, outcome: "already-bound" })
        }

        const auto = autoBindLiturgyRef(
            book,
            typeof track.title === "string" ? track.title : "",
            typeof track.type === "string" ? track.type : "song",
            typeof setlist.templateType === "string" ? setlist.templateType : null,
        )
        if (!auto.ref) {
            return NextResponse.json({
                ok: true,
                outcome: auto.suggestions.length ? "suggestions" : "no-match",
                suggestions: auto.suggestions,
            })
        }

        try {
            await trackRef.update({
                liturgyRef: auto.ref,
                ...(auto.momentId ? { momentId: auto.momentId } : {}),
            })
        } catch (err) {
            // The row is saved and correct; only the page is missing. Say so
            // and let the batch sweep catch it rather than failing an edit.
            logger.warn("[bind-row] write failed", {
                trackId,
                err: err instanceof Error ? err.message : String(err),
            })
            return NextResponse.json({ ok: true, outcome: "write-failed" })
        }

        return NextResponse.json({ ok: true, outcome: "bound", liturgyRef: auto.ref })
    },
    { schema },
)
