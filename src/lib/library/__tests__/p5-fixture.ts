/**
 * Multi-tenant phase 5 — one library fixture for the golden capture, the
 * visibility job, the stamp script and the `nava` move rehearsal. Shaped like
 * production before phase 5: rows carry `orgId` and the legacy `collection`
 * string, and NO `collectionId` / `visibleToOrgs`.
 *
 * CRC: core (two rows, one with no collection field), supplemental, nava
 * (three rows, one archived), uploads, plus an archived, a duplicate, an
 * orphaned and a non-chart (audio) row. BL: core and uploads. Two CRC setlists
 * (one upcoming, one past) and one BL setlist with tracks bound to charts.
 * Ids are fixed so tests can name them. No liturgical text: titles only.
 */
import type { Firestore } from "firebase-admin/firestore"

const PDF = "application/pdf"

type Row = Record<string, unknown>

export const P5_FIXTURE_INDEX: Record<string, Row> = {
    "c-core-1": { name: "Adon Olam (Klepper).pdf", title: "Adon Olam (Klepper).pdf", orgId: "crc", collection: "core", mimeType: PDF, status: "active", key: "G", bpm: 92, uploadedAt: "2025-01-02T00:00:00.000Z", stem: "adon olam", titleSpecificity: 0.8 },
    "c-core-2": { name: "Oseh Shalom.pdf", title: "Oseh Shalom.pdf", orgId: "crc", mimeType: PDF, status: "active", key: "D", uploadedAt: "2025-01-03T00:00:00.000Z" },
    "c-core-arch": { name: "Adon Olam (old).pdf", orgId: "crc", collection: "core", mimeType: PDF, status: "archived", uploadedAt: "2024-01-01T00:00:00.000Z" },
    "c-core-dup": { name: "Oseh Shalom copy.pdf", orgId: "crc", mimeType: PDF, status: "duplicate", uploadedAt: "2025-02-01T00:00:00.000Z" },
    "c-core-orph": { name: "Lost Chart.pdf", orgId: "crc", collection: "core", mimeType: PDF, status: "orphaned" },
    "c-core-mp3": { name: "Oseh Shalom.mp3", orgId: "crc", collection: "core", mimeType: "audio/mpeg", status: "active" },
    "c-sup-1": { name: "Hashkivenu (Shireinu).pdf", orgId: "crc", collection: "supplemental", mimeType: PDF, status: "active", key: "Em" },
    "c-nava-1": { name: "Lakh Amar Libi.pdf", title: "Lakh Amar Libi.pdf", orgId: "crc", collection: "nava", mimeType: PDF, status: "active", key: "Am", fileSize: 120000, uploadedAt: "2025-03-01T00:00:00.000Z", tags: ["nava"] },
    "c-nava-2": { name: "Niggun Tishrei.pdf", orgId: "crc", collection: "nava", mimeType: PDF, status: "active", key: "Dm", uploadedAt: "2025-03-02T00:00:00.000Z" },
    "c-nava-arch": { name: "Arbaim Shana (old).pdf", orgId: "crc", collection: "nava", mimeType: PDF, status: "archived" },
    "c-up-1": { name: "L'Cha Dodi (Nava).pdf", orgId: "crc", collection: "uploads", mimeType: PDF, status: "active", key: "C" },
    "b-core-1": { name: "Adon Olam (BL).pdf", orgId: "brotherslazaroff", collection: "core", mimeType: PDF, status: "active", key: "A" },
    "b-up-1": { name: "Lecha Dodi Nigun (Nava).pdf", orgId: "brotherslazaroff", collection: "uploads", mimeType: PDF, status: "active", key: "Dm" },
}

/** songs/{id} mirrors (no collection field, as in production). */
export const P5_FIXTURE_SONGS: Record<string, Row> = Object.fromEntries(
    Object.entries(P5_FIXTURE_INDEX)
        .filter(([id]) => id !== "c-core-orph")
        .map(([id, r]) => [
            id,
            {
                title: String(r.name).replace(/\.(pdf|mp3)$/i, ""),
                orgId: r.orgId,
                status: r.status,
                ...(typeof r.key === "string" ? { key: r.key } : {}),
                ...(typeof r.bpm === "number" ? { bpm: r.bpm } : {}),
                fileName: r.name,
                mimeType: r.mimeType,
            },
        ]),
)

/** Chord pages for search_chart_text (scope chords). */
export const P5_FIXTURE_CHORDS: Record<string, Row> = {
    "c-nava-1": { chords: [{ text: "Am7" }, { text: "Dm" }] },
    "c-core-1": { chords: [{ text: "G" }, { text: "Am7" }] },
    "b-up-1": { chords: [{ text: "Am7" }] },
}

