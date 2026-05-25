#!/usr/bin/env node
/**
 * SPOTCHECK-001 — pick 5 random docIds from APPLY-001.json, fetch their
 * full `library_index` doc, assert post-APPLY invariants:
 *   - `normalizedName` matches post-α canonical algorithm output.
 *   - `nameLower`, `stem`, `titleSpecificity` UNCHANGED from pdf-stem-
 *     drift's APPLY at `e01dc2b1a` (this lane does not touch them).
 *
 * Reads `.paul/ops/normalizedname-drift-backfill/APPLY-001.json` to
 * source the deterministic patch list (action === "restamped") and
 * `was`/`now` per-row diff data.
 *
 * Lane: `recompute-helper-normalizedname-pin` (coder-5). Run-once,
 * audit-trail only.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import {
    recomputeIndexNameFields,
    bareStem,
} from "./lib/index-name-fields-compute.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, "..", ".env.local")
{
    const envText = readFileSync(ENV_PATH, "utf8")
    for (const line of envText.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (!m) continue
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        val = val.replace(/\\n/g, "\n")
        if (!(m[1] in process.env)) process.env[m[1]] = val
    }
}

const PROJECT_ID =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"

if (getApps().length === 0) {
    initializeApp({
        credential: cert({
            projectId: PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY,
        }),
    })
}
const db = getFirestore()

const APPLY_PATH = join(
    __dirname,
    "..",
    ".paul",
    "ops",
    "normalizedname-drift-backfill",
    "APPLY-001.json",
)

const apply = JSON.parse(readFileSync(APPLY_PATH, "utf8"))
const restamped = apply.records.filter((r) => r.action === "restamped")
process.stderr.write(`# Sourcing 5 random samples from ${restamped.length} restamped records\n`)

// Deterministic sample: every floor(N/5)th index (so it's reproducible for audit).
const step = Math.floor(restamped.length / 5)
const sampleIdx = [0, step, step * 2, step * 3, restamped.length - 1]
const samples = sampleIdx.map((i) => restamped[i])

const results = []
for (const sample of samples) {
    const docRef = db.collection("library_index").doc(sample.docId)
    const snap = await docRef.get()
    if (!snap.exists) {
        results.push({
            docId: sample.docId,
            name: sample.name,
            check: "FAIL",
            reason: "doc no longer exists",
        })
        continue
    }
    const data = snap.data()
    const stored = {
        name: data.name,
        nameLower: data.nameLower,
        normalizedName: data.normalizedName,
        stem: data.stem,
        titleSpecificity: data.titleSpecificity,
    }
    const expected = recomputeIndexNameFields(stored.name, 1)
    // Re-derive sibling count for accurate titleSpecificity comparison.
    const stemKey = bareStem(stored.name)
    const sibSnap = stemKey
        ? await db
              .collection("library_index")
              .where("stem", "==", stemKey)
              .select("status")
              .get()
        : null
    const activeSiblings = sibSnap
        ? sibSnap.docs.filter(
              (d) => (d.data().status ?? "active") !== "orphaned",
          ).length
        : 1
    const expectedWithSiblings = recomputeIndexNameFields(
        stored.name,
        activeSiblings || 1,
    )

    const assertions = {
        normalizedName_matches_canonical:
            stored.normalizedName === expectedWithSiblings.normalizedName,
        normalizedName_equals_apply_patch:
            stored.normalizedName === sample.patch.normalizedName,
        nameLower_unchanged:
            stored.nameLower ===
            stored.name.toLowerCase() /* PCU contract */,
        stem_matches_canonical: stored.stem === expectedWithSiblings.stem,
        titleSpecificity_matches_canonical:
            stored.titleSpecificity === expectedWithSiblings.titleSpecificity,
    }
    const allPass = Object.values(assertions).every((v) => v === true)

    results.push({
        docId: sample.docId,
        name: stored.name,
        siblingsInCatalog: activeSiblings,
        before: { normalizedName: sample.diff[0].was },
        after: {
            normalizedName: stored.normalizedName,
            nameLower: stored.nameLower,
            stem: stored.stem,
            titleSpecificity: stored.titleSpecificity,
        },
        expectedPostAlpha: expectedWithSiblings,
        assertions,
        check: allPass ? "PASS" : "FAIL",
    })

    process.stderr.write(
        `  ${allPass ? "PASS" : "FAIL"}  ${sample.docId}  name="${stored.name}"  normalizedName: "${sample.diff[0].was}" -> "${stored.normalizedName}"\n`,
    )
}

const summary = {
    sampledAt: new Date().toISOString(),
    sourceFile: "APPLY-001.json",
    totalRestamped: restamped.length,
    sampled: samples.length,
    passed: results.filter((r) => r.check === "PASS").length,
    failed: results.filter((r) => r.check === "FAIL").length,
}

process.stderr.write(`\n=== SPOTCHECK-001 Summary ===\n`)
process.stderr.write(`  totalRestamped: ${summary.totalRestamped}\n`)
process.stderr.write(`  sampled:        ${summary.sampled}\n`)
process.stderr.write(`  passed:         ${summary.passed}\n`)
process.stderr.write(`  failed:         ${summary.failed}\n`)

process.stdout.write(JSON.stringify({ summary, results }, null, 2) + "\n")

if (summary.failed > 0) process.exit(1)
