import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { catalogues } from "@/i18n/catalogues"
import { NAMESPACE_RE } from "@/i18n/core"
import { usedKeys } from "./scanner"
import { REPO_ROOT, toRepoPath } from "./scope"

/**
 * Multi-tenant phase 7 — catalogue integrity.
 *
 * Always on: file names, JSON shape, no Hebrew key without an English one, the
 * same placeholders in both languages, a translator note for every English
 * key, and every literal `t("ns.key")` in the code exists in English.
 *
 * Hebrew completeness (every English key has a Hebrew entry) runs when
 * I18N_REQUIRE_HE=1 until translation lands. To make it always-on, set
 * REQUIRE_HE to `true` below.
 */
const REQUIRE_HE = process.env.I18N_REQUIRE_HE === "1"

const I18N_DIR = join(REPO_ROOT, "src", "i18n")
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function jsonFiles(dir: string): string[] {
    try {
        return readdirSync(join(I18N_DIR, dir)).filter((f) => f.endsWith(".json"))
    } catch {
        return []
    }
}

function readJson(rel: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(I18N_DIR, rel), "utf8"))
}

const baseKey = (k: string) => k.replace(PLURAL_SUFFIX, "")
const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort()

type Note = { where?: string; who?: string; maxLength?: number; context?: string; translate?: boolean }
function notesFor(ns: string): Record<string, Note> {
    try {
        return readJson(`notes/${ns}.json`) as Record<string, Note>
    } catch {
        return {}
    }
}
function noteOf(fullKey: string): Note | undefined {
    const [ns, ...rest] = fullKey.split(".")
    const notes = notesFor(ns)
    const k = rest.join(".")
    return notes[k] ?? notes[baseKey(k)]
}

describe("phase 7: catalogue files", () => {
    it("namespace file names are valid; English org text lives in STRING_BASE, not en/org.json", () => {
        for (const dir of ["en", "he", "notes"]) {
            for (const f of jsonFiles(dir)) expect(NAMESPACE_RE.test(f.replace(/\.json$/, "")), `${dir}/${f}`).toBe(true)
        }
        expect(jsonFiles("en")).not.toContain("org.json")
    })

    it("every value is a string (or a nested group of strings)", () => {
        const check = (v: unknown, at: string): void => {
            if (typeof v === "string") return
            expect(v && typeof v === "object", at).toBe(true)
            for (const [k, x] of Object.entries(v as object)) if (!k.startsWith("$")) check(x, `${at}.${k}`)
        }
        for (const dir of ["en", "he"]) for (const f of jsonFiles(dir)) check(readJson(`${dir}/${f}`), `${dir}/${f}`)
    })

    it("every Hebrew namespace has an English one", () => {
        const en = new Set([...jsonFiles("en"), "org.json"])
        for (const f of jsonFiles("he")) expect(en.has(f), `he/${f} has no English source`).toBe(true)
    })
})

describe("phase 7: catalogue keys", () => {
    const { en, he } = catalogues()
    const enBase = new Set(Object.keys(en).map(baseKey))

    it("no Hebrew key without an English key", () => {
        const orphans = Object.keys(he).filter((k) => !(k in en) && !enBase.has(baseKey(k)))
        expect(orphans).toEqual([])
    })

    it("Hebrew keeps English's placeholders", () => {
        const bad: string[] = []
        for (const [k, v] of Object.entries(he)) {
            const src = en[k] ?? en[`${baseKey(k)}_other`] ?? en[baseKey(k)]
            if (src === undefined) continue
            const a = placeholders(src).filter((p) => p !== "count")
            const b = placeholders(v).filter((p) => p !== "count")
            if (JSON.stringify([...new Set(a)]) !== JSON.stringify([...new Set(b)])) bad.push(`${k}: en ${JSON.stringify(a)} he ${JSON.stringify(b)}`)
        }
        expect(bad).toEqual([])
    })

    it("every English key has a translator note (src/i18n/notes/<ns>.json: where, who, maxLength)", () => {
        const missing = Object.keys(en).filter((k) => !noteOf(k)?.where)
        expect(missing, `add notes for:\n${missing.join("\n")}`).toEqual([])
    })

    it("every literal t(\"ns.key\") in the code exists in English", () => {
        const missing: string[] = []
        const walk = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                if (e.name === "node_modules" || e.name.startsWith(".")) continue
                const abs = join(dir, e.name)
                if (e.isDirectory()) walk(abs)
                else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !abs.includes("__tests__")) {
                    for (const { key, line } of usedKeys(abs, readFileSync(abs, "utf8"))) {
                        if (!key.includes(".")) continue // not a catalogue key (e.g. a local helper named t)
                        if (key in en || `${key}_other` in en || `${key}_one` in en) continue
                        missing.push(`${toRepoPath(abs)}:${line} ${key}`)
                    }
                }
            }
        }
        walk(join(REPO_ROOT, "src"))
        expect(missing).toEqual([])
    })

    it.runIf(REQUIRE_HE)("every English key has a Hebrew entry (I18N_REQUIRE_HE=1)", () => {
        const missing = Object.keys(en).filter((k) => {
            if (noteOf(k)?.translate === false) return false
            if (k in he) return false
            // A plural English key is covered by any Hebrew variant of the same base.
            if (PLURAL_SUFFIX.test(k)) return !Object.keys(he).some((h) => baseKey(h) === baseKey(k))
            return true
        })
        expect(missing, `translate:\n${missing.join("\n")}`).toEqual([])
    })
})