export const P5_FIXTURE_SETLISTS: Record<string, Row> = {
    "s-crc-up": { name: "CRC upcoming", orgId: "crc", date: "2099-01-02T00:00:00.000Z", eventDate: "2099-01-02", trackCount: 2 },
    "s-crc-past": { name: "CRC past", orgId: "crc", date: "2020-01-02T00:00:00.000Z", eventDate: "2020-01-02", trackCount: 1 },
    "s-bl-up": { name: "BL upcoming", orgId: "brotherslazaroff", date: "2099-02-02T00:00:00.000Z", eventDate: "2099-02-02", trackCount: 1 },
}

export const P5_FIXTURE_TRACKS: Record<string, Row> = {
    "t-crc-1": { setlistId: "s-crc-up", songId: "c-nava-1", fileId: "c-nava-1", title: "Lakh Amar Libi", fileName: "Lakh Amar Libi.pdf", mimeType: PDF, order: 0, type: "song", orgId: "crc" },
    "t-crc-2": { setlistId: "s-crc-up", songId: "c-core-1", fileId: "c-core-1", title: "Adon Olam (Klepper)", fileName: "Adon Olam (Klepper).pdf", mimeType: PDF, order: 1, type: "song", orgId: "crc" },
    "t-crc-3": { setlistId: "s-crc-past", songId: "c-nava-2", fileId: "c-nava-2", title: "Niggun Tishrei", fileName: "Niggun Tishrei.pdf", mimeType: PDF, order: 0, type: "song", orgId: "crc" },
    "t-bl-1": { setlistId: "s-bl-up", songId: "b-core-1", fileId: "b-core-1", title: "Adon Olam (BL)", fileName: "Adon Olam (BL).pdf", mimeType: PDF, order: 0, type: "song", orgId: "brotherslazaroff" },
}

const CLEAR = ["library_index", "songs", "setlists", "tracks", "collections", "memberships", "users", "orgs", "platformAudit", "auditLogs", "aiEnrichmentRetryQueue"]

/** Clear the collections this fixture owns, then seed it. */
export async function seedP5Library(db: Firestore, opts: { admin: string; withCollections?: boolean }): Promise<void> {
    for (const c of CLEAR) {
        const snap = await db.collection(c).get()
        for (const d of snap.docs) {
            if (c === "library_index") {
                const pages = await d.ref.collection("chordData").get()
                await Promise.all(pages.docs.map((p) => p.ref.delete()))
            }
            await d.ref.delete()
        }
    }
    const batch = db.batch()
    for (const [id, r] of Object.entries(P5_FIXTURE_INDEX)) batch.set(db.collection("library_index").doc(id), r)
    for (const [id, r] of Object.entries(P5_FIXTURE_SONGS)) batch.set(db.collection("songs").doc(id), r)
    for (const [id, r] of Object.entries(P5_FIXTURE_CHORDS))
        batch.set(db.collection("library_index").doc(id).collection("chordData").doc("page_0"), r)
    for (const [id, r] of Object.entries(P5_FIXTURE_SETLISTS)) batch.set(db.collection("setlists").doc(id), r)
    for (const [id, r] of Object.entries(P5_FIXTURE_TRACKS)) batch.set(db.collection("tracks").doc(id), r)
    for (const org of ["crc", "brotherslazaroff"]) {
        batch.set(db.collection("memberships").doc(`${org}__${opts.admin}`), {
            uid: opts.admin,
            tenantId: org,
            role: "admin",
            soundEngineer: false,
            addedBy: "fixture",
            addedAt: new Date(0),
        })
    }
    batch.set(db.collection("users").doc(opts.admin), { uid: opts.admin, role: "admin", orgIds: ["crc", "brotherslazaroff"] })
    if (opts.withCollections) {
        for (const [id, rec] of Object.entries(P5_FIXTURE_COLLECTIONS)) batch.set(db.collection("collections").doc(id), rec)
    }
    await batch.commit()
}

/** collections/{id} as phase 4 seeded them (all private). */
export const P5_FIXTURE_COLLECTIONS: Record<string, Row> = {
    crc__core: { ownerOrgId: "crc", name: "core", label: "CRC Charts", visibility: "private", sharedWith: [], assignedTo: [] },
    crc__supplemental: { ownerOrgId: "crc", name: "supplemental", label: "Shireinu", visibility: "private", sharedWith: [], assignedTo: [] },
    crc__nava: { ownerOrgId: "crc", name: "nava", label: "Nava Tehilah", visibility: "private", sharedWith: [], assignedTo: [] },
    crc__uploads: { ownerOrgId: "crc", name: "uploads", label: "Uploads", visibility: "private", sharedWith: [], assignedTo: [] },
    brotherslazaroff__core: { ownerOrgId: "brotherslazaroff", name: "core", label: "Charts", visibility: "private", sharedWith: [], assignedTo: [] },
    brotherslazaroff__uploads: { ownerOrgId: "brotherslazaroff", name: "uploads", label: "Uploads", visibility: "private", sharedWith: [], assignedTo: [] },
}
