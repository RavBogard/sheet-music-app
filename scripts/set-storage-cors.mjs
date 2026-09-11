#!/usr/bin/env node
/**
 * set-storage-cors.mjs — the Storage bucket CORS rule batch chart intake needs.
 *
 * The drop-zone iframe (and the CLI courier) PUT chart bytes STRAIGHT to a
 * signed Google Cloud Storage URL — the bytes never pass through our server,
 * and never through Claude. A browser will only make that cross-origin PUT if
 * the bucket itself says the method and headers are allowed, so the bucket
 * needs a CORS rule covering PUT plus the headers a signed upload sends back.
 *
 * DRY RUN BY DEFAULT. Running it with no flags prints the bucket's CURRENT
 * `cors` array and the entry we want, and writes nothing:
 *
 *     node scripts/set-storage-cors.mjs
 *
 * Applying is a deliberate, separate act (it rewrites live bucket config for
 * every client of the bucket):
 *
 *     node scripts/set-storage-cors.mjs --apply
 *
 * `--apply` keeps every existing entry except one that already matches the
 * desired origin+method pair (which it replaces), then writes the merged list.
 *
 * Credentials come from `.env.local`: FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * (the firebase-adminsdk service account, which has storage admin on the
 * project), and FIREBASE_STORAGE_BUCKET for the bucket name.
 */

import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getStorage } from "firebase-admin/storage"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENV_FILE = resolve(__dirname, "..", ".env.local")
const DEFAULT_BUCKET = "crcmusiccharts.firebasestorage.app"

export const EXIT_CODES = Object.freeze({
    OK: 0,
    MISSING_ENV: 2,
    FAILED: 4,
})

/**
 * The CORS entry batch intake needs.
 *
 * - `origin: ["*"]` — Claude's Apps iframe is served from an opaque, rotating
 *   origin, so there is no single origin to name. The signed URL is itself the
 *   credential (15-minute TTL, one object path), so a wildcard origin does not
 *   widen who can write: it only lets a browser that already holds the URL
 *   finish the request.
 * - `PUT` is the upload; `GET`/`HEAD` let a client verify what landed.
 * - The response headers are the ones a signed upload returns and the browser
 *   must be allowed to read.
 */
export const DESIRED_CORS_ENTRY = Object.freeze({
    origin: ["*"],
    method: ["PUT", "GET", "HEAD"],
    responseHeader: [
        "Content-Type",
        "Content-Length",
        "x-goog-resumable",
        "x-goog-content-length-range",
    ],
    maxAgeSeconds: 3600,
})

/** Minimal `.env`-style parser: KEY=VALUE, `#` comments, paired quotes stripped. */
export function parseEnvText(text) {
    const out = Object.create(null)
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const eq = line.indexOf("=")
        if (eq < 0) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        const quoted =
            val.length >= 2 &&
            ((val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'")))
        if (quoted) val = val.slice(1, -1)
        out[key] = val
    }
    return out
}

function sameSet(a, b) {
    const x = [...(a ?? [])].map(String).sort()
    const y = [...(b ?? [])].map(String).sort()
    return x.length === y.length && x.every((v, i) => v === y[i])
}

/**
 * Merge the desired entry into an existing `cors` array: everything that is not
 * already the same origin+method pair, plus the desired entry. Pure — exported
 * so the merge can be reasoned about without touching a bucket.
 */
export function mergeCors(existing, desired = DESIRED_CORS_ENTRY) {
    const kept = (existing ?? []).filter(
        (e) =>
            !(sameSet(e?.origin, desired.origin) && sameSet(e?.method, desired.method)),
    )
    return [...kept, { ...desired }]
}

async function loadEnv(envPath) {
    let text
    try {
        text = await readFile(envPath, "utf8")
    } catch (err) {
        throw Object.assign(
            new Error(
                `Cannot read ${envPath}: ${err?.message ?? String(err)}. This script needs FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY / FIREBASE_STORAGE_BUCKET.`,
            ),
            { exitCode: EXIT_CODES.MISSING_ENV },
        )
    }
    const env = parseEnvText(text)
    const clientEmail = env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
    const rawKey = env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
    if (!clientEmail || !rawKey) {
        throw Object.assign(
            new Error(
                `${envPath} is missing FIREBASE_CLIENT_EMAIL and/or FIREBASE_PRIVATE_KEY.`,
            ),
            { exitCode: EXIT_CODES.MISSING_ENV },
        )
    }
    return {
        clientEmail,
        // `.env.local` stores the PEM with literal `\n` escapes.
        privateKey: rawKey.replace(/\\n/g, "\n"),
        projectId:
            env.FIREBASE_PROJECT_ID ||
            env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            "crcmusiccharts",
        bucketName: (
            env.FIREBASE_STORAGE_BUCKET ||
            env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
            DEFAULT_BUCKET
        ).replace(/^gs:\/\//, ""),
    }
}

export async function main(argv = []) {
    const apply = argv.includes("--apply")
    const envPath = DEFAULT_ENV_FILE

    let conf
    try {
        conf = await loadEnv(envPath)
    } catch (err) {
        process.stderr.write(`${err.message}\n`)
        return err.exitCode ?? EXIT_CODES.FAILED
    }

    const app =
        getApps().find((a) => a.name === "cors-script") ??
        initializeApp(
            {
                credential: cert({
                    projectId: conf.projectId,
                    clientEmail: conf.clientEmail,
                    privateKey: conf.privateKey,
                }),
                storageBucket: conf.bucketName,
            },
            "cors-script",
        )

    const bucket = getStorage(app).bucket(conf.bucketName)

    let metadata
    try {
        const got = await bucket.getMetadata()
        metadata = got[0]
    } catch (err) {
        process.stderr.write(
            `Could not read bucket metadata for gs://${conf.bucketName}: ${err?.message ?? String(err)}\n`,
        )
        return EXIT_CODES.FAILED
    }

    const current = metadata.cors ?? []
    process.stdout.write(`bucket: gs://${conf.bucketName}\n`)
    process.stdout.write(`current cors:\n${JSON.stringify(current, null, 2)}\n`)
    process.stdout.write(
        `desired entry:\n${JSON.stringify(DESIRED_CORS_ENTRY, null, 2)}\n`,
    )

    const merged = mergeCors(current)

    if (!apply) {
        process.stdout.write(
            `\nDRY RUN — nothing written. Merged result would be:\n${JSON.stringify(merged, null, 2)}\n`,
        )
        process.stdout.write("Re-run with --apply to write it.\n")
        return EXIT_CODES.OK
    }

    try {
        await bucket.setCorsConfiguration(merged)
    } catch (err) {
        process.stderr.write(
            `setCorsConfiguration failed: ${err?.message ?? String(err)}\n`,
        )
        return EXIT_CODES.FAILED
    }
    process.stdout.write(
        `\nAPPLIED. cors is now:\n${JSON.stringify(merged, null, 2)}\n`,
    )
    return EXIT_CODES.OK
}

// CLI dispatch — only when invoked directly, never on import.
// `process.exitCode` rather than `process.exit()`: see the note in
// scripts/supervisor-prod-bearer.mjs about Node 24 + undici keep-alive sockets
// on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code
        })
        .catch((err) => {
            process.stderr.write(`Unexpected error: ${err?.stack ?? String(err)}\n`)
            process.exitCode = EXIT_CODES.FAILED
        })
}
