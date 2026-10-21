import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import { createHash, randomUUID } from "node:crypto"
import { getStorage } from "@/lib/firebase-admin"
import { downloadExactStorageGeneration } from "@/lib/firebase-storage"
import { reviewRequest, type SharedRow } from "./contract"
import { z } from "zod"
import { BridgeError, collections, dateOf, hash, linkId, projection, readSource, semanticRevision, shareableRows, sourceNeedsReview, templateType } from "./service"
import { signTicket } from "./access"

type ResourceInput = Extract<z.infer<typeof reviewRequest>, { operation: "approve" }>["resources"][number]
interface Grant extends ResourceInput {
    path: string; generation: string; contentType: string; sizeBytes: number; sha256: string
}
const MAX_BYTES = 4 * 1024 * 1024
async function catalog(db: Firestore, fileId: string) {
    const row = (await db.collection("library_index").doc(fileId).get()).data()
    if (row?.orgId !== "crc" || row.status !== "active") throw new BridgeError("resource_unavailable", 404)
    return row
}
async function manifest(db: Firestore, input: ResourceInput): Promise<Grant> {
    const row = await catalog(db, input.fileId)
    const mime = typeof row.mimeType === "string" ? row.mimeType.split(";")[0].trim().toLowerCase() : ""
    if (input.kind === "score" ? mime !== "application/pdf" : mime !== "audio/mpeg") throw new BridgeError("resource_unavailable", 404)
    const contentHash = row.contentHash as { alg?: string; value?: string; sizeBytes?: number } | undefined
    if (contentHash?.alg !== "sha256" || !/^[a-f0-9]{64}$/i.test(contentHash.value ?? "") || !Number.isSafeInteger(contentHash.sizeBytes) || contentHash.sizeBytes! <= 0 || contentHash.sizeBytes! > MAX_BYTES || Number(row.fileSize) !== contentHash.sizeBytes) throw new BridgeError("resource_manifest_required")
    // Existing source storage convention, exact file ID only; no URL/Drive fallback.
    const path = `library/${input.fileId}${input.kind === "score" ? ".pdf" : ".mp3"}`
    const [metadata] = await getStorage().bucket().file(path).getMetadata()
    if (Number(metadata.size) !== contentHash.sizeBytes || metadata.contentType?.split(";")[0].toLowerCase() !== mime || !/^[1-9][0-9]*$/.test(String(metadata.generation))) throw new BridgeError("resource_manifest_required")
    return { ...input, path, contentType: mime, sizeBytes: contentHash.sizeBytes!, sha256: contentHash.value!.toLowerCase(), generation: String(metadata.generation) }
}
export async function manageReview(db: Firestore, uid: string, request: z.infer<typeof reviewRequest>) {
    const ref = db.collection(collections.reviews).doc(linkId(request.ceremonyId))
    if (request.operation === "revoke") {
        await db.runTransaction(async tx => {
            await readSource(db, request.ceremonyId, tx)
            tx.set(ref, { orgId: "crc", status: "revoked", reviewedBy: uid, reviewedAt: new Date().toISOString(), approvalId: randomUUID() })
        })
        return { version: 1, status: "revoked" }
    }
    const source = await readSource(db, request.ceremonyId)
    if (request.operation === "confirm_schedule") {
        await db.runTransaction(async tx => {
            const current = await readSource(db, request.ceremonyId, tx)
            if (current.sourceRevision !== request.expectedSourceRevision) throw new BridgeError("stale_source")
            const date = String(current.link.requestedLocalDate ?? current.link.localDate)
            const type = String(current.link.requestedCeremonyType ?? current.link.ceremonyType)
            if (dateOf(current.setlist.eventDate) !== date || current.setlist.templateType !== templateType(type)) throw new BridgeError("source_schedule_mismatch")
            const previousClaim = db.collection(collections.claims).doc(hash(["crc", current.link.localDate, current.link.ceremonyType]))
            const nextClaim = db.collection(collections.claims).doc(hash(["crc", date, type]))
            const old = (await tx.get(previousClaim)).data()
            const next = (await tx.get(nextClaim)).data()
            if (next && (next.orgId !== "crc" || next.setlistId !== current.link.setlistId)) throw new BridgeError("link_conflict")
            if (previousClaim.path !== nextClaim.path && old?.orgId === "crc" && old.setlistId === current.link.setlistId) tx.delete(previousClaim)
            tx.set(nextClaim, { orgId: "crc", setlistId: current.link.setlistId })
            tx.update(db.collection(collections.links).doc(linkId(request.ceremonyId)), {
                localDate: date, ceremonyType: type, requestedLocalDate: date, requestedCeremonyType: type,
                reviewRequired: false, scheduleConfirmedBy: uid, scheduleConfirmedAt: new Date().toISOString(),
            })
        })
        return projection(db, request.ceremonyId)
    }
    if (request.operation === "inspect") {
        const current = (await ref.get()).data()
        return { version: 1, setlistId: source.link.setlistId, sourceRevision: source.sourceRevision,
            reviewRequired: sourceNeedsReview(source), requestedLocalDate: source.link.requestedLocalDate ?? source.link.localDate,
            requestedCeremonyType: source.link.requestedCeremonyType ?? source.link.ceremonyType,
            rows: shareableRows(source).map(row => ({ ...row,
                audioFileId: source.rows.find(item => item.id === row.rowId)?.audioFileId ?? null,
                sharedDirections: (current?.rows as SharedRow[] | undefined)?.find(item => item.rowId === row.rowId)?.sharedDirections ?? "",
            })), status: current?.status ?? "unreviewed" }
    }
    if (source.sourceRevision !== request.expectedSourceRevision) throw new BridgeError("stale_source")
    if (sourceNeedsReview(source)) throw new BridgeError("schedule_requires_staff_review")
    const selected = new Set(request.rowIds)
    const rows = shareableRows(source).filter(row => selected.has(row.rowId))
    if (rows.length !== selected.size || Object.keys(request.sharedDirections).some(id => !selected.has(id))) throw new BridgeError("invalid_rows", 400)
    const seen = new Set<string>()
    const grants: Grant[] = []
    for (const input of request.resources) {
        const raw = source.rows.find(row => row.id === input.rowId)
        if (!selected.has(input.rowId) || !raw || raw[input.kind === "score" ? "fileId" : "audioFileId"] !== input.fileId || seen.has(input.resourceId)) throw new BridgeError("invalid_resource", 400)
        seen.add(input.resourceId)
        grants.push(await manifest(db, input))
    }
    for (const row of rows) {
        row.resources = grants.filter(grant => grant.rowId === row.rowId).map(({ resourceId, kind, label }) => ({ resourceId, kind, label }))
        if (request.sharedDirections[row.rowId]) row.sharedDirections = request.sharedDirections[row.rowId]
    }
    await db.runTransaction(async tx => {
        const current = await readSource(db, request.ceremonyId, tx)
        if (current.sourceRevision !== request.expectedSourceRevision || sourceNeedsReview(current)) throw new BridgeError("stale_source")
        tx.set(ref, { orgId: "crc", status: "approved", sourceRevision: current.sourceRevision, semanticRevision: semanticRevision(current),
            rows, grants, approvalId: randomUUID(), reviewedBy: uid, reviewedAt: new Date().toISOString() })
    })
    return projection(db, request.ceremonyId)
}
async function resolveGrant(db: Firestore, ceremonyId: string, rowId: string, resourceId: string) {
    const view = await projection(db, ceremonyId)
    if (view.status !== "linked" || !view.projection?.rows.some(row => row.rowId === rowId && row.resources.some(resource => resource.resourceId === resourceId))) throw new BridgeError("not_found", 404)
    const review = (await db.collection(collections.reviews).doc(linkId(ceremonyId)).get()).data()
    const source = await readSource(db, ceremonyId)
    if (review?.orgId !== "crc" || review.status !== "approved" || review.semanticRevision !== semanticRevision(source) || sourceNeedsReview(source)) throw new BridgeError("not_found", 404)
    const grant = (review.grants as Grant[]).find(item => item.rowId === rowId && item.resourceId === resourceId)
    const raw = source.rows.find(item => item.id === rowId)
    if (!grant || raw?.[grant.kind === "score" ? "fileId" : "audioFileId"] !== grant.fileId) throw new BridgeError("not_found", 404)
    const file = await catalog(db, grant.fileId)
    const digest = file.contentHash as { value?: string; alg?: string; sizeBytes?: number } | undefined
    if (digest?.alg !== "sha256" || digest.value?.toLowerCase() !== grant.sha256 || digest.sizeBytes !== grant.sizeBytes || Number(file.fileSize) !== grant.sizeBytes || file.mimeType !== grant.contentType) throw new BridgeError("not_found", 404)
    return { grant, approvalId: String(review.approvalId) }
}
export async function resourceURL(db: Firestore, ceremonyId: string, rowId: string, resourceId: string) {
    const { grant, approvalId } = await resolveGrant(db, ceremonyId, rowId, resourceId)
    const expires = Date.now() + 60_000
    const ticket = signTicket({ ceremonyId, rowId, resourceId, approvalId, expires })
    return { version: 1, resource: { resourceId, kind: grant.kind, expiresAt: new Date(expires).toISOString(),
        url: `https://centralreform.live/api/integrations/beit-mitzvah/v1/resource?ticket=${ticket}` } }
}
export async function fetchResource(db: Firestore, ticket: Record<string, unknown>) {
    const { ceremonyId, rowId, resourceId, approvalId } = ticket
    if (![ceremonyId, rowId, resourceId, approvalId].every(item => typeof item === "string")) throw new BridgeError("not_found", 404)
    const before = await resolveGrant(db, String(ceremonyId), String(rowId), String(resourceId))
    if (before.approvalId !== approvalId) throw new BridgeError("not_found", 404)
    const { grant } = before
    const data = await downloadExactStorageGeneration({ path: grant.path, generation: grant.generation, contentType: grant.contentType, expectedSizeBytes: grant.sizeBytes, maxBytes: MAX_BYTES })
    if (!data.success || createHash("sha256").update(data.data.buffer).digest("hex") !== grant.sha256 || (grant.kind === "score" && data.data.buffer.subarray(0, 5).toString("ascii") !== "%PDF-")) throw new BridgeError("not_found", 404)
    const after = await resolveGrant(db, String(ceremonyId), String(rowId), String(resourceId))
    if (after.approvalId !== approvalId) throw new BridgeError("not_found", 404)
    return data.data
}
