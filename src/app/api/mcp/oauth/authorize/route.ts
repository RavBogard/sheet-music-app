import { type NextRequest } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { getServerUser } from "@/lib/server-auth"
import { getClient, createAuthCode } from "@/lib/mcp/oauth"
import { logger } from "@/lib/logger"

/**
 * OAuth 2.1 authorization endpoint — authorization-code grant with PKCE.
 *
 * GET /api/mcp/oauth/authorize?response_type=code&client_id=...&redirect_uri=...
 *   &code_challenge=...&code_challenge_method=S256&state=...&scope=...
 *
 * Flow:
 *  1. Validate client_id + redirect_uri against the registered client. If
 *     either is bad we CANNOT safely redirect — show a 400 error page.
 *  2. Validate the remaining params; on failure redirect to the (now trusted)
 *     redirect_uri with ?error=...
 *  3. Resolve the signed-in user via the __session cookie. If not signed in,
 *     bounce through /login?next=<this url> and come back.
 *  4. Auto-approve (no consent screen — confirmed with the owner): mint a
 *     single-use auth code bound to the PKCE challenge and redirect back.
 */

function errorPage(message: string): Response {
    return new Response(
        `<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
            `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
            `<h1>Authorization error</h1><p>${message}</p></body>`,
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
}

function redirectWithError(
    redirectUri: string,
    error: string,
    state: string | null,
    description?: string,
): Response {
    const u = new URL(redirectUri)
    u.searchParams.set("error", error)
    if (description) u.searchParams.set("error_description", description)
    if (state) u.searchParams.set("state", state)
    return Response.redirect(u.toString(), 302)
}

export async function GET(req: NextRequest): Promise<Response> {
    if (!initAdmin()) return errorPage("Server not ready. Please try again.")

    const params = req.nextUrl.searchParams
    const clientId = params.get("client_id") ?? ""
    const redirectUri = params.get("redirect_uri") ?? ""
    const responseType = params.get("response_type")
    const codeChallenge = params.get("code_challenge")
    const codeChallengeMethod = params.get("code_challenge_method")
    const state = params.get("state")
    const scope = params.get("scope")

    // 1. Client + redirect_uri must be valid before we trust redirect_uri.
    const client = await getClient(clientId)
    if (!client) {
        return errorPage("Unknown client_id. The application is not registered.")
    }
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
        return errorPage("redirect_uri does not match a registered URI for this client.")
    }

    // 2. redirect_uri is trusted from here — param errors go back to the client.
    if (responseType !== "code") {
        return redirectWithError(redirectUri, "unsupported_response_type", state)
    }
    if (!codeChallenge) {
        return redirectWithError(
            redirectUri,
            "invalid_request",
            state,
            "code_challenge is required",
        )
    }
    if (codeChallengeMethod !== "S256") {
        return redirectWithError(
            redirectUri,
            "invalid_request",
            state,
            "code_challenge_method must be S256",
        )
    }

    // 3. Require a signed-in user (the __session cookie). Bounce via /login.
    const user = await getServerUser()
    if (!user) {
        const origin = req.nextUrl.origin
        const next = req.nextUrl.pathname + req.nextUrl.search
        return Response.redirect(`${origin}/login?next=${encodeURIComponent(next)}`, 302)
    }

    // 4. Auto-approve — mint a single-use code bound to the PKCE challenge.
    const code = await createAuthCode({
        clientId,
        uid: user.uid,
        codeChallenge,
        redirectUri,
        scope,
    })
    logger.info("[mcp-oauth] authorization granted", { clientId, uid: user.uid })

    const u = new URL(redirectUri)
    u.searchParams.set("code", code)
    if (state) u.searchParams.set("state", state)
    return Response.redirect(u.toString(), 302)
}
