import { storedClassFor } from "@/lib/history/classify"
import "server-only"
import { deriveSetlistCounts } from "@/lib/setlist-derived-counts"
import { createHash, randomUUID } from "node:crypto"
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore"
import { getTemplate, type TemplateSlot } from "@/lib/liturgical-templates"
import { parseEventDate } from "@/lib/parse-event-date"
import { resolveSlotLiturgyRef } from "@/lib/books/slot-liturgy"
import { codeOrgConfig } from "@/lib/org/config-code"
import { parseOrgConfig } from "@/lib/org/config-schema"
import { computeWeek, weekFields } from "@/lib/family/week-key"
import { type DetailsRequest, type EnsureRequest, type BridgeResponse, type Projection, type SharedRow, sharedRow } from "./contract"

type Data = Record<string, unknown>
export class BridgeError extends Error {
    constructor(public code: string, public status = 409) { super(code) }
}
export const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex")
export const linkId = (ceremonyId: string) => hash(["crc", ceremonyId])
export const collections = { links: "beitMitzvahLinks", claims: "beitMitzvahClaims", receipts: "beitMitzvahReceipts", reviews: "beitMitzvahReviews", intents: "beitMitzvahIntents" }
export const templateType = (type: string) => type === "morning" ? "bnei_mitzvah_saturday" : "havdalah_bnei_mitzvah"
const str = (value: unknown) => typeof value === "string" ? value : undefined
const clean = (row: Data) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))
function isCRC(data: Data | undefined): data is Data { return data?.orgId === "crc" }
export function dateOf(value: unknown): string | undefined {
    const date = value instanceof Timestamp ? value.toDate() : typeof value === "string" ? new Date(value) : undefined
    if (!date || !Number.isFinite(date.getTime())) return undefined
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** Only explicit template file bonds travel. Never invoke the fuzzy melody matcher. */
export function seedTemplateRows(slots: TemplateSlot[], book?: string): Data[] {
    if (slots.length > 200) throw new BridgeError("template_too_large")
    return slots.map((slot, order) => {
        const ref = resolveSlotLiturgyRef(slot.liturgyRefs, book)
        if (ref.status === "invalid") throw new BridgeError("template_liturgy_requires_review")
        return clean({
            id: randomUUID(), order, orgId: "crc", title: slot.label,
            type: slot.type ?? (slot.isHeader ? "header" : "song"),
            fileId: slot.fileId, fileName: slot.fileName, pageNumber: slot.pageNumber,
            fixed: slot.fixed, version: 1, lastModifiedAt: new Date().toISOString(),
            performer: slot.defaultPerformer, description: slot.description, estimatedMinutes: slot.estimatedMinutes,
            liturgyRef: ref.status === "resolved" ? ref.ref : undefined,
            momentId: ref.status === "resolved" ? ref.ref.unitId : undefined,
        })
    })
}

/** Claim, linked ceremony, setlist, rows and receipt commit together. No process-local locks. */
export async function ensureService(db: Firestore, request: EnsureRequest): Promise<BridgeResponse> {
    const receiptRef = db.collection(collections.receipts).doc(hash(["crc", request.idempotencyKey]))
    const ceremonyRef = db.collection(collections.links).doc(linkId(request.ceremonyId))
    const claimRef = db.collection(collections.claims).doc(hash(["crc", request.localDate, request.ceremonyType]))
    const inputHash = hash(request)
    const candidateId = randomUUID()
    const intentRef = db.collection(collections.intents).doc(linkId(request.ceremonyId))
    const scheduleRevision = request.scheduleRevision ?? 1
    if (request.excludedSetlistId && request.explicitSetlistId === request.excludedSetlistId) throw new BridgeError("excluded_setlist_conflict")
    // Persist ordering before attempting setup: even a failed newer operation
    // must fence a previously unprocessed older queued import.
    await db.runTransaction(async tx => {
        const receipt = (await tx.get(receiptRef)).data()
        if (receipt && receipt.inputHash !== inputHash) throw new BridgeError("idempotency_conflict")
        const intent = (await tx.get(intentRef)).data()
        if (intent && !isCRC(intent)) throw new BridgeError("link_conflict")
        if (intent?.excludedSetlistId && intent.excludedSetlistId !== request.excludedSetlistId) throw new BridgeError("excluded_setlist_conflict")
        if (request.excludedSetlistId) {
            const excluded = (await tx.get(db.collection("setlists").doc(request.excludedSetlistId))).data()
            if (!isCRC(excluded)) throw new BridgeError("not_found", 404)
            if (receipt?.setlistId === request.excludedSetlistId) throw new BridgeError("excluded_setlist_conflict")
            const linked = (await tx.get(ceremonyRef)).data()
            if (linked?.setlistId === request.excludedSetlistId) throw new BridgeError("excluded_setlist_conflict")
        }
        if (receipt?.setlistId) return
        if (intent && scheduleRevision < Number(intent.scheduleRevision)) throw new BridgeError("stale_schedule_revision")
        if (intent && scheduleRevision === intent.scheduleRevision &&
            (intent.localDate !== request.localDate || intent.ceremonyType !== request.ceremonyType ||
                (intent.excludedSetlistId ?? null) !== (request.excludedSetlistId ?? null))) throw new BridgeError("schedule_revision_conflict")
        if (!intent || scheduleRevision > Number(intent.scheduleRevision)) tx.set(intentRef, clean({
            orgId: "crc", scheduleRevision, localDate: request.localDate, ceremonyType: request.ceremonyType,
            excludedSetlistId: request.excludedSetlistId,
        }))
    })
    // BET-6: the advisory week key for a newly created service (CRC only).
    const week = await computeWeek(request.localDate, "crc")
    return db.runTransaction(async tx => {
        const receipt = (await tx.get(receiptRef)).data()
        if (receipt && receipt.inputHash !== inputHash) throw new BridgeError("idempotency_conflict")
        const intent = (await tx.get(intentRef)).data()
        if (intent && !isCRC(intent)) throw new BridgeError("not_found", 404)
        if (request.excludedSetlistId) {
            const excluded = (await tx.get(db.collection("setlists").doc(request.excludedSetlistId))).data()
            if (!isCRC(excluded)) throw new BridgeError("not_found", 404)
        }
        if (!receipt?.setlistId && intent && scheduleRevision < Number(intent.scheduleRevision)) throw new BridgeError("stale_schedule_revision")
        const existing = (await tx.get(ceremonyRef)).data()
        if (existing) {
            if (!isCRC(existing)) throw new BridgeError("not_found", 404)
            const excluded = request.excludedSetlistId ?? intent?.excludedSetlistId ?? existing.excludedSetlistId
            if (excluded && existing.setlistId === excluded) throw new BridgeError("excluded_setlist_conflict")
            if (request.explicitSetlistId && request.explicitSetlistId !== existing.setlistId) throw new BridgeError("link_conflict")
            const linked = (await tx.get(db.collection("setlists").doc(String(existing.setlistId)))).data()
            if (!isCRC(linked)) throw new BridgeError("not_found", 404)
            // A delayed retry of an older import must never undo a later reschedule.
            if (receipt?.setlistId) return { version: 1, status: existing.reviewRequired ? "review_required" : "linked", setlistId: String(existing.setlistId) }
            const changed = existing.localDate !== request.localDate || existing.ceremonyType !== request.ceremonyType ||
                dateOf(linked.eventDate) !== existing.localDate || linked.templateType !== templateType(String(existing.ceremonyType))
            tx.update(ceremonyRef, { reviewRequired: changed || existing.reviewRequired === true,
                scheduleRevision, requestedLocalDate: request.localDate, requestedCeremonyType: request.ceremonyType })
            tx.set(receiptRef, { orgId: "crc", inputHash, setlistId: existing.setlistId })
            return { version: 1, status: changed || existing.reviewRequired ? "review_required" : "linked", setlistId: String(existing.setlistId) }
        }
        const claim = (await tx.get(claimRef)).data()
        if (claim && !isCRC(claim)) throw new BridgeError("link_conflict")
        // The claim serializes competing setup transactions. It is not authority
        // to bypass a newly ambiguous source date or an explicit staff link.
        let setlistId = request.explicitSetlistId
        let selected: Data | undefined
        if (setlistId) {
            selected = (await tx.get(db.collection("setlists").doc(setlistId))).data()
            if (!isCRC(selected) || selected.isTest === true) throw new BridgeError("not_found", 404)
        } else {
            const start = parseEventDate(`${request.localDate}T00:00`, "crc")
            const nextDay = new Date(`${request.localDate}T12:00:00Z`)
            nextDay.setUTCDate(nextDay.getUTCDate() + 1)
            const end = parseEventDate(`${nextDay.toISOString().slice(0, 10)}T00:00`, "crc")
            // Single range query needs no composite index. Never truncate a crowded date silently.
            const day = await tx.get(db.collection("setlists").where("eventDate", ">=", start).where("eventDate", "<", end).limit(201))
            if (day.size > 200) throw new BridgeError("date_requires_staff_review")
            const matches = day.docs.filter(doc => {
                const row = doc.data()
                return doc.id !== request.excludedSetlistId && isCRC(row) && row.isTest !== true && row.templateType === templateType(request.ceremonyType)
            })
            if (matches.length > 1) {
                tx.set(receiptRef, { orgId: "crc", inputHash, ambiguous: true })
                return { version: 1, status: "ambiguous", candidates: matches.map(doc => ({ setlistId: doc.id })) }
            }
            if (matches.length === 1) { setlistId = matches[0].id; selected = matches[0].data() }
        }
        if (!setlistId) {
            const today = dateOf(new Date().toISOString())!
            if (request.localDate <= today) throw new BridgeError("past_service_requires_staff")
            const key = templateType(request.ceremonyType)
            const custom = (await tx.get(db.collection("templates").doc(key))).data()
            if (custom && custom.orgId !== undefined && !isCRC(custom)) throw new BridgeError("template_unavailable")
            const slots = custom?.slots ?? getTemplate(key)
            if (!Array.isArray(slots) || slots.some(slot => !slot || typeof slot.label !== "string")) throw new BridgeError("template_unavailable")
            let config = codeOrgConfig("crc")
            if (process.env.ORG_CONFIG_SOURCE === "firestore") {
                const stored = (await tx.get(db.collection("orgs").doc("crc"))).data()
                const parsed = parseOrgConfig(stored)
                if (parsed.ok) {
                    if (parsed.config.id !== "crc") throw new BridgeError("tenant_configuration_invalid")
                    config = parsed.config
                }
            }
            const book = config?.liturgy.defaultBookByService[key]
            const rows = seedTemplateRows(slots, book)
            setlistId = candidateId
            const stamp = FieldValue.serverTimestamp()
            tx.create(db.collection("setlists").doc(setlistId), clean({
                id: setlistId, orgId: "crc", name: request.displayName ?? `B'nei Mitzvah ${request.ceremonyType === "morning" ? "Morning" : "Havdalah"} — ${request.localDate}`,
                eventDate: parseEventDate(`${request.localDate}T${request.ceremonyType === "morning" ? "10:00" : "16:00"}`, "crc"), templateType: key, serviceType: storedClassFor({ templateType: key }).serviceType ?? null,
                date: stamp, updatedAt: stamp, version: 1, lastModifiedAt: new Date().toISOString(),
                ownerId: "beit-mitzvah-service", ownerName: "Beit Mitzvah", hydrated: true, isTest: false,
                ...deriveSetlistCounts(rows),
                book,
                // BET-6: the ceremony this service belongs to (opaque id, no names).
                ceremonyId: request.ceremonyId, ceremonyIds: [request.ceremonyId], occasion: "bnei-mitzvah",
                ...(week ? weekFields(week) : {}),
            }))
            for (const row of rows) tx.create(db.collection("tracks").doc(String(row.id)), { ...row, setlistId })
        }
        // BET-6: a linked existing service learns its ceremony. A setlist that a
        // second ceremony also links to keeps its first ceremonyId and lists
        // every ceremony in ceremonyIds, so each one's card shows.
        if (selected) {
            const first = typeof selected.ceremonyId === "string" ? selected.ceremonyId : request.ceremonyId
            tx.update(db.collection("setlists").doc(setlistId), {
                ceremonyId: first, occasion: "bnei-mitzvah",
                ceremonyIds: FieldValue.arrayUnion(first, request.ceremonyId),
            })
        }
        const reviewRequired = !!selected && (dateOf(selected.eventDate) !== request.localDate || selected.templateType !== templateType(request.ceremonyType))
        tx.create(ceremonyRef, clean({ orgId: "crc", ceremonyId: request.ceremonyId, setlistId, localDate: request.localDate, ceremonyType: request.ceremonyType,
            excludedSetlistId: request.excludedSetlistId,
            scheduleRevision, requestedLocalDate: request.localDate, requestedCeremonyType: request.ceremonyType, reviewRequired }))
        if (request.excludedSetlistId && claim?.setlistId === request.excludedSetlistId) {
            // Preserve the original claim's pointer while serializing split
            // creation. Date queries, never this pointer, decide uniqueness.
            tx.update(claimRef, { revision: FieldValue.increment(1) })
        } else if (!claim || !request.explicitSetlistId) tx.set(claimRef, { orgId: "crc", setlistId })
        tx.set(receiptRef, { orgId: "crc", inputHash, setlistId })
        return { version: 1, status: reviewRequired ? "review_required" : "linked", setlistId }
    })
}

export interface Source { link: Data; setlist: Data; rows: Data[]; sourceRevision: string }
export async function readSource(db: Firestore, ceremonyId: string, tx?: Transaction): Promise<Source> {
    const get = (ref: FirebaseFirestore.DocumentReference) => tx ? tx.get(ref) : ref.get()
    const storedLink = (await get(db.collection(collections.links).doc(linkId(ceremonyId)))).data() as Data | undefined
    const intent = (await get(db.collection(collections.intents).doc(linkId(ceremonyId)))).data() as Data | undefined
    const link = storedLink && { ...storedLink }
    if (!isCRC(link)) throw new BridgeError("not_found", 404)
    if (link.setlistId === (intent?.excludedSetlistId ?? link.excludedSetlistId)) throw new BridgeError("excluded_setlist_conflict")
    if (intent) {
        if (!isCRC(intent)) throw new BridgeError("not_found", 404)
        if (intent.excludedSetlistId) link.excludedSetlistId = intent.excludedSetlistId
        link.scheduleRevision = intent.scheduleRevision
        link.requestedLocalDate = intent.localDate
        link.requestedCeremonyType = intent.ceremonyType
        link.reviewRequired = link.reviewRequired === true || intent.localDate !== link.localDate || intent.ceremonyType !== link.ceremonyType
    }
    const parent = await get(db.collection("setlists").doc(String(link.setlistId)))
    const setlist = parent.data() as Data | undefined
    if (!isCRC(setlist) || setlist.isTest === true) throw new BridgeError("not_found", 404)
    const query = db.collection("tracks").where("setlistId", "==", link.setlistId).limit(201)
    const tracks = tx ? await tx.get(query) : await query.get()
    if (tracks.size > 200 || tracks.docs.some(doc => !isCRC(doc.data()))) throw new BridgeError("source_requires_staff_review")
    const rows = tracks.docs.map(doc => ({ ...doc.data(), id: doc.id } as Data)).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0) || String(a.id).localeCompare(String(b.id)))
    const sourceRevision = hash([setlist, rows, intent ?? null])
    return { link, setlist, rows, sourceRevision }
}
export function shareableRows(source: Source): SharedRow[] {
    return source.rows.map((row, index) => sharedRow.parse(clean({
        rowId: row.id, order: typeof row.order === "number" ? row.order : index, title: row.title ?? "",
        prayerId: str(row.prayerId), momentId: str(row.momentId), catalogUnitId: str(row.catalogUnitId), biblicalRef: str(row.biblicalRef),
        edition: str(row.edition), textIdentity: str(row.textIdentity), liturgyRef: row.liturgyRef ?? undefined,
        arrangement: row.songId || row.fileId || row.key ? clean({ songId: str(row.songId), fileId: str(row.fileId), key: str(row.key) }) : undefined,
        resources: [],
    })))
}
export function sourceNeedsReview(source: Source): boolean {
    return source.link.reviewRequired === true || dateOf(source.setlist.eventDate) !== source.link.localDate || source.setlist.templateType !== templateType(String(source.link.ceremonyType))
}
/** Order/private notes do not invalidate a musical identity approval. */
export function semanticRevision(source: Source): string {
    return hash([source.setlist.book ?? null, shareableRows(source).map(({ order: _order, ...row }) => ({ ...row,
        audioFileId: source.rows.find(item => item.id === row.rowId)?.audioFileId ?? null,
    })).sort((a, b) => a.rowId.localeCompare(b.rowId))])
}
export async function projection(db: Firestore, ceremonyId: string): Promise<BridgeResponse> {
    const source = await readSource(db, ceremonyId)
    const review = (await db.collection(collections.reviews).doc(linkId(ceremonyId)).get()).data()
    const approved = review?.orgId === "crc" && review.status === "approved" && review.semanticRevision === semanticRevision(source) && !sourceNeedsReview(source)
    const approvedRows = approved ? (review.rows as SharedRow[]).map(row => sharedRow.parse(row)) : []
    const rows = shareableRows(source).flatMap(row => {
        const reviewed = approvedRows.find(item => item.rowId === row.rowId)
        return reviewed ? [{ ...reviewed, order: row.order }] : []
    })
    const projection: Projection = {
        setlistId: String(source.link.setlistId), sourceRevision: source.sourceRevision,
        localDate: String(source.link.localDate), ceremonyType: source.link.ceremonyType as "morning" | "havdalah", rows,
        operatorLinks: { music: `https://www.centralreform.live/perform/setlist/${source.link.setlistId}`,
            review: `https://www.centralreform.live/integrations/beit-mitzvah?ceremonyId=${ceremonyId}` },
    }
    return { version: 1, status: approved ? "linked" : "review_required", setlistId: projection.setlistId, sourceRevision: source.sourceRevision, projection }
}

/**
 * BET-6: the portal's ceremony details for the setlist's read-only card
 * (student names, slot, reading reference names, rehearsal dates). Stored on
 * the existing link only; it never creates a service, changes a setlist or
 * touches the projection revision. Replaces the previous details whole, but
 * only when `sentAt` is newer than the stored send; an older one is a no-op ack.
 */
export async function saveDetails(db: Firestore, request: DetailsRequest): Promise<{ applied: boolean }> {
    const ref = db.collection(collections.links).doc(linkId(request.ceremonyId))
    const sentAt = new Date(request.sentAt).toISOString()
    return db.runTransaction(async tx => {
        const link = (await tx.get(ref)).data()
        if (!isCRC(link)) throw new BridgeError("not_found", 404)
        // Ordering fence: a delayed or replayed older send never overwrites newer details.
        if (typeof link.detailsSentAt === "string" && link.detailsSentAt >= sentAt) return { applied: false }
        tx.update(ref, { detailsSentAt: sentAt, details: clean({
            students: request.students, slot: request.slot, torahRef: request.torahRef,
            haftarahRef: request.haftarahRef, rehearsals: request.rehearsals,
        }), detailsUpdatedAt: FieldValue.serverTimestamp() })
        return { applied: true }
    })
}
