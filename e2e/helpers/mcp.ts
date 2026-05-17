import type { APIRequestContext } from '@playwright/test'

/**
 * MCP JSON-RPC call helper for e2e tests.
 *
 * Mirrors the SSE-frame parsing path the F-023 spec established
 * (`e2e/f023-live-rename.spec.ts` master @ `1024d7389`). The `/api/mcp`
 * route streams responses as `data: <json>` text/event-stream frames
 * even for short, single-shot tool calls — pluck the first one, parse
 * its envelope, then unwrap `result.content[0].text` (the tool's
 * JSON-stringified payload) into a typed object.
 *
 * Validation/refusal envelopes surface as `result.isError: true` with
 * the same `{ error, message, context?, hint? }` shape inside the text
 * payload (NOT as JSON-RPC `error.code`; see `feedback_mcp_validation_shape`).
 * `mcpCall` returns the parsed payload unchanged on both paths — caller
 * checks `'error' in payload` to discriminate.
 */
export interface McpEnvelope<T = unknown> {
    /** Tool-returned JSON payload (could be a success or a `{error, message}` envelope). */
    payload: T
    /** Whether the SDK marked the result with isError. False for any success path. */
    isError: boolean
}

export async function mcpCall<T = unknown>(
    request: APIRequestContext,
    baseURL: string,
    bearer: string,
    tool: string,
    args: Record<string, unknown> = {},
): Promise<McpEnvelope<T>> {
    const res = await request.post(`${baseURL}/api/mcp`, {
        headers: {
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json, text/event-stream',
        },
        data: {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: tool, arguments: args },
        },
    })
    const raw = await res.text()
    const dataLine = raw.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) {
        throw new Error(
            `MCP ${tool}: no SSE data frame in response (status ${res.status()})\n${raw.slice(0, 400)}`,
        )
    }
    const envelope = JSON.parse(dataLine.slice('data: '.length)) as {
        result?: {
            content?: Array<{ text?: string }>
            isError?: boolean
        }
    }
    const text = envelope?.result?.content?.[0]?.text
    if (typeof text !== 'string') {
        throw new Error(
            `MCP ${tool}: missing text payload in result.content[0]\n${JSON.stringify(envelope).slice(0, 400)}`,
        )
    }
    return {
        payload: JSON.parse(text) as T,
        isError: envelope.result?.isError === true,
    }
}

/** Convenience: throw on isError; return payload directly. */
export async function mcpCallOrThrow<T = unknown>(
    request: APIRequestContext,
    baseURL: string,
    bearer: string,
    tool: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    const { payload, isError } = await mcpCall<T>(request, baseURL, bearer, tool, args)
    if (isError) {
        const env = payload as { error?: string; message?: string; hint?: string }
        throw new Error(
            `MCP ${tool} returned error envelope: ${env.error ?? 'unknown_error'} — ${env.message ?? '(no message)'}${env.hint ? ` (hint: ${env.hint})` : ''}`,
        )
    }
    // Tool payloads sometimes return `{ok: false, error}` directly even
    // without the SDK's isError flag (older shape). Surface that too.
    const env = payload as { ok?: boolean; error?: string; message?: string }
    if (env && env.ok === false && typeof env.error === 'string') {
        throw new Error(
            `MCP ${tool} returned legacy error envelope: ${env.error} — ${env.message ?? '(no message)'}`,
        )
    }
    return payload
}
