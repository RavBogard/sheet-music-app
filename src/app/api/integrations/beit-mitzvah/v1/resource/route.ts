import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { credential, verifyTicket, errorResponse, privateHeaders } from "@/lib/beit-mitzvah/access"
import { BridgeError } from "@/lib/beit-mitzvah/service"
import { fetchResource } from "@/lib/beit-mitzvah/resources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request): Promise<Response> {
    try {
        credential()
        if (request.headers.get("x-org-id") !== "crc" || request.headers.has("range")) throw new BridgeError("not_found", 404)
        const params = new URL(request.url).searchParams
        if (params.size !== 1 || params.getAll("ticket").length !== 1) throw new BridgeError("not_found", 404)
        const ticket = verifyTicket(params.get("ticket") ?? "")
        if (!initAdmin()) throw new BridgeError("service_unavailable", 503)
        const data = await fetchResource(getFirestore(), ticket)
        return new Response(new Uint8Array(data.buffer), { headers: { ...privateHeaders,
            "Content-Type": data.contentType, "Content-Length": String(data.buffer.byteLength),
            "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox",
        } })
    } catch (error) { return errorResponse(error) }
}
