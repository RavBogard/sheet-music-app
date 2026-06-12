import { randomBytes } from "crypto"

// Readable [A-Z0-9] subset (no I/O/0/1) — mirrors the client generator in
// QRSignIn.tsx so server-fallback codes have the same shape as client codes.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/**
 * Server-side fallback QR code generator (used by POST /api/auth/qr when the
 * caller provides no/invalid client code).
 *
 * Lives in this sibling module (NOT route.ts) on purpose: a Next.js App Router
 * `route.ts` may only export HTTP handlers + route config — exporting a helper
 * there fails the prod build's route-type check ("not a valid Route export
 * field"). Keep route helpers in plain modules and import them.
 *
 * BUG-13 (run-3 §BUG-13): the old `randomBytes(4).toString("base64url")
 * .replace(/[^A-Za-z0-9]/g,"").slice(0,6)` STRIPPED any '-'/'_' from the draw,
 * so a draw containing them collapsed to a <6-char code (live repro "HEBFW")
 * that the ^[A-Z0-9]{6}$ validators (POST/GET/PUT) then 400. Looping a fixed
 * 6 times over CODE_CHARS guarantees exactly 6 chars, all in [A-Z0-9].
 */
export function generateCode(): string {
    const bytes = randomBytes(6)
    let code = ""
    for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
    return code
}
