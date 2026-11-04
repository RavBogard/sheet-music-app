import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

// Recording fakes: the builders run here without a Firestore, so the test can
// read the constraints each one puts on its query.
vi.mock("firebase/firestore", () => ({
    collection: (_db: unknown, path: string) => ({ path }),
    query: (col: { path: string }, ...cs: unknown[]) => ({ path: col.path, cs }),
    where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
    orderBy: (f: string, dir = "asc") => ({ orderBy: [f, dir] }),
    limit: (n: number) => ({ limit: n }),
    Timestamp: { fromDate: (d: Date) => d },
}))

import * as tenantQueryModule from "@/lib/tenant-query"
import { CLIENT_QUERIES, ORG_FILTER_EXCEPTIONS, TENANT_COLLECTIONS } from "@/lib/tenant-query"

/**
 * Static guard for client tenant queries (setlist sync redesign PR 2).
 *
 * The list rule of every tenant collection reads `resource.data.orgId`, so a
 * client query that does not pin orgId is refused for everyone but the
 * platform owner. The live tracks listener shipped without it and no band
 * device got live rows for three weeks. This test fails on any client
 * `collection(...)` over a tenant collection, or any `collectionGroup(...)`,
 * built outside `src/lib/tenant-query.ts`, however the SDK function is
 * reached (named, renamed, namespace or dynamic import). ESLint bans the
 * imports themselves (eslint.config.mjs); this scan is the second net.
 *
 * Passes: writes (`addDoc(collection(...))`), non-tenant collections and
 * fully resolved subcollection paths. A line the scan cannot prove carries
 * `// tenant-scan-allow: <reason>` on the line above.
 */

const ROOT = process.cwd()
const SRC = resolve(ROOT, "src")

// ── firestore.rules ───────────────────────────────────────────────────────

/** Top-level collections whose list rule reads `resource.data` but are not
 *  tenant collections, each with why. */
const NON_TENANT_LIST_READERS: Record<string, string> = {
    memberships: "list keyed on the caller's own uid or tenantId (bl+); read by the server's people routes",
}

/** Index of the brace matching the one at `open`. */
function matchBrace(src: string, open: number): number {
    let depth = 0
    for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++
        else if (src[i] === "}" && --depth === 0) return i
    }
    return src.length - 1
}

/** `match /path {` blocks directly inside `text` (nested ones excluded from
 *  each block's own body). */
function directMatches(text: string): Array<{ path: string; body: string }> {
    const out: Array<{ path: string; body: string }> = []
    const re = /match\s+(\/\S+)\s+\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
        const open = m.index + m[0].length - 1
        const close = matchBrace(text, open)
        let body = text.slice(open + 1, close)
        // drop nested match blocks from this block's own rules
        let nested: RegExpExecArray | null
        const nre = /match\s+\/\S+\s+\{/g
        while ((nested = nre.exec(body))) {
            const o = nested.index + nested[0].length - 1
            const c = matchBrace(body, o)
            body = body.slice(0, nested.index) + body.slice(c + 1)
            nre.lastIndex = nested.index
        }
        out.push({ path: m[1], body })
        re.lastIndex = close + 1
    }
    return out
}

const READS_RESOURCE = /(?<!request\.)resource\.data/

/** Rules functions whose body reads the stored doc, transitively. */
function resourceReadingFunctions(rules: string): Set<string> {
    const fns = new Map<string, string>()
    const re = /function\s+(\w+)\s*\([^)]*\)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rules))) {
        const open = m.index + m[0].length - 1
        fns.set(m[1], rules.slice(open + 1, matchBrace(rules, open)))
    }
    const reads = new Set<string>()
    let grew = true
    while (grew) {
        grew = false
        for (const [name, body] of fns) {
            if (reads.has(name)) continue
            const calls = [...body.matchAll(/\b(\w+)\s*\(/g)].map((c) => c[1])
            if (READS_RESOURCE.test(body) || calls.some((c) => reads.has(c))) {
                reads.add(name)
                grew = true
            }
        }
    }
    return reads
}

/** Top-level collections whose `list` (or `read`) rule reads the stored doc,
 *  directly or through a helper function. */
