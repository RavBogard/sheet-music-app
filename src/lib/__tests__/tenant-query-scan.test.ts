import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import * as tenantQueryModule from "@/lib/tenant-query"
import { CLIENT_QUERIES, TENANT_COLLECTIONS } from "@/lib/tenant-query"

/**
 * Static guard for client tenant queries (setlist sync redesign PR 2).
 *
 * The list rule of every tenant collection reads `resource.data.orgId`, so a
 * client query that does not pin orgId is refused for everyone but the
 * platform owner. The live tracks listener shipped without it and no band
 * device got live rows for three weeks. This test fails on any client
 * `collection(...)` over a tenant collection, or any `collectionGroup(...)`,
 * built outside `src/lib/tenant-query.ts`. Writes (`addDoc(collection(...))`)
 * and subcollection paths are not list queries and pass.
 */

const ROOT = process.cwd()
const SRC = resolve(ROOT, "src")

// ── The tenant collections, derived from firestore.rules ──────────────────

/** Top-level `match /<name>/{id}` blocks (4-space indent) whose list rule is
 *  tenant-scoped: `listOrg()`, or `ownerOrgId` for chart collections. */
function tenantCollectionsFromRules(rules: string): string[] {
    const lines = rules.split(/\r?\n/)
    const out = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
        const m = /^ {4}match \/([A-Za-z_-]+)\/\{[^}]+\}\s*\{/.exec(lines[i])
        if (!m) continue
        let body = lines[i]
        for (let j = i + 1; j < lines.length && !/^ {4}(match |\})/.test(lines[j]); j++) body += "\n" + lines[j]
        if (/listOrg\(\)|resource\.data\.ownerOrgId/.test(body)) out.add(m[1])
    }
    return [...out].sort()
}

// ── The scan ──────────────────────────────────────────────────────────────

const TENANT = new Set<string>(TENANT_COLLECTIONS)

function isExcluded(rel: string): boolean {
    return (
        rel === "src/lib/tenant-query.ts" ||
        rel.startsWith("src/app/api/") ||
        rel.startsWith("src/lib/mcp/") ||
        rel.startsWith("src/test/") ||
        rel.includes("/__tests__/") ||
        /\.(test|spec)\.tsx?$/.test(rel) ||
        rel.endsWith(".util.ts")
    )
}

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(name)) out.push(p)
    }
    return out
}

/** The text between the parenthesis at `open` and its match. */
function argsAt(src: string, open: number): string {
    let depth = 0
    for (let i = open; i < src.length; i++) {
        if (src[i] === "(") depth++
        else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i)
    }
    return src.slice(open + 1)
}

