import { readFileSync, writeFileSync } from "node:fs"

const p = "C:/Users/dsbog/shireishabbat/ops/tasks/CHARTS-001.json"
const d = JSON.parse(readFileSync(p, "utf8"))

d.status = "blocked"
d.summary =
    "R4-e APPROVED BY DANIEL AND WRITTEN; THE SWITCH CANNOT BE TURNED ON YET. Option 2 executed " +
    "2026-09-15: the publicReaderManifest was computed from the exact live Storage generation and " +
    "written with publicReaderStatus approved on the one reader_music_crosswalk row, under a " +
    "transaction precondition (row still the reviewed row, no prior approval, object still at the " +
    "named generation/size/sha256). Both independent-review blockers were re-checked immediately " +
    "before the write and are CLEAR: the source setlist isTest is now literally false, and exactly " +
    "one track in the org carries this (momentId, pieceId) with one binding signature. " +
    "READER_PUBLIC_CHARTS_ENABLED was then set to true (plain true, no trailing newline, stored as " +
    "Config so it can be read back) and production redeployed - and the endpoint failed closed with " +
    "503 on both select and chart. Cause: checkPublicReaderRateLimit requires a DISTRIBUTED limiter " +
    "in production and refuses to serve public chart bytes on per-instance state; " +
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are documented in .env.example but are not " +
    "set in Vercel production. This is the rate limiter working as designed, not a defect. The " +
    "switch was set back to false and production redeployed; the switch-off contract is verified " +
    "live again. The approval row stays written and is inert while the switch is off."
d.next_action =
    "Daniel decides whether to provision an Upstash Redis (or another distributed limiter) for the " +
    ".live project. That is the only remaining step for the pilot: once UPSTASH_REDIS_REST_URL + " +
    "UPSTASH_REDIS_REST_TOKEN exist in Vercel production, set READER_PUBLIC_CHARTS_ENABLED=true, " +
    "redeploy, and re-run the four-way verification (select 200 available / chart 200 " +
    "application/pdf no-store / any other unitId 404 / disallowed Origin 403). Separately and still " +
    "open: historical-link migration semantics, explicit server-controlled setlist share grants, " +
    "closing raw enumeration/arbitrary downloads, and integrating the reader HEAD."
d.blocked_by = [
    "No distributed rate limiter in Vercel production (UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN unset). checkPublicReaderRateLimit denies with 503 rather than " +
        "falling back to per-instance state, so the public chart path cannot serve while it is missing.",
    "Daniel decision on preserving historical anonymous setlist links versus requiring explicit sharing for all",
]
d.evidence.push(
    "R4-e EXECUTED 2026-09-15 (.live round 5 item 4). Manifest written to " +
        "reader_music_crosswalk/awakening.modeh-ani@legacy-shabbat-morning: version 1, " +
        "songId=fileId=upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500, storagePath " +
        "library/upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500.pdf, generation 1779586334638196, " +
        "sha256 da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2, sizeBytes 3008, " +
        "contentType application/pdf. Row also carries publicReaderApprovedAt " +
        "2026-09-15T19:26:40.869Z and publicReaderApprovedBy daniel:R4-e.",
    "Bytes inspected before publication, not assumed: 3008 bytes is a one-page ReportLab vector " +
        "chord chart (%PDF-1.3, /Count 1, Helvetica + Courier, zero images, ~184 drawn words, 7 " +
        "distinct chord-shaped tokens) whose drawn text carries Modah, Ani and Halpert. Not a stub " +
        "and not a scan.",
    "Both review blockers re-checked against production immediately before the write and CLEAR: " +
        "setlist 1e108f17-f24b-4bf0-a9f7-6a0392ccc43d isTest === false (boolean); exactly 1 track " +
        "globally with readerMusic.pieceId == modeh-ani.halpert, 1 distinct binding signature.",
    "BLOCKER FOUND ON THE FLIP: with READER_PUBLIC_CHARTS_ENABLED=true and production redeployed, " +
        "select and chart both returned 503 {status:unavailable}. checkPublicReaderRateLimit returns " +
        "{allowed:false,status:503} when NODE_ENV is production and distributedLimiters() is null, " +
        "which it is because UPSTASH_REDIS_REST_URL/TOKEN are unset in Vercel production. Failing " +
        "closed is the intended behaviour - a failed distributed decision is not permission to serve " +
        "public chart bytes. No rate-limit control was weakened to get past it.",
    "Switch returned to false and production redeployed; switch-off contract re-verified live " +
        "2026-09-15: select 200 {status:unavailable,unitId}, chart 404 {status:unavailable} 24 bytes, " +
        "Origin https://evil.example 403, Access-Control-Allow-Origin echoed only for " +
        "https://siddur.centralreform.org, Cache-Control no-store. The variable is now stored as " +
        "Config (readable for audit) with the exact value false and no trailing CR or LF - the " +
        "2026-09-07 CRLF is gone.",
)
d.revision = (d.revision ?? 10) + 1
d.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z")

writeFileSync(p, JSON.stringify(d, null, 2) + "\n")
console.log("revision", d.revision, "| status", d.status, "| evidence", d.evidence.length)
