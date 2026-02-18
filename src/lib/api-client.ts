import { auth } from "@/lib/firebase"

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the Firebase Auth token as a Bearer header.
 * Falls back to unauthenticated if no user is signed in.
 *
 * Usage:
 *   const res = await apiFetch('/api/setlist/print', { method: 'POST', body: JSON.stringify(data) })
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
    const user = auth.currentUser
    const token = user ? await user.getIdToken() : null

    const headers = new Headers(options?.headers)
    if (!headers.has('Content-Type') && options?.body && typeof options.body === 'string') {
        headers.set('Content-Type', 'application/json')
    }
    if (token) {
        headers.set('Authorization', `Bearer ${token}`)
    }

    return fetch(path, {
        ...options,
        headers,
    })
}
