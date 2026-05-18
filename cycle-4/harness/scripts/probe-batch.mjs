#!/usr/bin/env node
/**
 * Cycle-5 C5B-META-002 — batch cowork probe runner.
 *
 * Invokes a list of harness probes (`cycle-4/harness/probes/*.mjs` by
 * convention) sequentially, emitting a JSONL stream of `{probe, ok,
 * durationMs, result?, error?}` rows to stdout. The cowork driver
 * captures stdout to `findings.jsonl` so the post-run aggregator can
 * group results without needing a separate output dir.
 *
 * Usage:
 *   node cycle-4/harness/scripts/probe-batch.mjs \
 *     --base-url=https://centralreform.live \
 *     --bearer=$DRIVER_BEARER \
 *     cycle-4/harness/probes/perform.mjs \
 *     cycle-4/harness/probes/library.mjs \
 *     ... > findings.jsonl
 *
 * Each probe module is loaded as ESM and must export a default async
 * function:
 *
 *   export default async function probe({ baseUrl, bearer }) { ... }
 *
 * Whatever the function returns is serialized into the JSONL row's
 * `result` field. Errors are caught per-probe so one bad probe doesn't
 * abort the batch.
 */

import { performance } from "node:perf_hooks"
import path from "node:path"
import { pathToFileURL } from "node:url"

function parseArgs(argv) {
    const flags = {}
    const positional = []
    for (const arg of argv) {
        const m = arg.match(/^--([^=]+)(?:=(.*))?$/)
        if (m) {
            flags[m[1]] = m[2] === undefined ? true : m[2]
        } else {
            positional.push(arg)
        }
    }
    return { flags, positional }
}

function emit(row) {
    process.stdout.write(JSON.stringify(row) + "\n")
}

async function main() {
    const { flags, positional } = parseArgs(process.argv.slice(2))
    const baseUrl = flags["base-url"] ?? process.env.HARNESS_BASE_URL
    const bearer = flags["bearer"] ?? process.env.DRIVER_BEARER
    if (!baseUrl) {
        console.error("probe-batch: --base-url=<url> (or HARNESS_BASE_URL) is required")
        process.exit(2)
    }
    if (positional.length === 0) {
        console.error("probe-batch: at least one probe module path is required")
        process.exit(2)
    }

    emit({
        kind: "batch:start",
        baseUrl,
        bearerProvided: !!bearer,
        probeCount: positional.length,
        startedAt: new Date().toISOString(),
    })

    let failures = 0
    for (const rel of positional) {
        const abs = path.resolve(process.cwd(), rel)
        const startedAt = performance.now()
        try {
            const mod = await import(pathToFileURL(abs).href)
            const probe = mod.default ?? mod.probe
            if (typeof probe !== "function") {
                throw new Error(
                    `module ${rel} has no default export or named export 'probe'`,
                )
            }
            const result = await probe({ baseUrl, bearer })
            emit({
                kind: "probe:result",
                probe: rel,
                ok: true,
                durationMs: Math.round(performance.now() - startedAt),
                result,
            })
        } catch (err) {
            failures++
            emit({
                kind: "probe:result",
                probe: rel,
                ok: false,
                durationMs: Math.round(performance.now() - startedAt),
                error: {
                    name: err?.name ?? "Error",
                    message: err?.message ?? String(err),
                    stack: err?.stack ?? null,
                },
            })
        }
    }

    emit({
        kind: "batch:end",
        probeCount: positional.length,
        failures,
        endedAt: new Date().toISOString(),
    })
    process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
    console.error("probe-batch: fatal:", err)
    process.exit(2)
})
