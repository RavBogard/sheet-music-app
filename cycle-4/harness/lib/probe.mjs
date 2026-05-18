/**
 * Cycle-4 cowork browser-audit harness — auth bootstrap primitive.
 *
 * `mintSession({ baseUrl, bearer, uid, firebaseAuth? })` performs the
 * two-step auth bootstrap that cowork probes need before driving any
 * Firebase-listener-dependent surface (realtime sync, drift banner,
 * multi-role concurrency, AI enrichment end-to-end UI):
 *
 *   1. POST /api/auth/test-session (bearer-gated; uid must be `test-*`).
 *      Sets the `__session` cookie on the harness's fetch jar so any
 *      subsequent fetch from inside the harness inherits the
 *      session-cookie-driven server-auth path.
 *   2. If a Firebase Web SDK `Auth` instance is provided (the cowork
 *      page mounts one at window-scope), call
 *      `signInWithCustomToken(firebaseAuth, customToken)` against the
 *      `customToken` the route now returns (META-003, master @
 *      `8fec5291f`). Without this step, server-rendered + cookie-gated
 *      flows work, but client-side Firebase listeners
 *      (onAuthStateChanged, onSnapshot subscriptions, etc.) stay in the
 *      unauth state — silently degrading any cowork probe that depends
 *      on the Web SDK auth listener firing.
 *
 * The `firebaseAuth` arg is optional so cowork pages that drive
 * server-rendered surfaces only can keep using `mintSession` without
 * pulling the Firebase Web SDK in. When provided, the function awaits
 * the `signInWithCustomToken` promise so the caller doesn't have to
 * race the auth listener.
 *
 * IMPORTANT: this primitive lives under `cycle-4/harness/`, which the
 * supervisor protocol treats as cowork instrumentation — NOT shipped
 * production code. The route at /api/auth/test-session is the
 * canonical shape; this file just consumes it.
 *
 * Defense-in-depth log: if the route response contains a `customToken`
 * but no `firebaseAuth` was passed, emit a one-line warning so a
 * cowork run that forgot to wire the Web SDK doesn't silently leave
 * Firebase listeners in the unauth state. (Meta-003 followup contract:
 * "Add an optional warning log if response has customToken but
 * caller's mintSession invocation didn't await the Web-SDK signin.")
 */

/**
 * @typedef {Object} MintSessionArgs
 * @property {string} baseUrl     — e.g. "https://centralreform.live" or "http://localhost:3000".
 * @property {string} bearer      — MCP test-user bearer; the same one the cowork driver uses for /api/mcp.
 * @property {string} uid         — Target test uid (must start with `test-`). Admin callers may pass
 *                                  any `test-*` uid; non-admin self-mint must match the bearer's own uid.
 * @property {object} [firebaseAuth] — Optional Firebase Web SDK Auth instance.
 *                                  When provided, mintSession calls signInWithCustomToken so
 *                                  client-side Firebase listeners (onAuthStateChanged,
 *                                  onSnapshot) wake up.
 */

/**
 * @typedef {Object} MintSessionResult
 * @property {true} ok
 * @property {string} uid
 * @property {string} role
 * @property {string} customToken
 * @property {number} customTokenExpiresInSec
 * @property {string} sessionMintedAt
 * @property {number} expiresInSec
 * @property {boolean} webSdkSignedIn   — true iff signInWithCustomToken resolved on the passed Auth.
 */

/**
 * @param {MintSessionArgs} args
 * @returns {Promise<MintSessionResult>}
 */
export async function mintSession({ baseUrl, bearer, uid, firebaseAuth } = {}) {
    if (!baseUrl) throw new Error("mintSession: baseUrl required")
    if (!bearer) throw new Error("mintSession: bearer required")
    if (!uid) throw new Error("mintSession: uid required")
    if (!uid.startsWith("test-")) {
        throw new Error(
            `mintSession: uid must start with "test-" (got "${uid}"); ` +
                "the route refuses non-test uids with a rich `not_a_test_uid` envelope.",
        )
    }

    const res = await fetch(`${baseUrl}/api/auth/test-session`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({ uid }),
        credentials: "include",
    })

    const body = await res.json()
    if (!res.ok || body?.ok !== true) {
        const machine = body?.error?.machine_code ?? "unknown"
        const message = body?.error?.message ?? `HTTP ${res.status}`
        throw new Error(
            `mintSession: /api/auth/test-session refused (machine_code=${machine}): ${message}`,
        )
    }

    let webSdkSignedIn = false
    if (typeof body.customToken === "string") {
        if (firebaseAuth) {
            // Lazy import so harnesses that drive server-only surfaces
            // don't have to bundle the Firebase Web SDK.
            const { signInWithCustomToken } = await import("firebase/auth")
            await signInWithCustomToken(firebaseAuth, body.customToken)
            webSdkSignedIn = true
        } else {
            // META-003 followup contract — defense-in-depth.
            console.warn(
                "[mintSession] response contained `customToken` but no " +
                    "`firebaseAuth` was passed. Client-side Firebase listeners " +
                    "(onAuthStateChanged, onSnapshot) will stay in the unauth " +
                    "state until you wire `signInWithCustomToken` yourself. " +
                    "Pass the cowork page's `getAuth()` instance as `firebaseAuth` " +
                    "to wake the Web SDK.",
            )
        }
    }

    return {
        ok: true,
        uid: body.uid,
        role: body.role,
        customToken: body.customToken,
        customTokenExpiresInSec: body.customTokenExpiresInSec,
        sessionMintedAt: body.sessionMintedAt,
        expiresInSec: body.expiresInSec,
        webSdkSignedIn,
    }
}
