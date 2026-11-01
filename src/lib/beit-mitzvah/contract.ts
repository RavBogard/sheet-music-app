import { z } from "zod"

export const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const ceremonyId = z.uuid()
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
})
/** A reading's reference name, e.g. "Genesis 1:1–2:3". No Hebrew, no verse text. */
export const referenceName = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9 .,:;'’()–—-]+$/)
export type DetailsRequest = Extract<BridgeRequest, { operation: "details" }>
const base = { version: z.literal(1), orgId: z.literal("crc"), ceremonyId }
export const bridgeRequest = z.discriminatedUnion("operation", [
    z.object({ ...base, operation: z.literal("ensure"), localDate,
        ceremonyType: z.enum(["morning", "havdalah"]),
        idempotencyKey: z.string().trim().min(1).max(128),
        scheduleRevision: z.number().int().min(1).max(2147483647).optional(),
        explicitSetlistId: opaqueId.optional(), excludedSetlistId: opaqueId.optional(),
        displayName: z.string().trim().min(1).max(160).optional(),
    }).strict(),
    z.object({ ...base, operation: z.literal("projection") }).strict(),
    // BET-6: what the setlist's read-only ceremony card shows. Names and
    // reference NAMES only ("Genesis 1:1–2:3"), never verse text: a reference
    // is Latin letters, digits and punctuation, so text cannot ride along.
    z.object({ ...base, operation: z.literal("details"),
        students: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
        slot: z.string().trim().min(1).max(80).optional(),
        torahRef: referenceName.optional(),
        haftarahRef: referenceName.optional(),
        rehearsals: z.array(localDate).max(12).optional(),
    }).strict(),
    z.object({ ...base, operation: z.literal("resource"), rowId: opaqueId, resourceId: opaqueId }).strict(),
])
export type BridgeRequest = z.infer<typeof bridgeRequest>
export type EnsureRequest = Extract<BridgeRequest, { operation: "ensure" }>
export const sharedRow = z.object({
    rowId: opaqueId, order: z.number().int().min(0).max(499), title: z.string().max(200),
    prayerId: z.string().max(200).optional(), momentId: z.string().max(200).optional(), catalogUnitId: z.string().max(200).optional(),
    biblicalRef: z.string().max(200).optional(), edition: z.string().max(200).optional(),
    textIdentity: z.string().max(200).optional(),
    sharedDirections: z.string().max(2000).optional(),
    liturgyRef: z.object({ book: z.string().max(100), folio: z.number().int().positive(), unitId: z.string().max(200).optional(), serviceViewId: z.string().max(200).optional() }).strict().optional(),
    arrangement: z.object({ songId: opaqueId.optional(), fileId: opaqueId.optional(), key: z.string().max(30).optional() }).strict().optional(),
    resources: z.array(z.object({ resourceId: opaqueId, kind: z.enum(["score", "audio"]), label: z.string().min(1).max(100) }).strict()).max(4),
}).strict()
export type SharedRow = z.infer<typeof sharedRow>
export interface Projection {
    setlistId: string
    sourceRevision: string
    localDate: string
    ceremonyType: "morning" | "havdalah"
    rows: SharedRow[]
    operatorLinks: { music: string; review: string }
}
export interface BridgeResponse {
    version: 1
    status: "linked" | "ambiguous" | "review_required"
    setlistId?: string
    sourceRevision?: string
    candidates?: { setlistId: string }[]
    projection?: Projection
}
export const reviewRequest = z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("inspect"), ceremonyId }).strict(),
    z.object({ operation: z.literal("revoke"), ceremonyId }).strict(),
    z.object({ operation: z.literal("confirm_schedule"), ceremonyId,
        expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict(),
    z.object({ operation: z.literal("approve"), ceremonyId,
        expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
        rowIds: z.array(opaqueId).max(200),
        sharedDirections: z.record(opaqueId, z.string().max(2000)).default({}),
        // A resource needs an individual rights basis; catalog presence is not permission.
        resources: z.array(z.object({ rowId: opaqueId, resourceId: opaqueId,
            kind: z.enum(["score", "audio"]), label: z.string().min(1).max(100),
            fileId: opaqueId, rightsBasis: z.string().trim().min(12).max(1000),
        }).strict()).max(100),
    }).strict(),
])
