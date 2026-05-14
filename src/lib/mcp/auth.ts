import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { hashToken } from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"

/**
 * MCP bearer-token verifier.
 *
 * MCP tokens are NOT Firebase ID tokens — they are opaque `crl_live_` strings
 * hashed into the `mcpTokens` collection. On success this returns the resolved
 * owner `uid`, the same shape the `/api/*` routes pass downstream, so MCP tool
 * handlers can reuse the existing data layer unchanged.
 *
 * Never logs the raw token — only token doc ids.
 */

const COLLECTION = "mcpTokens"

function unauthorized(): Response {
    return new Response("Unauthorized", { status: 401 })
}

export async function verifyBearer(req: Request): Promise<{ uid: string } | Response> {
    const header = req.headers.get("authorization")
    if (!header?.startsWith("Bearer ")) return unauthorized()
    const raw = header.slice(7).trim()
    if (!raw) return unauthorized()

    if (!initAdmin()) {
        return new Response("Server not ready", { status: 500 })
    }

    const db = getFirestore()
    const snap = await db
        .collection(COLLECTION)
        .where("tokenHash", "==", hashToken(raw))
        .limit(1)
        .get()

    if (snap.empty) return unauthorized()

    const doc = snap.docs[0]
    const data = doc.data()
    if (data.revokedAt) return unauthorized()

    // Best-effort — a failed lastUsedAt update must not fail the request.
    doc.ref
        .update({ lastUsedAt: FieldValue.serverTimestamp() })
        .catch(() => logger.warn("[mcp] lastUsedAt update failed", { tokenId: doc.id }))

    return { uid: data.uid as string }
}