function listRulesReadingDoc(rules: string): string[] {
    const docsOpen = rules.indexOf("{", rules.indexOf("/documents", rules.indexOf("match /databases/")))
    const docs = rules.slice(docsOpen + 1, matchBrace(rules, docsOpen))
    const fns = resourceReadingFunctions(rules)
    const out = new Set<string>()
    for (const { path, body } of directMatches(docs)) {
        const seg = /^\/([A-Za-z_-]+)\/\{[^}]+\}$/.exec(path)
        if (!seg) continue // multi-segment top-level paths are subcollections or fixed docs
        for (const a of body.matchAll(/allow\s+([\w\s,]+?)\s*:\s*if\s+([^;]*);/g)) {
            const verbs = a[1].split(",").map((v) => v.trim())
            if (!verbs.includes("list") && !verbs.includes("read")) continue
            const expr = a[2]
            const calls = [...expr.matchAll(/\b(\w+)\s*\(/g)].map((c) => c[1])
            if (READS_RESOURCE.test(expr) || calls.some((c) => fns.has(c))) out.add(seg[1])
        }
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
        /\.(test|spec)\.tsx?$/.test(rel)
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

const SDK = String.raw`['"]firebase/firestore['"]`
const FNS = /^(collection|collectionGroup)$/

/** Local names that reach the SDK's collection / collectionGroup. */
function sdkNames(src: string): { names: Set<string>; groups: Set<string>; namespaces: Set<string> } {
    const names = new Set(["collection"])
    const groups = new Set(["collectionGroup"])
    const namespaces = new Set<string>()
    const add = (orig: string, local: string) => (orig === "collectionGroup" ? groups : names).add(local)
    // `{ collection as x }` (static) and `{ collection: x }` (destructured)
    for (const m of src.matchAll(/\b(collection(?:Group)?)\s+as\s+([\w$]+)/g)) add(m[1], m[2])
    for (const m of src.matchAll(/\{([^{}]*)\}\s*(?:=|\)\s*=>)/g)) {
        for (const p of m[1].matchAll(/\b(collection(?:Group)?)\s*:\s*([\w$]+)/g)) add(p[1], p[2])
    }
    // namespaces: `import * as fs from`, `const fs = await import(...)`, `.then((fs) =>`
    for (const m of src.matchAll(new RegExp(String.raw`import\s+\*\s+as\s+([\w$]+)\s+from\s+${SDK}`, "g"))) namespaces.add(m[1])
    for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?import\(\s*${SDK}\s*\)`, "g"))) namespaces.add(m[1])
    for (const m of src.matchAll(new RegExp(String.raw`import\(\s*${SDK}\s*\)\s*\.then\(\s*\(?\s*([\w$]+)`, "g"))) namespaces.add(m[1])
    // aliases of a member: `const c = fs.collection`, `= (await import(...)).collection`
    for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*[^;\n]*?\.(collection(?:Group)?)\b(?!\s*\()/g)) add(m[2], m[1])
    return { names, groups, namespaces }
}

function escapeRe(s: string): string {
    return s.replace(/[$]/g, "\\$")
}

interface Violation {
    line: number
    text: string
    why: string
}

/** Every tenant-collection list query in one source file. */
function findViolations(src: string): Violation[] {
    const out: Violation[] = []
    const { names, groups, namespaces } = sdkNames(src)
    const lines = src.split("\n")
    const callees: string[] = [
        ...[...names, ...groups].map((n) => String.raw`(?<![.\w$])${escapeRe(n)}`),
        ...[...namespaces].map((ns) => String.raw`(?<![.\w$])${escapeRe(ns)}\s*\.\s*collection(?:Group)?`),
        String.raw`\(\s*await\s+import\(\s*${SDK}\s*\)\s*\)\s*\.\s*collection(?:Group)?`,
        String.raw`import\(\s*${SDK}\s*\)\s*\.\s*collection(?:Group)?`,
    ]
    const callRe = new RegExp(String.raw`(${callees.join("|")})\s*\(`, "g")
    for (const m of src.matchAll(callRe)) {
        const at = m.index ?? 0
        const line = src.slice(0, at).split("\n").length
        const raw = lines[line - 1]
        const text = raw.trim()
        if (/^\s*(\*|\/\/|\/\*)/.test(raw)) continue // a comment
        if (/(^|\n)\s*\/\/\s*tenant-scan-allow:\s*\S/.test(lines[line - 2] ?? "")) continue
        const callee = m[1].replace(/\s+/g, "")
        const isGroup = groups.has(callee) || /collectionGroup$/.test(callee)
        if (isGroup) {
            out.push({ line, text, why: "collectionGroup query outside tenant-query.ts" })
            continue
        }
        const args = splitTopLevel(argsAt(src, at + m[0].length - 1))
        if (args.length < 2) continue // not a Firestore collection() call
        const before = src.slice(Math.max(0, at - 12), at)
        if (/addDoc\(\s*$/.test(before)) continue // a write, not a list
        const segs = args.slice(1).map((a) => (a.startsWith("...") ? null : resolveSegment(src, a)))
        const first = segs[0]?.split("/").filter(Boolean)[0] ?? null
        if (first === null) {
            out.push({ line, text, why: "collection path not resolvable; build it in tenant-query.ts" })
            continue
        }
        if (!TENANT.has(first)) continue // a non-tenant collection or its subcollections
        const extra = segs.slice(1)
        const flat = segs.flatMap((s) => (s === null ? [null] : s.split("/").filter(Boolean)))
        if (extra.some((s) => s === null)) {
            // an unresolved segment may be "" and collapse the path onto the tenant collection
            out.push({ line, text, why: `unresolved segment under tenant collection '${first}'` })
        } else if (flat.length === 1) {
            out.push({ line, text, why: `tenant collection '${first}' queried outside tenant-query.ts` })
        }
    }
    for (const m of src.matchAll(/(?<![.\w$])tenantQuery\s*\(/g)) {
        const line = src.slice(0, m.index ?? 0).split("\n").length
        if (/^\s*(\*|\/\/|import\b)/.test(lines[line - 1])) continue
        out.push({ line, text: lines[line - 1].trim(), why: "tenantQuery called outside tenant-query.ts; add a builder to CLIENT_QUERIES" })
    }
    return out
}

function clientFiles(): string[] {
    return walk(SRC).filter((p) => !isExcluded(relative(ROOT, p).replace(/\\/g, "/")))
}

describe("firestore.rules", () => {
    it("every top-level list rule that reads the stored doc is a tenant collection or on the non-tenant allowlist", () => {
        const rules = readFileSync(resolve(ROOT, "firestore.rules"), "utf8")
        const derived = listRulesReadingDoc(rules)
        for (const name of Object.keys(NON_TENANT_LIST_READERS)) expect(derived).toContain(name)
        expect([...TENANT_COLLECTIONS].sort()).toEqual(derived.filter((c) => !(c in NON_TENANT_LIST_READERS)))
    })

    it("sees through a helper function", () => {
        const rules = [
            "service cloud.firestore { match /databases/{database}/documents {",
            "  function mine() { return resource.data.owner == request.auth.uid; }",
            "  function indirect() { return mine(); }",
            "  match /widgets/{id} { allow list: if indirect(); }",
            "  match /gadgets/{id} { allow create: if request.resource.data.x == 1; allow read: if true; }",
            "  match /things/{id} { allow read: if false; match /sub/{s} { allow read: if resource.data.a == 1; } }",
            "} }",
        ].join("\n")
        expect(listRulesReadingDoc(rules)).toEqual(["widgets"])
    })
})

describe("client tenant-query scan", () => {
    const flagged = (src: string) => findViolations(src).length

    it("catches every known evasion", () => {
        // the listener bug itself
        expect(flagged(`onSnapshot(query(collection(db, 'tracks'), where('setlistId', '==', id)))`)).toBe(1)
        // static rename
        expect(flagged(`import { collection as fsCollection } from 'firebase/firestore'\nquery(fsCollection(db, "songs"))`)).toBe(1)
        // same-file const
        expect(flagged(`const C = "setlists"\nconst r = collection(db, C).withConverter(x)`)).toBe(1)
        // unresolvable path
        expect(flagged(`getDocs(collection(db, name))`)).toBe(1)
        expect(flagged(`getDocs(collection(db, ...parts))`)).toBe(1)
        // collectionGroup, named and renamed
        expect(flagged(`getDocs(collectionGroup(db, 'history'))`)).toBe(1)
        expect(flagged(`import { collectionGroup as cg } from "firebase/firestore"\ngetDocs(cg(db, 'x'))`)).toBe(1)
        // namespace import
        expect(flagged(`import * as fs from "firebase/firestore"\ngetDocs(fs.collection(db, "tracks"))`)).toBe(1)
        expect(flagged(`import * as fs from "firebase/firestore"\ngetDocs(fs.collectionGroup(db, "tracks"))`)).toBe(1)
        // dynamic import: destructure with a rename, namespace, member, .then
        expect(flagged(`const { getDocs, collection: col } = await import("firebase/firestore")\ngetDocs(col(db, "tracks"))`)).toBe(1)
        expect(flagged(`const fs = await import("firebase/firestore")\nfs.collection(db, "songs")`)).toBe(1)
        expect(flagged(`const c = (await import("firebase/firestore")).collection\nc(db, "songs")`)).toBe(1)
        expect(flagged(`(await import("firebase/firestore")).collection(db, "songs")`)).toBe(1)
        expect(flagged(`import("firebase/firestore").then(({ collection: k }) => getDocs(k(db, "tracks")))`)).toBe(1)
        expect(flagged(`import("firebase/firestore").then((fs) => getDocs(fs.collection(db, "tracks")))`)).toBe(1)
        // a line that starts with import(
        expect(flagged(`import("firebase/firestore").then(({ collection }) =>\n  collection(db, "tracks"))`)).toBe(1)
        // an unresolved extra segment under a tenant collection ("" collapses the path)
        expect(flagged(`collection(db, "tracks", maybeEmpty)`)).toBe(1)
        expect(flagged(`collection(db, "setlists", id, "history")`)).toBe(1)
        // an allow marker with no reason does not count
        expect(flagged(`// tenant-scan-allow:\ncollection(db, "setlists", id, "history")`)).toBe(1)
        // tenantQuery used directly instead of through a registered builder
        expect(flagged(`tenantQuery(db, "tracks", org)`)).toBe(1)
    })

    it("lets writes, resolved subcollections, non-tenant collections and reasoned lines through", () => {
        expect(findViolations(`const C = "setlists"\nawait addDoc(collection(db, C), data)`)).toEqual([])
        expect(findViolations(`query(collection(db, 'setlists', 'sl-1', 'history'), limit(5))`)).toEqual([])
        expect(findViolations(`query(collection(db, 'users', uid, 'notifications'))`)).toEqual([])
        expect(findViolations(`addDoc(collection(db, "monitor-live", "commands", "pending"), {})`)).toEqual([])
        expect(findViolations(`db.collection("tracks").where("setlistId", "==", id)`)).toEqual([])
        expect(findViolations(`// tenant-scan-allow: admin-only history panel\nquery(collection(db, "setlists", id, "history"))`)).toEqual([])
        expect(findViolations(`interface Db { collection(name: string): Ref }`)).toEqual([])
    })

    it("finds no tenant-collection query built outside tenant-query.ts", () => {
        const files = clientFiles()
        expect(files.length).toBeGreaterThan(100)
        const found: string[] = []
        for (const f of files) {
            for (const v of findViolations(readFileSync(f, "utf8"))) {
                found.push(`${relative(ROOT, f).replace(/\\/g, "/")}:${v.line} ${v.why}: ${v.text}`)
            }
        }
        expect(found).toEqual([])
    })
})

describe("tenant-query builders", () => {
    it("every builder in tenant-query.ts is in CLIENT_QUERIES (the emulator matrix runs them all)", () => {
        const builders = Object.entries(tenantQueryModule)
            .filter(([name, v]) => typeof v === "function" && name !== "tenantQuery")
            .map(([name]) => name)
            .sort()
        expect(Object.keys(CLIENT_QUERIES).sort()).toEqual(builders)
    })

    const ARGS: Record<keyof typeof CLIENT_QUERIES, unknown[]> = {
        setlistTracksQuery: ["crc", "sl-1"],
        tracksByMomentQuery: ["crc", "m-1"],
        tracksByUnitsQuery: ["crc", ["u-1"]],
        recentSetlistsQuery: ["crc", 10],
        upcomingSetlistsQuery: ["crc", new Date(0)],
        songsQuery: ["crc"],
        templatesQuery: ["crc"],
        recordingsQuery: ["crc"],
        recordingsForSongQuery: ["crc", "song-1"],
        auditLogsQuery: ["crc", 20],
        partPresetsQuery: ["crc"],
        lastSyncRunQuery: ["crc"],
        tenantAssignmentsQuery: ["crc"],
        myAssignmentsQuery: ["uid-1"],
        sharedCollectionsQuery: ["sharedWith", "crc"],
        sharedLibraryRowsQuery: ["crc"],
    }

    it("a builder without the orgId filter first is on ORG_FILTER_EXCEPTIONS, with a reason", () => {
        const lacking: string[] = []
        for (const [name, build] of Object.entries(CLIENT_QUERIES)) {
            const q = (build as unknown as (...a: unknown[]) => { cs: Array<{ where?: unknown[] }> })({}, ...ARGS[name as keyof typeof CLIENT_QUERIES])
            const first = q.cs[0]?.where
            if (!(first && first[0] === "orgId" && first[1] === "==" && first[2] === "crc")) lacking.push(name)
        }
        expect(lacking.sort()).toEqual(Object.keys(ORG_FILTER_EXCEPTIONS).sort())
        for (const why of Object.values(ORG_FILTER_EXCEPTIONS)) expect(why.length).toBeGreaterThan(20)
    })
})
