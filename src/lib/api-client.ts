import { auth } from "@/lib/firebase"
import { logger } from "@/lib/logger"

export interface ApiFetchOptions extends RequestInit {
    /**
     * Milliseconds before the request is auto-aborted.
     * Default 30000. Pass `0` to disable.
     */
    timeout?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the Firebase Auth token as a Bearer header.
 * Falls back to unauthenticated if no user is signed in.
 * Arms a default 30s timeout-abort unless `timeout: 0` is passed.
 * Caller-supplied `signal` is respected — either source triggers the abort.
 *
 * Usage:
 *   const res = await apiFetch('/api/setlist/print', { method: 'POST', body: JSON.stringify(data) })
 *   const res = await apiFetch('/api/long', { timeout: 0 })  // opt out
 */
export async function apiFetch(path: string, options?: ApiFetchOptions): Promise<Response> {
    const user = auth.currentUser
    let token: string | null = null
    if (user) {
        try {
            token = await user.getIdToken()
        } catch {
            // Cached token failed — force refresh
            try {
                token = await user.getIdToken(true)
            } catch {
                throw new Error("Authentication expired. Please sign in again.")
            }
        }
    }

    const headers = new Headers(options?.headers)
    if (!headers.has('Content-Type') && options?.body && typeof options.body === 'string') {
        headers.set('Content-Type', 'application/json')
    }
    if (token) {
        headers.set('Authorization', `Bearer ${token}`)
    }

    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS
    const controller = new AbortController()

    // Forward caller-supplied signal aborts to our internal controller so both
    // the caller's reason and the timeout funnel through a single signal.
    const callerSignal = options?.signal
    if (callerSignal) {
        if (callerSignal.aborted) {
            controller.abort((callerSignal as AbortSignal & { reason?: unknown }).reason)
        } else {
            callerSignal.addEventListener('abort', () => {
                controller.abort((callerSignal as AbortSignal & { reason?: unknown }).reason)
            }, { once: true })
        }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            controller.abort(new DOMException('Request timed out', 'AbortError'))
        }, timeoutMs)
    }

    // Strip our custom `timeout` before forwarding to fetch.
    const { timeout: _timeout, signal: _callerSignal, ...rest } = options ?? {}
    void _timeout
    void _callerSignal

    try {
        const response = await fetch(path, {
            ...rest,
            headers,
            signal: controller.signal,
        })
        if (!response.ok) {
            // Surface the server's request-id so client logs can be cross-referenced
            // with Vercel logs. Body is canonical (matches header), but fall back to
            // the header if the error body isn't JSON. Wrapped in try/catch because
            // some test-mocked responses don't implement headers/clone.
            let requestId: string | undefined
            try {
                const headerId = response.headers?.get?.('x-request-id') ?? undefined
                let bodyId: string | undefined
                if (typeof response.clone === 'function') {
                    try {
                        const errJson = await response.clone().json()
                        if (errJson && typeof errJson === 'object' && typeof errJson.requestId === 'string') {
                            bodyId = errJson.requestId
                        }
                    } catch {
                        /* non-JSON body — header is fine */
                    }
                }
                requestId = bodyId ?? headerId
            } catch {
                /* minimal response — skip id extraction */
            }
            logger.error({
                event: 'api-fetch-failed',
                url: path,
                status: response.status,
                requestId,
            })
        }
        return response
    } finally {
        if (timer) clearTimeout(timer)
    }
}
