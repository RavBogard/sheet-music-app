import crypto from "crypto"
import { deriveSetlistCounts } from "@/lib/setlist-derived-counts"
import { rowOrg } from "@/lib/mcp/org-context"
import { copyableRow } from "./create"
import { canonicalSort } from "./pure"
import { runSetlistTransaction, setlistRef, TRACKS } from "./writer"

/**
 * Server-side lazy hydration (setlist sync PR 3 fix round). A legacy setlist
 * that still carries its rows in an embedded `tracks[]` (hydrated !== true)
 * used to be fanned out by the browser editor on first open, one outbox `set`
 * per row. The browser no longer writes rows, so the editor page calls this on
 * its first server read instead: ONE transaction writes each embedded row as a
 * `tracks/{id}` doc (every stored field but identity and stamps, the
 * setlist's tenant, the embedded order) and sets `hydrated: true`.
 *
 * Idempotent: a hydrated setlist is left alone, and an embedded row whose id
 * already exists is not written again. The embedded array itself is left in
 * place (nothing is deleted).
 */

type DB = FirebaseFirestore.Firestore

const ID_RE = /^(?!\.\.?$)[^/]{1,200}$/

export interface HydrateResult {
    hydrated: boolean
    created: number
}

export async function hydrateEmbeddedTracks(db: DB, setlistId: string): Promise<HydrateResult> {
    if (!ID_RE.test(setlistId)) return { hydrated: false, created: 0 }
    return runSetlistTransaction(db, async (tx, w) => {
        const sRef = setlistRef(db, setlistId)
        const [snap, rowsSnap] = await Promise.all([
            tx.get(sRef),
            tx.get(db.collection(TRACKS).where("setlistId", "==", setlistId)),
        ])
        if (!snap.exists) return { hydrated: false, created: 0 }
        const data = snap.data() as Record<string, unknown>
        if (data.hydrated === true) return { hydrated: true, created: 0 }
        const org = rowOrg(data.orgId)
        const embedded = Array.isArray(data.tracks) ? (data.tracks as unknown[]) : []
        const existing = canonicalSort(
            rowsSnap.docs.map((d) => {
                const r = d.data() as Record<string, unknown>
                return { id: d.id, order: typeof r.order === "number" ? r.order : 0, data: r }
            }),
        )
        const have = new Set(existing.map((r) => r.id))
        const nowIso = new Date().toISOString()
        const created: Array<Record<string, unknown>> = []
        embedded.forEach((raw, i) => {
            if (!raw || typeof raw !== "object") return
            const src = raw as Record<string, unknown>
            const id = typeof src.id === "string" && ID_RE.test(src.id) ? src.id : crypto.randomUUID()
            if (have.has(id)) return
            have.add(id)
            const row = {
                ...copyableRow(src),
                id,
                setlistId,
                orgId: org,
                order: existing.length + i,
                type: typeof src.type === "string" ? src.type : "song",
                version: 1,
                lastModifiedAt: nowIso,
            }
            w.createTrack(id, row)
            created.push(row)
        })
        w.updateSetlist(setlistId, {
            hydrated: true,
            ...deriveSetlistCounts([...existing.map((r) => r.data), ...created]),
        })
        return { hydrated: true, created: created.length }
    })
}
