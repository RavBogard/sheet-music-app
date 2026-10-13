#!/usr/bin/env node
/**
 * Multi-tenant phase 7 — what still needs Hebrew.
 *
 *   node scripts/i18n-he-missing.mjs                 summary per namespace + problems
 *   node scripts/i18n-he-missing.mjs --list          every missing key with its English and note
 *   node scripts/i18n-he-missing.mjs --ns perform,nav   limit to some namespaces
 *   node scripts/i18n-he-missing.mjs --json          missing keys as JSON (work list for a translator)
 *
 * Mirrors src/__tests__/i18n/catalogue.test.ts: a key marked `"translate": false`
 * in its note needs no Hebrew; a plural English key (`_one`/`_other`) is covered
 * by any Hebrew variant of the same base. Also reports Hebrew keys with no English
 * key, placeholder mismatches and values over the note's maxLength (warning only).
 * The `org` namespace's English is STRING_BASE (src/lib/org/strings-base.ts).
 * Exit code 1 when anything is missing or wrong.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createJiti } from "jiti"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const I18N = join(ROOT, "src", "i18n")
const args = process.argv.slice(2)
const onlyNs = (() => {
    const i = args.indexOf("--ns")
    return i >= 0 ? new Set(args[i + 1].split(",")) : null
})()
const LIST = args.includes("--list")
const JSON_OUT = args.includes("--json")

const PLURAL = /_(zero|one|two|few|many|other)$/
const base = (k) => k.replace(PLURAL, "")
const ph = (s) => [...new Set([...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).filter((p) => p !== "count"))].sort()

function flatten(o, prefix = "", out = {}) {
    for (const [k, v] of Object.entries(o ?? {})) {
        if (k.startsWith("$")) continue
        const key = prefix ? `${prefix}.${k}` : k
        if (typeof v === "string") out[key] = v
        else if (v && typeof v === "object") flatten(v, key, out)
    }
    return out
}
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {})

const namespaces = readdirSync(join(I18N, "en")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
namespaces.push("org")

const jiti = createJiti(import.meta.url)
const { STRING_BASE } = await jiti.import(join(ROOT, "src", "lib", "org", "strings-base.ts"))

let bad = 0
const work = {}
const rows = []
for (const ns of namespaces.sort()) {
    if (onlyNs && !onlyNs.has(ns)) continue
    const en = ns === "org" ? { ...STRING_BASE } : flatten(readJson(join(I18N, "en", `${ns}.json`)))
    const he = flatten(readJson(join(I18N, "he", `${ns}.json`)))
    const notes = readJson(join(I18N, "notes", `${ns}.json`))
    const note = (k) => notes[k] ?? notes[base(k)] ?? {}
    const heBases = new Set(Object.keys(he).map(base))
    const enBases = new Set(Object.keys(en).map(base))

    const missing = Object.keys(en).filter((k) => {
        if (note(k).translate === false) return false
        if (k in he) return false
        if (PLURAL.test(k)) return !heBases.has(base(k))
        return true
    })
    const orphans = Object.keys(he).filter((k) => !(k in en) && !enBases.has(base(k)))
    const phBad = Object.entries(he)
        .map(([k, v]) => {
            const src = en[k] ?? en[`${base(k)}_other`] ?? en[base(k)]
            if (src === undefined) return null
            const a = ph(src).join(","), b = ph(v).join(",")
            return a === b ? null : `${k}: en {${a}} he {${b}}`
        })
        .filter(Boolean)
    const long = Object.entries(he)
        .filter(([k, v]) => note(k).maxLength && v.length > note(k).maxLength)
        .map(([k, v]) => `${k} (${v.length} > ${note(k).maxLength})`)

    bad += missing.length + orphans.length + phBad.length
    rows.push([ns, Object.keys(en).length, Object.keys(he).length, missing.length])
    if (missing.length) work[ns] = Object.fromEntries(missing.map((k) => [k, { en: en[k], ...note(k) }]))
    if (!JSON_OUT) {
        if (LIST) for (const k of missing) console.log(`MISSING ${ns}.${k}: ${JSON.stringify(en[k])}  [${note(k).where ?? "no note"}; max ${note(k).maxLength ?? "?"}]`)
        for (const o of orphans) console.log(`ORPHAN  ${ns}.${o} (no English key)`)
        for (const p of phBad) console.log(`PLACEHOLDER ${ns}.${p}`)
        for (const l of long) console.log(`LONG    ${ns}.${l} (warning)`)
    }
}

if (JSON_OUT) {
    console.log(JSON.stringify(work, null, 2))
} else {
    console.log("\nnamespace                 en   he  missing")
    for (const [ns, e, h, m] of rows) console.log(`${ns.padEnd(24)} ${String(e).padStart(4)} ${String(h).padStart(4)} ${String(m).padStart(8)}`)
    const t = rows.reduce((a, r) => a + r[3], 0)
    console.log(`\n${t} missing; ${bad - t} other problems`)
}
process.exit(bad ? 1 : 0)
