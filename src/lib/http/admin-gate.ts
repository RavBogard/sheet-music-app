/**
 * Cycle-3 NEW-4 (A4) — Admin-only HTTP route gate that emits the rich
 * `forbidden_role` envelope on the wire (per b1's contract,
 * `src/lib/http/error-envelope.ts` + `src/lib/mcp/error-envelopes.ts`).
 *
 * `requireAuth(req, 'admin')` from `src/lib/api-auth.ts` throws a
 * `NextResponse` with the legacy bare-prose envelope (`{error: "..."}`),
 * which agents have to parse as text. The b1 sweep migrated MCP tools
 * + a couple of HTTP routes to the rich shape, but `requireAuth` itself
 * is older and hasn't been retrofitted. We wrap it here so every new
 * admin-only HTTP route built going forward gets the rich envelope for
 * free.
 *
 * Returns either:
 *  - `{ ok: true, auth: AuthResult }` when authenticated + admin
 *  - `{ ok: false, response: NextResponse }` carrying the rich envelope
 *     (status 401 if unauthenticated, 403 if role insufficient).
 */

import "server-only"
import { NextRequest, NextResponse } from "next/server"

import { requireAuth, type AuthResult } from "@/lib/api-auth"
import { httpError } from "@/lib/http/error-envelope"

export type AdminGateResult =
    | { ok: true; auth: AuthResult }
    | { ok: false; response: NextResponse }

export async function requireAdmin(
    req: NextRequest | Request,
): Promise<AdminGateResult> {
    try {
        const auth = await requireAuth(req, "admin")
        return { ok: true, auth }
    } catch (thrown) {
        if (thrown instanceof NextResponse) {
            // requireAuth's bare-prose envelope carried a status — preserve
            // it while reshaping the body. 401 = no token, 403 = role
            // insufficient, 500 = init failure.
            const status = thrown.status
            if (status === 401) {
                return {
                    ok: false,
                    response: httpError(
                        401,
                        "unauthenticated",
                        "Authentication required.",
                        {},
                        "Send `Authorization: Bearer <firebase-id-token>` with an admin user's token.",
                    ),
                }
            }
            if (status === 403) {
                return {
                    ok: false,
                    response: httpError(
                        403,
                        "forbidden_role",
                        "This endpoint requires the admin role.",
                        { requiredRoles: ["admin"] },
                        "Ask an admin to elevate your account, or sign in as an admin user.",
                    ),
                }
            }
            // Surface anything else (500 init) as a generic server error.
            return {
                ok: false,
                response: httpError(
                    status || 500,
                    "server_error",
                    "Authentication subsystem unavailable.",
                ),
            }
        }
        return {
            ok: false,
            response: httpError(
                500,
                "server_error",
                "Authentication check failed.",
            ),
        }
    }
}
