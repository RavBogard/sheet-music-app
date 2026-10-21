import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { bridgeRequest } from "@/lib/beit-mitzvah/contract"
import { authorizeService, boundedJSON, errorResponse, privateHeaders } from "@/lib/beit-mitzvah/access"
import { BridgeError, ensureService, projection } from "@/lib/beit-mitzvah/service"
import { resourceURL } from "@/lib/beit-mitzvah/resources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request): Promise<Response> {
    try {
        authorizeService(request)
        const parsed = bridgeRequest.safeParse(await boundedJSON(request))
        if (!parsed.success) throw new BridgeError("invalid_request", 400)
        if (!initAdmin()) throw new BridgeError("service_unavailable", 503)
        const db = getFirestore()
        const body = parsed.data
        if (body.operation === "resource") return Response.json(await resourceURL(db, body.ceremonyId, body.rowId, body.resourceId), { headers: privateHeaders })
        if (body.operation === "ensure") {
            const ensured = await ensureService(db, body)
            if (ensured.status === "ambiguous") return Response.json(ensured, { headers: privateHeaders })
        }
        return Response.json(await projection(db, body.ceremonyId), { headers: privateHeaders })
    } catch (error) { return errorResponse(error) }
}
