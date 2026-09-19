import { readFileSync, writeFileSync } from "node:fs"

const p = "C:/Users/dsbog/shireishabbat/ops/tasks/CHARTS-001.json"
const d = JSON.parse(readFileSync(p, "utf8"))

d.status = "live"
d.summary =
    "R4-e IS LIVE. R6-b provisioned the distributed rate limiter that round 5 was blocked on and " +
    "the Modeh Ani chart now serves to the reader. 2026-09-15: Upstash for Redis provisioned on " +
    "the .live production project from the Vercel marketplace (free tier, resource " +
    "upstash-kv-cyclamen-fence, connected to production only, --no-env-pull so nothing touched " +
    ".env.local). The integration supplies the REST url and token as KV_REST_API_URL / " +
    "KV_REST_API_TOKEN, not the UPSTASH_REDIS_REST_* names the code read, so the code learned to " +
    "read either PAIR (b17e06e412) rather than have the same secret copied into a second place " +
    "that a rotation could miss. READER_PUBLIC_CHARTS_ENABLED set to true (exact bytes 'true', no " +
    "CR, no LF, stored as Config so it reads back for audit) and production redeployed. All four " +
    "verifications pass live, and the bytes served hash to the reviewed manifest exactly. The " +
    "approval row written in round 5 was not touched: it was correct and inert, and it is now " +
    "correct and serving."
d.next_action =
    "Nothing for this pilot. Still open and separate: historical-link migration semantics, " +
    "explicit server-controlled setlist share grants, closing raw enumeration / arbitrary " +
    "downloads, and integrating the reader HEAD. The reader's chart panel (W6) still waits on " +
    "DESKTOP-UX-001."
d.blocked_by = [
    "Daniel decision on preserving historical anonymous setlist links versus requiring explicit sharing for all",
]
d.evidence.push(
    "R6-b EXECUTED 2026-09-15. `vercel integration add upstash/upstash-kv -e production " +
        "--no-env-pull` provisioned 'Upstash for Redis' resource upstash-kv-cyclamen-fence and " +
        "connected it to sheet-music-app production. Marketplace variables landed as " +
        "KV_REST_API_URL (https://stirred-sloth-279745.upstash.io), KV_REST_API_TOKEN, KV_URL, " +
        "REDIS_URL, KV_REST_API_READ_ONLY_TOKEN. --no-env-pull was passed deliberately: the " +
        "default post-provision env pull writes .env.local, which holds SUPERVISOR_PROD_BEARER.",
    "NAME MISMATCH RESOLVED IN CODE, NOT BY COPYING A SECRET. src/lib/rate-limit.ts and " +
        "src/lib/reader-public-rate-limit.ts read UPSTASH_REDIS_REST_URL/_TOKEN; the marketplace " +
        "provisions the identical REST credentials under Vercel's KV naming. Commit b17e06e412 " +
        "adds src/lib/upstash-env.ts, which resolves the first COMPLETE pair — UPSTASH_* " +
        "preferred, KV_* second — and never mixes a url from one source with a token from the " +
        "other. Copying the pair would have created a second place to rotate whose miss fails " +
        "closed on the anonymous chart path.",
    "FOUR-WAY VERIFICATION, live against https://www.centralreform.live 2026-09-15 after the " +
        "redeploy. (1) POST /api/reader/music/select, Origin https://siddur.centralreform.org -> " +
        "200 {status:available, unitId, kind:pdf, contentType:application/pdf, chartUrl}, " +
        "Access-Control-Allow-Origin echoed for that one origin, Cache-Control no-store, Vary " +
        "Origin. (2) GET /api/reader/music/chart?unitId=<modeh> from that origin -> 200, " +
        "Content-Type application/pdf, Content-Length 3008, Cache-Control no-store, " +
        "Content-Disposition inline, X-Content-Type-Options nosniff, single ACAO origin. (3) any " +
        "other unitId (erev-yk.kol-nidre@crc-kol-nidre) -> 404 {status:unavailable}. (4) Origin " +
        "https://evil.example -> 403 on both chart and select, no ACAO header.",
    "THE BYTES SERVED ARE THE BYTES REVIEWED. sha256 of the 3008-byte response body is " +
        "da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2 — identical to the " +
        "publicReaderManifest written under precondition in round 5, and the body begins %PDF-1.3. " +
        "The approval row was neither rewritten nor re-approved.",
    "GENERAL LIMITER, the side effect R6-b names: it reads the same credentials and stops " +
        "degrading to per-instance counting. Measured after the flip — an authenticated MCP " +
        "authoring call (tools/call list_books) returns 200 ok:true, /perform 200, /api/version " +
        "200. Nothing was weakened to get here; round 5's 503 was the control working, and the " +
        "fix was to give it the store it asked for.",
)
d.revision = (d.revision ?? 11) + 1
d.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z")

writeFileSync(p, JSON.stringify(d, null, 2) + "\n")
console.log("revision", d.revision, "| status", d.status, "| evidence", d.evidence.length)
