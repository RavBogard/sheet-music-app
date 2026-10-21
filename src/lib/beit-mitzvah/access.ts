import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { getAuth, getFirestore, initAdmin } from "@/lib/firebase-admin"
import { readTenantRole } from "@/lib/org/access"
import { hasViewAsCookie } from "@/lib/org/view-as"
import { BridgeError } from "./service"

export function credential(): string {
    const token = process.env.BEIT_MITZVAH_SERVICE_TOKEN
    if (process.env.BEIT_MITZVAH_SERVICE_ORG_ID !== "crc" || !token || token.length < 32 || token.length > 512 || /\s/.test(token)) {
        throw new BridgeError("integration_unconfigured", 503)
    }
    return token
}
function same(a: string, b: string): boolean {
    return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())
}
export function authorizeService(request: Request): void {
    const secret = credential()
    if (request.headers.get("x-org-id") !== "crc") throw new BridgeError("not_found", 404)
    const auth = request.headers.get("authorization") ?? ""
    const token = /^Bearer ([^\s]+)$/.exec(auth)?.[1] ?? ""
    if (!same(token, secret)) throw new BridgeError("unauthorized", 401)
}
export async function authorizeEditor(request: Request): Promise<string> {
    credential()
    if (request.headers.get("x-org-id") !== "crc") throw new BridgeError("not_found", 404)
    if (hasViewAsCookie(request.headers.get("cookie"))) throw new BridgeError("read_only_view", 403)
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
    if (!token || !initAdmin()) throw new BridgeError("unauthorized", 401)
    let uid: string
    try { uid = (await getAuth().verifyIdToken(token, true)).uid } catch { throw new BridgeError("unauthorized", 401) }
    // Fresh source membership; no claims fallback on read failure, no portal roles.
    const role = await readTenantRole(getFirestore(), uid, "crc")
    if (role !== "admin" && role !== "band_leader") throw new BridgeError("forbidden", 403)
    return uid
}
export function signTicket(payload: object): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const sig = createHmac("sha256", credential()).update(`beit-mitzvah-resource-v1.${encoded}`).digest("base64url")
    return `${encoded}.${sig}`
}
export function verifyTicket(raw: string): Record<string, unknown> {
    if (raw.length > 2048) throw new BridgeError("not_found", 404)
    const parts = raw.split(".")
    if (parts.length !== 2) throw new BridgeError("not_found", 404)
    const expected = createHmac("sha256", credential()).update(`beit-mitzvah-resource-v1.${parts[0]}`).digest("base64url")
    if (!same(parts[1], expected)) throw new BridgeError("not_found", 404)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) } catch { throw new BridgeError("not_found", 404) }
    if (typeof payload.expires !== "number" || payload.expires <= Date.now() || payload.expires > Date.now() + 60_000) throw new BridgeError("not_found", 404)
    return payload
}
export async function boundedJSON(request: Request): Promise<unknown> {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new BridgeError("invalid_request", 400)
    if (Number(request.headers.get("content-length")) > 64 * 1024) throw new BridgeError("payload_too_large", 413)
    if (!request.body) throw new BridgeError("invalid_request", 400)
    const reader = request.body.getReader()
    let total = 0
    const chunks: Uint8Array[] = []
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 64 * 1024) { await reader.cancel(); throw new BridgeError("payload_too_large", 413) }
        chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new BridgeError("invalid_request", 400) }
}
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }
export function errorResponse(error: unknown): Response {
    const known = error instanceof BridgeError
    return Response.json({ version: 1, error: known ? error.code : "service_unavailable" }, { status: known ? error.status : 503, headers: privateHeaders })
}
