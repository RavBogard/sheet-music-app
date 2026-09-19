#!/usr/bin/env node
/**
 * CHARTS-001 — READ ONLY identity check on the bytes about to be published.
 *
 * Deliberately narrow: it answers "is this the Modeh Ani chart, set by
 * Halpert, and does it look like a chord chart rather than a stub" with
 * yes/no probes and a page count. It never prints the chart's contents —
 * these are third-party sheet music bytes and a transcript is not the place
 * for them.
 */
import { Storage } from "@google-cloud/storage"
import { readFileSync } from "node:fs"
import { inflateSync, inflateRawSync } from "node:zlib"

const ENV = process.env.CHARTS_ENV_FILE // a scratchpad path from `vercel env pull`; never .env.local, and delete it after
for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v.replace(/\\n/g, "\n")
}
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = (process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`).replace(
    /^gs:\/\//,
    "",
)
const storage = new Storage({
    projectId: PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY,
    },
})

const buf = await new Promise((res, rej) => {
    const parts = []
    storage
        .bucket(BUCKET)
        .file(`library/${process.argv[2]}.pdf`)
        .createReadStream()
        .on("data", (c) => parts.push(c))
        .on("end", () => res(Buffer.concat(parts)))
        .on("error", rej)
})

{
    const t = buf.toString("latin1")
    console.log(
        "filters:",
        [...new Set(t.match(/\/Filter\s*\/?\[?\s*\/[A-Za-z0-9]+/g) ?? [])].join(", ") || "(none)",
    )
    console.log("raw Tj:", (t.match(/Tj/g) ?? []).length, " raw TJ:", (t.match(/TJ/g) ?? []).length)
}

/** ASCII85 as PDF spells it, up to the `~>` terminator. */
function ascii85(bytes) {
    const s = bytes.toString("latin1").replace(/\s+/g, "")
    const end = s.indexOf("~>")
    const body = (end >= 0 ? s.slice(0, end) : s).replace(/^<~/, "")
    const out = []
    let tuple = 0
    let count = 0
    for (const ch of body) {
        if (ch === "z" && count === 0) {
            out.push(0, 0, 0, 0)
            continue
        }
        const v = ch.charCodeAt(0) - 33
        if (v < 0 || v > 84) return null
        tuple = tuple * 85 + v
        if (++count === 5) {
            for (let i = 3; i >= 0; i--) out.push((tuple >>> (i * 8)) & 0xff)
            tuple = 0
            count = 0
        }
    }
    if (count > 1) {
        for (let i = count; i < 5; i++) tuple = tuple * 85 + 84
        for (let i = 3; i >= 5 - count; i--) out.push((tuple >>> (i * 8)) & 0xff)
    }
    return Buffer.from(out)
}

// Pull every stream out and inflate what inflates.
let text = ""
let at = 0
for (;;) {
    const s = buf.indexOf("stream", at)
    if (s < 0) break
    let start = s + 6
    while (buf[start] === 0x0d || buf[start] === 0x0a) start += 1
    const e = buf.indexOf("endstream", start)
    if (e < 0) break
    const raw = buf.subarray(start, e)
    // ReportLab's default chain is /ASCII85Decode then /FlateDecode, so try
    // the ascii85 hop first and fall back to a bare inflate.
    for (const bytes of [ascii85(raw), raw]) {
        if (!bytes) continue
        let done = false
        for (const fn of [inflateSync, inflateRawSync]) {
            try {
                text += fn(bytes).toString("latin1")
                done = true
                break
            } catch {
                /* not this one */
            }
        }
        if (done) break
    }
    at = e + 9
}

// Only the glyphs PDF text operators draw, so the probes below see words.
const drawn = [...text.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj/g)]
    .map((m) => m[0].slice(1, m[0].lastIndexOf(")")))
    .join(" ")
const words = (drawn.match(/[A-Za-z']+/g) ?? []).length

console.log(`inflated text  ${text.length} chars`)
console.log(`drawn strings  ${drawn.length} chars, ~${words} words`)
for (const probe of ["mode", "moda", "halpert", "ani", "capo", "chorus", "verse"]) {
    console.log(`  /${probe}/i  ${new RegExp(probe, "i").test(drawn) ? "YES" : "no"}`)
}
// Chord symbols are what makes it a chart rather than a page of words.
const chords = [...new Set(drawn.match(/\b[A-G](?:#|b)?(?:m|maj|min|sus|dim|aug)?\d?\b/g) ?? [])]
console.log(`  distinct chord-shaped tokens: ${chords.length}`)
