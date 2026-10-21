// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID, createHash } from "node:crypto"
import { initializeApp, getApps } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { type EnsureRequest } from "./contract"
import { collections, ensureService, linkId, projection, readSource } from "./service"
import { parseEventDate } from "@/lib/parse-event-date"
import { fetchResource, manageReview, resourceURL } from "./resources"
import { verifyTicket } from "./access"

const bytes = Buffer.from("%PDF-test-only-synthetic")
const sha = createHash("sha256").update(bytes).digest("hex")
vi.mock("@/lib/firebase-admin", async importOriginal => ({
    ...await importOriginal<typeof import("@/lib/firebase-admin")>(),
    getStorage: () => ({ bucket: () => ({ file: () => ({ getMetadata: async () => [{ size: bytes.length, contentType: "application/pdf", generation: "123" }] }) }) }),
}))
vi.mock("@/lib/firebase-storage", () => ({ downloadExactStorageGeneration: vi.fn(async () => ({ success: true, data: { buffer: bytes, contentType: "application/pdf", generation: "123", sizeBytes: bytes.length } })) }))

const projectId = "demo-beit-mitzvah-bridge"
let db: FirebaseFirestore.Firestore
const make = (overrides: Partial<EnsureRequest> = {}): EnsureRequest => ({ version: 1, operation: "ensure", orgId: "crc", ceremonyId: randomUUID(), localDate: "2099-02-14", ceremonyType: "morning", idempotencyKey: randomUUID(), ...overrides })
beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("An isolated Firestore emulator is required")
    const app = getApps().find(app => app.name === projectId) ?? initializeApp({ projectId }, projectId)
    db = getFirestore(app)
    vi.stubEnv("BEIT_MITZVAH_SERVICE_TOKEN", "test-only-service-credential-1234567890123456789")
    vi.stubEnv("BEIT_MITZVAH_SERVICE_ORG_ID", "crc")
})
beforeEach(async () => {
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" })
    expect(response.ok).toBe(true)
    await db.collection("templates").doc("bnei_mitzvah_saturday").set({ orgId: "crc", slots: [
        { label: "Synthetic opening", type: "header", queries: [] },
        { label: "Synthetic practice", type: "song", queries: ["never-select-this-melody"], fileId: "approved-source-file" },
    ] })
})
async function existing(id: string, orgId = "crc") {
    await db.collection("setlists").doc(id).set({ id, orgId, name: "Synthetic source service", eventDate: parseEventDate("2099-02-14T10:00", "crc"), templateType: "bnei_mitzvah_saturday", isTest: false })
}
async function sourceRow(setlistId: string, id = "source-row") {
    await db.collection("tracks").doc(id).set({ orgId: "crc", setlistId, order: 0, title: "Synthetic source row", type: "song", fileId: "source-file",
        notes: "Private performance notes must never be projected", honors: "Private name", referenceLink: "https://private.example.test", momentId: "source-moment-not-portal-unit", catalogUnitId: "verified-portal-unit", liturgyRef: { book: "crc-test", folio: 1, unitId: "reader-unit-not-portal-unit", serviceViewId: "verified-view" } })
}
async function approve(request: EnsureRequest, resource = false) {
    const source = await readSource(db, request.ceremonyId)
    return manageReview(db, "source-editor", { operation: "approve", ceremonyId: request.ceremonyId, expectedSourceRevision: source.sourceRevision,
        rowIds: source.rows.map(row => String(row.id)), sharedDirections: { "source-row": "Share only this deliberate direction" },
        resources: resource ? [{ rowId: "source-row", resourceId: "score-grant", kind: "score", label: "Score", fileId: "source-file", rightsBasis: "Synthetic test license for assigned family" }] : [],
    })
}
describe("transactional ceremony setup", () => {
    it("creates configured native rows once across concurrent joint ceremonies and retries", async () => {
        const request = make()
        const results = await Promise.all([ensureService(db, request), ensureService(db, request), ...Array.from({ length: 4 }, () => ensureService(db, make()))])
        expect(new Set(results.map(result => result.setlistId)).size).toBe(1)
        expect((await db.collection("setlists").get()).size).toBe(1)
        const rows = await db.collection("tracks").get()
        expect(rows.size).toBe(2)
        const data = (await db.collection("setlists").doc(results[0].setlistId!).get()).data()!
        expect(data.name).not.toContain(request.ceremonyId)
        expect((data.eventDate as Timestamp).toMillis()).toBe(parseEventDate("2099-02-14T10:00", "crc").toMillis())
        expect(rows.docs.map(doc => doc.data().fileId).filter(Boolean)).toEqual(["approved-source-file"])
        expect((await db.collection(collections.reviews).get()).empty).toBe(true)
        expect((await projection(db, request.ceremonyId)).projection?.rows).toEqual([])
        await expect(ensureService(db, { ...request, localDate: "2099-02-21" })).rejects.toThrow("idempotency_conflict")
    })
    it("reuses only the unique matching CRC source and rejects cross-tenant explicit links", async () => {
        await existing("crc-source"); await existing("bl-source", "brotherslazaroff")
        expect((await ensureService(db, make())).setlistId).toBe("crc-source")
        await expect(ensureService(db, make({ explicitSetlistId: "bl-source" }))).rejects.toThrow("not_found")
        expect((await db.collection("setlists").get()).size).toBe(2)
    })
    it("refuses ambiguous matches without creating a service or ceremony link", async () => {
        await existing("crc-first"); await existing("crc-second")
        const result = await ensureService(db, make())
        expect(result.status).toBe("ambiguous")
        expect(result.candidates).toHaveLength(2)
        expect((await db.collection(collections.links).get()).empty).toBe(true)
        expect((await db.collection("setlists").get()).size).toBe(2)
    })
    it("rechecks source ambiguity after a claim exists and honors an explicit staff selection", async () => {
        await existing("crc-first")
        await ensureService(db, make())
        await existing("crc-second")
        expect((await ensureService(db, make())).status).toBe("ambiguous")
        expect((await ensureService(db, make({ explicitSetlistId: "crc-second" }))).setlistId).toBe("crc-second")
    })
    it("preserves the linked service on reschedule and reconciles only after source correction", async () => {
        const original = make()
        const first = await ensureService(db, original)
        const rescheduled = { ...original, idempotencyKey: randomUUID(), localDate: "2099-02-21", scheduleRevision: 2 }
        const result = await ensureService(db, rescheduled)
        expect(result).toMatchObject({ setlistId: first.setlistId, status: "review_required" })
        let source = await readSource(db, original.ceremonyId)
        await expect(manageReview(db, "source-editor", { operation: "confirm_schedule", ceremonyId: original.ceremonyId, expectedSourceRevision: source.sourceRevision })).rejects.toThrow("source_schedule_mismatch")
        await db.collection("setlists").doc(first.setlistId!).update({ eventDate: parseEventDate("2099-02-21T10:00", "crc") })
        source = await readSource(db, original.ceremonyId)
        await manageReview(db, "source-editor", { operation: "confirm_schedule", ceremonyId: original.ceremonyId, expectedSourceRevision: source.sourceRevision })
        await ensureService(db, original) // delayed original import replay must not undo the confirmed schedule
        const link = (await db.collection(collections.links).doc(linkId(original.ceremonyId)).get()).data()!
        expect(link).toMatchObject({ localDate: "2099-02-21", reviewRequired: false })
        expect((await db.collection("setlists").get()).size).toBe(1)
    })
    it("fences an unprocessed older schedule intent, including after the newer operation fails", async () => {
        const request = make({ scheduleRevision: 1 })
        const linked = await ensureService(db, request)
        const latest = { ...request, localDate: "2099-02-28", scheduleRevision: 3, idempotencyKey: randomUUID(), explicitSetlistId: "missing-source" }
        await expect(ensureService(db, latest)).rejects.toThrow("link_conflict")
        const older = { ...request, localDate: "2099-02-21", scheduleRevision: 2, idempotencyKey: randomUUID() }
        await expect(ensureService(db, older)).rejects.toThrow("stale_schedule_revision")
        const source = await readSource(db, request.ceremonyId)
        expect(source.link).toMatchObject({ requestedLocalDate: "2099-02-28", scheduleRevision: 3, setlistId: linked.setlistId, reviewRequired: true })
        await ensureService(db, request) // completed old receipt remains a harmless replay
        expect((await readSource(db, request.ceremonyId)).link.requestedLocalDate).toBe("2099-02-28")
        expect((await db.collection("setlists").get()).size).toBe(1)
    })
    it("keeps duplicate revision intents safe and rejects conflicting schedules at the same revision", async () => {
        const request = make({ scheduleRevision: 1 })
        const first = await ensureService(db, request)
        const duplicate = await ensureService(db, { ...request, idempotencyKey: randomUUID() })
        expect(duplicate.setlistId).toBe(first.setlistId)
        await expect(ensureService(db, { ...request, localDate: "2099-02-21", idempotencyKey: randomUUID() })).rejects.toThrow("schedule_revision_conflict")
        expect((await readSource(db, request.ceremonyId)).link.requestedLocalDate).toBe(request.localDate)
        expect((await db.collection("setlists").get()).size).toBe(1)
    })
    it("does not create an old queued service after a newer initial setup fails", async () => {
        const newest = make({ scheduleRevision: 5, explicitSetlistId: "missing-source" })
        await expect(ensureService(db, newest)).rejects.toThrow("not_found")
        await expect(ensureService(db, { ...newest, explicitSetlistId: undefined, scheduleRevision: 4, localDate: "2099-02-07", idempotencyKey: randomUUID() })).rejects.toThrow("stale_schedule_revision")
        expect((await db.collection("setlists").get()).size).toBe(0)
        expect((await db.collection(collections.links).get()).size).toBe(0)
    })
})
describe("explicit staff splits", () => {
    it.each([
        { split: "moving member", splitDate: "2099-02-21", sourceDate: "2099-02-14", sourceType: "bnei_mitzvah_saturday" },
        { split: "staying member", splitDate: "2099-02-14", sourceDate: "2099-02-14", sourceType: "bnei_mitzvah_saturday" },
        { split: "moving member after source moved", splitDate: "2099-02-21", sourceDate: "2099-02-21", sourceType: "bnei_mitzvah_saturday" },
        { split: "staying member after source moved date and type", splitDate: "2099-02-14", sourceDate: "2099-02-21", sourceType: "havdalah_bnei_mitzvah" },
        { split: "moving member after source moved to Havdalah", splitDate: "2099-02-21", splitType: "havdalah" as const, sourceDate: "2099-02-21", sourceType: "havdalah_bnei_mitzvah" },
    ])("never reattaches $split to the excluded original", async ({ splitDate, splitType, sourceDate, sourceType }) => {
        const joint = make()
        const original = (await ensureService(db, joint)).setlistId!
        await db.collection("setlists").doc(original).update({ eventDate: parseEventDate(`${sourceDate}T${sourceType === "havdalah_bnei_mitzvah" ? "16:00" : "10:00"}`, "crc"), templateType: sourceType })
        const before = (await db.collection("setlists").doc(original).get()).data()
        const split = make({ localDate: splitDate, ceremonyType: splitType ?? "morning", excludedSetlistId: original, scheduleRevision: 1 })
        const separate = await ensureService(db, split)
        expect(separate.setlistId).toBeTruthy()
        expect(separate.setlistId).not.toBe(original)
        expect((await db.collection("setlists").doc(original).get()).data()).toEqual(before)
        expect((await db.collection(collections.links).doc(linkId(joint.ceremonyId)).get()).data()?.setlistId).toBe(original)
        expect((await db.collection(collections.links).doc(linkId(split.ceremonyId)).get()).data()?.excludedSetlistId).toBe(original)
        expect((await ensureService(db, split)).setlistId).toBe(separate.setlistId)
        expect((await db.collection("setlists").get()).size).toBe(2)
    })
    it("serializes split retries and reuses only the other unique source while ordinary matching detects ambiguity", async () => {
        const original = (await ensureService(db, make())).setlistId!
        const split = make({ excludedSetlistId: original })
        const results = await Promise.all([
            ensureService(db, split), ensureService(db, split),
            ensureService(db, { ...split, idempotencyKey: randomUUID() }),
        ])
        const distinct = results[0].setlistId!
        expect(new Set(results.map(result => result.setlistId))).toEqual(new Set([distinct]))
        expect(distinct).not.toBe(original)
        expect((await ensureService(db, make({ excludedSetlistId: original }))).setlistId).toBe(distinct)
        const ordinary = await ensureService(db, make())
        expect(ordinary.status).toBe("ambiguous")
        expect(ordinary.candidates?.map(candidate => candidate.setlistId).sort()).toEqual([original, distinct].sort())
        const claims = await db.collection(collections.claims).get()
        expect(claims.size).toBe(1)
        expect(claims.docs[0].data().setlistId).toBe(original)
        await expect(ensureService(db, { ...split, excludedSetlistId: undefined, scheduleRevision: 2, idempotencyKey: randomUUID() })).rejects.toThrow("excluded_setlist_conflict")
        await expect(ensureService(db, { ...split, excludedSetlistId: distinct })).rejects.toThrow("idempotency_conflict")
        expect((await db.collection("setlists").get()).size).toBe(2)
    })
    it("refuses foreign exclusions and explicit/replayed original links without changing the retained original ceremony", async () => {
        await existing("foreign-excluded", "brotherslazaroff")
        await expect(ensureService(db, make({ excludedSetlistId: "foreign-excluded" }))).rejects.toThrow("not_found")
        const request = make()
        const original = (await ensureService(db, request)).setlistId!
        await expect(ensureService(db, make({ excludedSetlistId: original, explicitSetlistId: original }))).rejects.toThrow("excluded_setlist_conflict")
        await expect(ensureService(db, { ...request, excludedSetlistId: original })).rejects.toThrow("idempotency_conflict")
        await expect(ensureService(db, { ...request, excludedSetlistId: original, scheduleRevision: 2, idempotencyKey: randomUUID() })).rejects.toThrow("excluded_setlist_conflict")
        expect((await ensureService(db, request)).setlistId).toBe(original)
        expect((await projection(db, request.ceremonyId)).setlistId).toBe(original)
    })
    it("can reconcile a distinct split source onto the original date without taking over the original claim", async () => {
        const original = (await ensureService(db, make())).setlistId!
        const split = make({ localDate: "2099-02-21", excludedSetlistId: original, scheduleRevision: 1 })
        const distinct = (await ensureService(db, split)).setlistId!
        await ensureService(db, { ...split, localDate: "2099-02-14", scheduleRevision: 2, explicitSetlistId: distinct, idempotencyKey: randomUUID() })
        await db.collection("setlists").doc(distinct).update({ eventDate: parseEventDate("2099-02-14T10:00", "crc") })
        const source = await readSource(db, split.ceremonyId)
        await manageReview(db, "source-editor", { operation: "confirm_schedule", ceremonyId: split.ceremonyId, expectedSourceRevision: source.sourceRevision })
        expect((await readSource(db, split.ceremonyId)).link).toMatchObject({ setlistId: distinct, localDate: "2099-02-14", reviewRequired: false })
        expect((await db.collection("setlists").doc(original).get()).data()?.eventDate.toMillis()).toBe(parseEventDate("2099-02-14T10:00", "crc").toMillis())
        expect((await ensureService(db, make())).status).toBe("ambiguous")
    })
})
describe("reviewed projections and revocable resources", () => {
    it("shares only curated rows/directions, retains order edits, and withdraws changed identities", async () => {
        await existing("crc-source"); await sourceRow("crc-source")
        const request = make({ explicitSetlistId: "crc-source" })
        await ensureService(db, request); await approve(request)
        const first = await projection(db, request.ceremonyId)
        expect(first.status).toBe("linked")
        expect(first.projection?.rows[0]).toMatchObject({ rowId: "source-row", sharedDirections: "Share only this deliberate direction", catalogUnitId: "verified-portal-unit" })
        expect(first.projection?.rows[0].momentId).toBe("source-moment-not-portal-unit")
        expect(first.projection?.rows[0].catalogUnitId).not.toBe(first.projection?.rows[0].momentId)
        expect(JSON.stringify(first)).not.toMatch(/Private|referenceLink|honors|notes/)
        await db.collection("tracks").doc("source-row").update({ order: 8, notes: "Changed private notes" })
        expect((await projection(db, request.ceremonyId)).projection?.rows[0].order).toBe(8)
        await db.collection("tracks").doc("source-row").update({ fileId: "changed-arrangement" })
        expect((await projection(db, request.ceremonyId)).projection?.rows).toEqual([])
        expect((await projection(db, request.ceremonyId)).status).toBe("review_required")
    })
    it("requires explicit rights grants and blocks an issued resource ticket immediately after revoke", async () => {
        await existing("crc-source"); await sourceRow("crc-source")
        await db.collection("library_index").doc("source-file").set({ orgId: "crc", status: "active", mimeType: "application/pdf", fileSize: bytes.length, contentHash: { alg: "sha256", value: sha, sizeBytes: bytes.length } })
        const request = make({ explicitSetlistId: "crc-source" })
        await ensureService(db, request); await approve(request)
        await expect(resourceURL(db, request.ceremonyId, "source-row", "score-grant")).rejects.toThrow("not_found")
        await approve(request, true)
        const resource = await resourceURL(db, request.ceremonyId, "source-row", "score-grant")
        const ticket = verifyTicket(new URL(resource.resource.url).searchParams.get("ticket")!)
        expect((await fetchResource(db, ticket)).buffer).toEqual(bytes)
        await manageReview(db, "source-editor", { operation: "revoke", ceremonyId: request.ceremonyId })
        expect((await projection(db, request.ceremonyId)).projection?.rows).toEqual([])
        await expect(fetchResource(db, ticket)).rejects.toThrow("not_found")
        expect((await db.collection("library_index").doc("source-file").get()).data()).not.toHaveProperty("publicReaderStatus")
    })
    it("rejects mixed-tenant tracks and source resources from another catalog tenant", async () => {
        await existing("crc-source"); await sourceRow("crc-source")
        const request = make({ explicitSetlistId: "crc-source" })
        await ensureService(db, request)
        await db.collection("library_index").doc("source-file").set({ orgId: "brotherslazaroff", status: "active" })
        await expect(approve(request, true)).rejects.toThrow("resource_unavailable")
        await db.collection("tracks").doc("source-row").update({ orgId: "brotherslazaroff" })
        await expect(projection(db, request.ceremonyId)).rejects.toThrow("source_requires_staff_review")
    })
})
