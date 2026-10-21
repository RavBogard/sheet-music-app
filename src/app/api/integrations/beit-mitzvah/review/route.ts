import { getFirestore } from "@/lib/firebase-admin"
import { reviewRequest } from "@/lib/beit-mitzvah/contract"
import { authorizeEditor, boundedJSON, errorResponse, privateHeaders } from "@/lib/beit-mitzvah/access"
import { BridgeError } from "@/lib/beit-mitzvah/service"
import { manageReview } from "@/lib/beit-mitzvah/resources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request): Promise<Response> {
    try {
        const uid = await authorizeEditor(request)
        const parsed = reviewRequest.safeParse(await boundedJSON(request))
        if (!parsed.success) throw new BridgeError("invalid_request", 400)
        return Response.json(await manageReview(getFirestore(), uid, parsed.data), { headers: privateHeaders })
    } catch (error) { return errorResponse(error) }
}
