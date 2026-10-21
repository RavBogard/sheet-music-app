import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore"
import { getTemplate, type TemplateSlot } from "@/lib/liturgical-templates"
import { parseEventDate } from "@/lib/parse-event-date"
import { resolveSlotLiturgyRef } from "@/lib/books/slot-liturgy"
import { codeOrgConfig } from "@/lib/org/config-code"
import { parseOrgConfig } from "@/lib/org/config-schema"
import { type EnsureRequest, type BridgeResponse, type Projection, type SharedRow, sharedRow } from "./contract"

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
    // Persist ordering before attempting setup: even a failed newer operation
    // must fence a previously unprocessed older queued import.
    await db.runTransaction(async tx => {
        const receipt = (await tx.get(receiptRef)).data()
        if (receipt && receipt.inputHash !== inputHash) throw new BridgeError("idempotency_conflict")
        if (receipt?.setlistId) return
        const intent = (await tx.get(intentRef)).data()
        if (intent && !isCRC(intent)) throw new BridgeError("link_conflict")
        if (intent && scheduleRevision < Number(intent.scheduleRevision)) throw new BridgeError("stale_schedule_revision")
        if (intent && scheduleRevision === intent.scheduleRevision &&
            (intent.localDate !== request.localDate || intent.ceremonyType !== request.ceremonyType)) throw new BridgeError("schedule_revision_conflict")
        if (!intent || scheduleRevision > Number(intent.scheduleRevision)) tx.set(intentRef, {
            orgId: "crc", scheduleRevision, localDate: request.localDate, ceremonyType: request.ceremonyType,
        })
    })
    return db.runTransaction(async tx => {
        const receipt = (await tx.get(receiptRef)).data()
        if (receipt && receipt.inputHash !== inputHash) throw new BridgeError("idempotency_conflict")
        const intent = (await tx.get(intentRef)).data()
        if (intent && !isCRC(intent)) throw new BridgeError("not_found", 404)
        if (!receipt?.setlistId && intent && scheduleRevision < Number(intent.scheduleRevision)) throw new BridgeError("stale_schedule_revision")
        const existing = (await tx.get(ceremonyRef)).data()
        if (existing) {
            if (!isCRC(existing)) throw new BridgeError("not_found", 404)
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
                return isCRC(row) && row.isTest !== true && row.templateType === templateType(request.ceremonyType)
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
                eventDate: parseEventDate(`${request.localDate}T${request.ceremonyType === "morning" ? "10:00" : "16:00"}`, "crc"), templateType: key,
                date: stamp, updatedAt: stamp, version: 1, lastModifiedAt: new Date().toISOString(),
                ownerId: "beit-mitzvah-service", ownerName: "Beit Mitzvah", hydrated: true, isTest: false,
                trackCount: rows.length, songCount: rows.filter(row => row.type === "song").length,
                book,
            }))
            for (const row of rows) tx.create(db.collection("tracks").doc(String(row.id)), { ...row, setlistId })
        }
        const reviewRequired = !!selected && (dateOf(selected.eventDate) !== request.localDate || selected.templateType !== templateType(request.ceremonyType))
        tx.create(ceremonyRef, { orgId: "crc", ceremonyId: request.ceremonyId, setlistId, localDate: request.localDate, ceremonyType: request.ceremonyType,
            scheduleRevision, requestedLocalDate: request.localDate, requestedCeremonyType: request.ceremonyType, reviewRequired })
        if (!claim || !request.explicitSetlistId) tx.set(claimRef, { orgId: "crc", setlistId })
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
    if (intent) {
        if (!isCRC(intent)) throw new BridgeError("not_found", 404)
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
        operatorLinks: { music: `https://centralreform.live/perform/setlist/${source.link.setlistId}`,
            review: `https://centralreform.live/integrations/beit-mitzvah?ceremonyId=${ceremonyId}` },
    }
    return { version: 1, status: approved ? "linked" : "review_required", setlistId: projection.setlistId, sourceRevision: source.sourceRevision, projection }
}
