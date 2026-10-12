import "server-only"
/**
 * Multi-tenant phase 5 — which OTHER tenants' upcoming setlists use a chart.
 *
 * Deleting a chart that another tenant's upcoming setlist uses is refused
 * (archive stays allowed: the bytes stay and the existing rows keep working).
 * "Uses" = a track whose `fileId` or `songId` is the chart's id, in a setlist
 * that exists, belongs to a tenant other than the owner, and whose service day
 * (eventDate, else date) is today or later in that tenant's time zone. A setlist
 * with no readable day counts as upcoming — refusing is the safe direction.
 */
import type { Firestore } from "firebase-admin/firestore"
import { eventDayOf, orgDay } from "@/lib/performance/tonight"
import { rowOrg } from "@/lib/org/membership"
import type { OrgId } from "@/lib/org/types"

export interface ForeignUse {
    setlistId: string
    orgId: OrgId
    name: string | null
    day: string | null
    trackId: string
}

const CAP = 500

export async function upcomingForeignUses(
    db: Firestore,
    fileId: string,
    ownerOrg: OrgId,
    nowMs: number = Date.now(),
): Promise<ForeignUse[]> {
    const [byFile, bySong] = await Promise.all([
        db.collection("tracks").where("fileId", "==", fileId).limit(CAP).get(),
        db.collection("tracks").where("songId", "==", fileId).limit(CAP).get(),
    ])
    const tracks = new Map<string, string>()
    for (const d of [...byFile.docs, ...bySong.docs]) {
        const sid = d.get("setlistId")
        if (typeof sid === "string" && sid) tracks.set(d.id, sid)
    }
    const setlistIds = [...new Set(tracks.values())]
    if (!setlistIds.length) return []
    const snaps = await db.getAll(...setlistIds.map((id) => db.collection("setlists").doc(id)))
    const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Record<string, unknown>]))
    const out: ForeignUse[] = []
    for (const [trackId, setlistId] of tracks) {
        const s = byId.get(setlistId)
        if (!s) continue // dangling track: its setlist is gone
        const org = rowOrg(s.orgId)
        if (org === ownerOrg) continue
        const day = eventDayOf(s.eventDate ?? s.date, org)
        if (day !== null && day < orgDay(nowMs, org)) continue
        out.push({ setlistId, orgId: org, name: typeof s.name === "string" ? s.name : null, day, trackId })
    }
    return out.sort((a, b) => (a.day ?? "").localeCompare(b.day ?? "") || a.setlistId.localeCompare(b.setlistId))
}
