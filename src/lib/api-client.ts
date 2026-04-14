import { auth } from "@/lib/firebase"

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
        return await fetch(path, {
            ...rest,
            headers,
            signal: controller.signal,
        })
    } finally {
        if (timer) clearTimeout(timer)
    }
}
