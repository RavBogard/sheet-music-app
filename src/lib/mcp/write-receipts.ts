import crypto from "crypto"

/**
 * Stable fingerprints for opt-in MCP write idempotency. Object keys are
 * sorted recursively; array order remains significant because recipient and
 * proposal order are part of the write contract.
 */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, child]) => child !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, child]) => [key, canonicalize(child)]),
        )
    }
    return value
}

export function writeInputHash(input: unknown): string {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(canonicalize(input)))
        .digest("hex")
}

/** Tenant + caller scoped, so two leaders may safely use the same key. */
export function writeReceiptId(
    tool: string,
    uid: string,
    orgId: string,
    idempotencyKey: string,
): string {
    return crypto
        .createHash("sha256")
        .update(`${tool}\0${orgId}\0${uid}\0${idempotencyKey}`)
        .digest("hex")
}

export interface StoredWriteReceipt<TResult> {
    tool: string
    uid: string
    orgId: string
    idempotencyKey: string
    inputHash: string
    state: "in_progress" | "complete"
    result?: TResult
    createdAt: unknown
    completedAt?: unknown
}

export const WRITE_RECEIPTS_COLLECTION = "mcp_write_receipts"