function splitTopLevel(args: string): string[] {
    const out: string[] = []
    let depth = 0
    let cur = ""
    for (const ch of args) {
        if ("([{".includes(ch)) depth++
        else if (")]}".includes(ch)) depth--
        if (ch === "," && depth === 0) {
            out.push(cur.trim())
            cur = ""
        } else cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
    return out
}

/** A path segment's value: a string literal, or a same-file string const. */
function resolveSegment(src: string, expr: string): string | null {
    const lit = /^(['"`])([^'"`$]*)\1$/.exec(expr)
    if (lit) return lit[2]
    if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
        const c = new RegExp(`const\\s+${expr}\\s*(?::[^=]+)?=\\s*(['"\`])([^'"\`]*)\\1`).exec(src)
        if (c) return c[2]
    }
    return null
}

interface Violation {
    line: number
    text: string
    why: string
}

/** Every tenant-collection list query in one client source file. */
function findViolations(src: string): Violation[] {
    const out: Violation[] = []
    const names = new Set(["collection"])
    const groupNames = new Set(["collectionGroup"])
    for (const m of src.matchAll(/\bcollection\s+as\s+(\w+)/g)) names.add(m[1])
    for (const m of src.matchAll(/\bcollectionGroup\s+as\s+(\w+)/g)) groupNames.add(m[1])
    const callRe = new RegExp(`(^|[^.\\w$])(${[...names, ...groupNames].join("|")})\\s*\\(`, "g")
    for (const m of src.matchAll(callRe)) {
        const fn = m[2]
        const at = (m.index ?? 0) + m[1].length
        const line = src.slice(0, at).split("\n").length
        const text = src.split("\n")[line - 1].trim()
        // Imports, type positions and comments are not calls.
        if (/^\s*(\*|\/\/|import\b)/.test(src.split("\n")[line - 1])) continue
        if (groupNames.has(fn)) {
            out.push({ line, text, why: "collectionGroup query outside tenant-query.ts" })
            continue
        }
        const args = splitTopLevel(argsAt(src, src.indexOf("(", at)))
        if (args.length < 2) continue
        const segs = args.slice(1).flatMap((a) => {
            const v = resolveSegment(src, a)
            return v === null ? [null] : v.split("/").filter(Boolean)
        })
        const first = segs[0]
        if (segs.length > 1 && first !== null) continue // a subcollection or doc path
        const before = src.slice(Math.max(0, at - 12), at)
        if (/addDoc\(\s*$/.test(before)) continue // a write, not a list
        if (first === null) out.push({ line, text, why: "collection path not resolvable; build it in tenant-query.ts" })
        else if (TENANT.has(first)) out.push({ line, text, why: `tenant collection '${first}' queried outside tenant-query.ts` })
    }
    return out
}

function clientFiles(): string[] {
    return walk(SRC).filter((p) => {
        const rel = relative(ROOT, p).replace(/\\/g, "/")
        if (isExcluded(rel)) return false
        return /["']firebase\/firestore["']/.test(readFileSync(p, "utf8"))
    })
}

describe("tenant collections", () => {
    it("TENANT_COLLECTIONS matches the tenant-scoped list rules in firestore.rules", () => {
        const rules = readFileSync(resolve(ROOT, "firestore.rules"), "utf8")
        expect([...TENANT_COLLECTIONS].sort()).toEqual(tenantCollectionsFromRules(rules))
    })
})

describe("client tenant-query scan", () => {
    it("catches the listener bug and the other shapes it must refuse", () => {
        expect(findViolations(`onSnapshot(query(collection(db, 'tracks'), where('setlistId', '==', id)))`)).toHaveLength(1)
        expect(findViolations(`import { collection as fsCollection } from 'firebase/firestore'\nquery(fsCollection(db, "songs"))`)).toHaveLength(1)
        expect(findViolations(`const C = "setlists"\nconst r = collection(db, C).withConverter(x)`)).toHaveLength(1)
        expect(findViolations(`getDocs(collection(db, name))`)).toHaveLength(1)
        expect(findViolations(`getDocs(collectionGroup(db, 'history'))`)).toHaveLength(1)
    })

    it("lets writes, subcollections and non-tenant collections through", () => {
        expect(findViolations(`const C = "setlists"\nawait addDoc(collection(db, C), data)`)).toEqual([])
        expect(findViolations(`query(collection(db, 'setlists', id, 'history'), limit(5))`)).toEqual([])
        expect(findViolations(`query(collection(db, 'users', uid, 'notifications'))`)).toEqual([])
        expect(findViolations(`addDoc(collection(db, "monitor-live", "commands", "pending"), {})`)).toEqual([])
        expect(findViolations(`db.collection("tracks").where("setlistId", "==", id)`)).toEqual([])
    })

    it("finds no tenant-collection query built outside tenant-query.ts", () => {
        const files = clientFiles()
        expect(files.length).toBeGreaterThan(10)
        const found: string[] = []
        for (const f of files) {
            for (const v of findViolations(readFileSync(f, "utf8"))) {
                found.push(`${relative(ROOT, f).replace(/\\/g, "/")}:${v.line} ${v.why}: ${v.text}`)
            }
        }
        expect(found).toEqual([])
    })

    it("every builder in tenant-query.ts is in CLIENT_QUERIES (the emulator matrix runs them all)", () => {
        const builders = Object.entries(tenantQueryModule)
            .filter(([name, v]) => typeof v === "function" && name !== "tenantQuery")
            .map(([name]) => name)
            .sort()
        expect(Object.keys(CLIENT_QUERIES).sort()).toEqual(builders)
    })
})
