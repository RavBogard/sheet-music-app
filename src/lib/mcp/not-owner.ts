/**
 * Multi-tenant phase 5 — the one refusal every library WRITE returns when the
 * caller can see a chart (another tenant shares it) but does not own it.
 * Built from writeAccess()'s `not_owner` answer so the wording lives in one
 * place (visibility.ts notOwnerMessage). Surfaces as a rich error envelope
 * (`result.isError` with prose), never a JSON-RPC error.
 */
import { richError } from "@/lib/mcp/errors"
import type { WriteAccess } from "@/lib/library/visibility-server"

export function notOwnerError(
    access: Extract<WriteAccess, { kind: "not_owner" }>,
    fileId: string,
) {
    return richError(
        "not_owner",
        access.message,
        { fileId, ownerOrgId: access.ownerOrgId },
        `Use it in your setlists as it is; only ${access.ownerName} can change it.`,
    )
}
