import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * OPS-CONTRACT §Single writer: `src/lib/setlist-ops/` is the ONLY code that
 * writes `setlists/*` or `tracks/*` (Admin or client SDK). Everything else
 * goes through it, so every write carries the stamps receivers compare.
 *
 * The scan finds, per CALL SITE, Firestore writes on those two collections:
 *   - chained:   db.collection("tracks").doc(id).update(...), db.doc(`tracks/${id}`).set(...)
 *   - sink call: tx.update(<doc ref>, ...), batch.set(...), bulkWriter.delete(...)
 *   - client:    setDoc/updateDoc/deleteDoc(doc(db, "tracks", id)), addDoc(collection(db, "setlists"))
 *   - through a variable, an arrow/function helper, or a collection variable
 *     that holds such a ref (including a runtime collection name)
 *   - through `.ref` of a doc read from a tracks/setlists query
 *   - `recursiveDelete(...)` in a file that names either collection
 *   - the module's internal refs imported from outside it
 * The collection may be named by a literal, a template literal or a constant.
 * Subcollections (`setlists/{id}/history`, …) are not the setlist doc.
 *
 * ALLOWLIST is per call site: the write's line, or the line above it, carries
 *   // setlist-ops-allowlist: remove in PR 3 (<why>)
 * A marker with no write under it fails the stale-marker test.
 *
 * A call site the scan flags that is NOT a setlists/tracks write (a bulk delete
 * of another collection in a file that also reads setlists) carries instead
 *   // setlist-ops-not-a-setlist-write: <what it writes>
 * and that marker does not cover a write whose target names setlists, tracks,
 * setlistRef or trackRef.
 *
 * `maintainSetlist(..., { bump: false })` writes with no stamps; every such
 * call carries `// no-bump: <why nobody renders the field>` on its line or the
 * line above, `bump` is only ever a literal, and the maintenance helpers'
 * options are inline object literals with no spread. The module's unstamped
 * writes (`writeSetlistUnstamped`, `writeSetlistDerived`) are never used
 * outside it.
 */

const ROOT = resolve(process.cwd(), "src")
const MODULE_DIR = "lib/setlist-ops/"
const MARKER = "setlist-ops-allowlist: remove in PR 3"
const NOT_A_SETLIST = /setlist-ops-not-a-setlist-write:\s*\S.{4,}/
const NO_BUMP = /\/\/\s*no-bump:\s*\S.{9,}/

const W = String.raw`(?:set|update|delete|create)`
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Comments are not code. Block comments keep their newlines so line numbers hold. */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
}

export interface WriteSite {
    line: number
    why: string
    text: string
}

export function findWriteSites(raw: string): WriteSite[] {
    const src = stripComments(raw)
    const consts = [
        ...src.matchAll(/(?:const|let)\s+(\w+)\s*(?::\s*string\s*)?=\s*["'`](?:tracks|setlists)["'`]/g),
    ].map((m) => esc(m[1]))
    const NAME = String.raw`(?:["'\`](?:tracks|setlists)["'\`]` + (consts.length ? `|${consts.join("|")}` : "") + ")"
    const COL = String.raw`collection\(\s*(?:\w+\s*,\s*)?` + NAME + String.raw`\s*\)`
    const ARGS = String.raw`[^()]*(?:\([^()]*\)[^()]*)*`
    const ADMIN_DOC = String.raw`(?:[\w.]+\.)?` + COL + String.raw`\s*\.doc\(` + ARGS + String.raw`\)(?!\s*\.collection)`
    /** db.doc(`tracks/${id}`) or db.doc("tracks/" + id) — exactly one segment after the collection. */
    const PATH_DOC = String.raw`(?:[\w.]+\.)?doc\(\s*(?:\w+\s*,\s*)?(?:\`(?:tracks|setlists)\/[^\`/]*\`|["'](?:tracks|setlists)\/["']\s*\+\s*[\w.]+(?:\([^()]*\))?)\s*\)`
    /** doc(db, "tracks", id) — exactly three args. */
    const CLIENT_DOC = String.raw`doc\(\s*\w+\s*,\s*` + NAME + String.raw`\s*,\s*[^,()]+(?:\([^()]*\))?\s*\)`
    /** doc(db, row.collection, row.docId) — the outbox adapter's runtime collection. */
    const DYN_DOC = String.raw`doc\(\s*\w+\s*,\s*[\w.]+\.collection\s*,[^()]*\)`
    const DOC = `(?:${ADMIN_DOC}|${PATH_DOC}|${CLIENT_DOC})`

    const sites: WriteSite[] = []
    const lineOf = (i: number) => src.slice(0, i).split("\n").length
    const scan = (why: string, re: RegExp) => {
        for (const m of src.matchAll(new RegExp(re.source, "g"))) {
            // Report the line of the write call itself, not of any leading ref text.
            sites.push({ line: lineOf(m.index ?? 0), why, text: m[0].slice(0, 90).replace(/\s+/g, " ") })
        }
    }
    scan("chained", new RegExp(`${DOC}\\s*\\.${W}\\(`))
    scan("sink", new RegExp(`\\.${W}\\(\\s*${DOC}`))
    scan("client", new RegExp(`(?:setDoc|updateDoc|deleteDoc)\\(\\s*${DOC}`))
    scan("client-add", new RegExp(`addDoc\\(\\s*${COL}`))
    scan("module-ref", new RegExp(`(?:trackRef|setlistRef)\\([^()]*\\)\\s*\\.${W}\\(|\\.${W}\\(\\s*(?:trackRef|setlistRef)\\(`))
    scan("module-import", /import\s*(?:type\s*)?\{[^}]*\b(?:trackRef|setlistRef)\b[^}]*\}\s*from\s*["'](?:@\/lib\/setlist-ops[^"']*|\.{1,2}\/[^"']*setlist-ops[^"']*)["']/)
    if (new RegExp(NAME).test(src)) scan("recursiveDelete", /\brecursiveDelete\s*\(/)

    // Variables and helpers holding a doc ref (literal, path, client or runtime collection).
    const REF = `(?:${DOC}|${DYN_DOC})`
    for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?` + REF, "g"))) {
        const v = esc(m[1])
        scan(`doc-var ${m[1]}`, new RegExp(`\\b${v}\\s*\\.${W}\\(|\\.${W}\\(\\s*${v}\\b(?!\\s*\\.)|(?:setDoc|updateDoc|deleteDoc)\\(\\s*${v}\\b|recursiveDelete\\(\\s*${v}\\b`))
    }
    const HELPER = String.raw`(?:(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{?\s*(?:return\s+)?|function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+)` + REF
    for (const m of src.matchAll(new RegExp(HELPER, "g"))) {
        const v = esc(m[1] ?? m[2])
        scan(`ref-helper ${m[1] ?? m[2]}`, new RegExp(`\\b${v}\\(${ARGS}\\)\\s*\\.${W}\\(|\\.${W}\\(\\s*${v}\\(|(?:setDoc|updateDoc|deleteDoc)\\(\\s*${v}\\(`))
    }
    for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*=\s*(?:[\w.]+\.)?` + COL + String.raw`(?!\s*\.)`, "g"))) {
        const v = esc(m[1])
        scan(`collection-var ${m[1]}`, new RegExp(`\\b${v}\\.doc\\([^)]*\\)\\s*\\.${W}\\(|\\.${W}\\(\\s*${v}\\.doc\\(|addDoc\\(\\s*${v}\\b|(?:setDoc|updateDoc|deleteDoc)\\(\\s*doc\\(\\s*${v}\\b`))
    }

    // `.ref` of a doc read from a tracks/setlists query.
    if (new RegExp(`${COL}\\s*\\.(?:where|orderBy|limit|get)\\b|query\\(\\s*${COL}`).test(src)) {
        scan("query-ref", new RegExp(`\\.${W}\\(\\s*\\w+\\.ref\\b|\\b\\w+\\.ref\\s*\\.${W}\\(`))
    }
    // One site per line.
    const seen = new Set<number>()
    return sites.filter((s) => (seen.has(s.line) ? false : (seen.add(s.line), true))).sort((a, b) => a.line - b.line)
}

/** Sites without an allowlist marker on their line or the line above, and markers covering nothing. */
export function checkFile(raw: string): { unmarked: WriteSite[]; staleMarkers: number[] } {
    const lines = raw.split(/\r?\n/)
    const code = stripComments(raw).split("\n")
    const hasPr3 = (n: number) => !!lines[n - 1]?.includes(MARKER)
    const hasNot = (n: number) => NOT_A_SETLIST.test(lines[n - 1] ?? "")
    const has = (n: number) => hasPr3(n) || hasNot(n)
    // A not-a-setlist marker never covers a write whose target names the collections.
    const namesSetlist = (n: number) => /setlists|tracks|setlistRef|trackRef/.test(code[n - 1] ?? "")
    const marked = (n: number) =>
        hasPr3(n) || hasPr3(n - 1) || ((hasNot(n) || hasNot(n - 1)) && !namesSetlist(n))
    const sites = findWriteSites(raw)
    const unmarked = sites.filter((s) => !marked(s.line))
    const used = new Set<number>()
    for (const s of sites) {
        if (has(s.line)) used.add(s.line)
        if (has(s.line - 1)) used.add(s.line - 1)
    }
    const staleMarkers = lines.flatMap((l, i) => (has(i + 1) && !used.has(i + 1) ? [i + 1] : []))
    return { unmarked, staleMarkers }
}

/** The top-level arguments of a call whose `(` ends just before `start`. */
export function topLevelArgs(src: string, start: number): string[] {
    const args: string[] = []
    let depth = 0
    let cur = ""
    let quote: string | null = null
    for (let i = start; i < src.length; i++) {
        const ch = src[i]
        if (quote) {
            cur += ch
            if (ch === "\\") {
                cur += src[++i] ?? ""
                continue
            }
            if (ch === quote) quote = null
            continue
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            quote = ch
            cur += ch
            continue
        }
        if (ch === "(" || ch === "[" || ch === "{") depth++
        if (ch === ")" || ch === "]" || ch === "}") {
            if (depth === 0) {
                if (cur.trim()) args.push(cur)
                return args
            }
            depth--
        }
        if (ch === "," && depth === 0) {
            args.push(cur)
            cur = ""
            continue
        }
        cur += ch
    }
    return args
}

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
            if (name === "__tests__" || name === "node_modules" || name === "test-stubs") continue
            walk(p, out)
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
            out.push(p)
        }
    }
    return out
}

const files = walk(ROOT).map((p) => ({ rel: relative(ROOT, p).replace(/\\/g, "/"), src: readFileSync(p, "utf8") }))
const outside = files.filter((f) => !f.rel.startsWith(MODULE_DIR))

describe("OPS-CONTRACT single writer: only src/lib/setlist-ops writes setlists/* and tracks/*", () => {
    it("the scanner sees the write shapes it claims to (self-test)", () => {
        const hit = (s: string) => findWriteSites(s).length > 0
        expect(hit(`await db.collection("tracks").doc(id).update({ a: 1 })`)).toBe(true)
        expect(hit(`tx.update(db.collection("setlists").doc(setlistId), patch)`)).toBe(true)
        expect(hit(`const r = db.collection('tracks').doc(x)\nawait r.update({})`)).toBe(true)
        expect(hit(`const r = db.collection('tracks').doc(x)\ntx.delete(r)`)).toBe(true)
        expect(hit(`await updateDoc(doc(db, 'tracks', id), p)`)).toBe(true)
        expect(hit(`await addDoc(collection(db, "setlists"), p)`)).toBe(true)
        expect(hit(`const s = await tx.get(db.collection("tracks").where("setlistId","==",id))\ns.docs.forEach((d) => tx.delete(d.ref))`)).toBe(true)
        expect(hit(`const COLLECTION_PATH = 'setlists'\nawait addDoc(collection(db, COLLECTION_PATH), d)`)).toBe(true)
        expect(hit(`const ref = doc(firestoreDb, row.collection, row.docId)\nawait setDoc(ref, data)`)).toBe(true)
        // Reads, comments and subcollections are not writes on the setlist doc.
        expect(hit(`const s = await db.collection("tracks").doc(id).get()`)).toBe(false)
        expect(hit(`const r = db.collection("tracks").doc(id)\nconst s = await tx.get(r)`)).toBe(false)
        expect(hit(`await addDoc(collection(db, 'setlists', id, 'history'), e)`)).toBe(false)
        expect(hit(`await db.collection("setlists").doc(id).collection("performance").doc("x").set({})`)).toBe(false)
        expect(hit(`// tx.update(db.collection("tracks").doc(id), p) in a comment`)).toBe(false)
    })

    it("catches the five evasions the review listed", () => {
        const hit = (s: string) => findWriteSites(s).length > 0
        // 1. the module's internal ref, imported from outside
        expect(hit(`import { trackRef } from "@/lib/setlist-ops/writer"\nawait trackRef(db, id).update({ a: 1 })`)).toBe(true)
        // 2. a path doc
        expect(hit("await db.doc(`tracks/${id}`).update({ a: 1 })")).toBe(true)
        expect(hit(`await db.doc("setlists/" + id).set({})`)).toBe(true)
        // 3. a template-literal collection name
        expect(hit("await db.collection(`tracks`).doc(id).update({ a: 1 })")).toBe(true)
        // 4. an arrow helper that returns the ref
        expect(hit(`const ref = (id: string) => db.collection("tracks").doc(id)\nawait ref(x).update({ a: 1 })`)).toBe(true)
        expect(hit(`const ref = (id: string) => db.collection("tracks").doc(id)\ntx.update(ref(x), { a: 1 })`)).toBe(true)
        // 5. recursiveDelete
        expect(hit(`await db.recursiveDelete(db.collection("setlists").doc(id))`)).toBe(true)
    })

    it("a marker covers exactly the write under it, and a marker over nothing is stale", () => {
        const ok = checkFile(`// ${MARKER} (test)\nawait db.collection("tracks").doc(id).update({})`)
        expect(ok).toEqual({ unmarked: [], staleMarkers: [] })
        const stale = checkFile(`// ${MARKER} (test)\nconst x = 1\nawait db.collection("tracks").doc(id).update({})`)
        expect(stale.unmarked.length).toBe(1)
        expect(stale.staleMarkers).toEqual([1])
    })

    it("no file outside the module writes setlists/* or tracks/* at an unmarked call site", () => {
        const offenders = outside.flatMap((f) =>
            checkFile(f.src).unmarked.map((s) => `${f.rel}:${s.line} [${s.why}] ${s.text}`),
        )
        expect(offenders, offenders.join("\n")).toEqual([])
    })

    it("every bump:false maintenance write carries a no-bump justification", () => {
        const bare = outside.flatMap((f) => {
            const lines = f.src.split(/\r?\n/)
            const code = stripComments(f.src).split("\n")
            return code.flatMap((l, i) =>
                /\bbump\s*:\s*false\b/.test(l) && !NO_BUMP.test(lines[i]) && !NO_BUMP.test(lines[i - 1] ?? "")
                    ? [`${f.rel}:${i + 1}`]
                    : [],
            )
        })
        expect(bare, bare.join("\n")).toEqual([])
    })

    it("bump is only ever a literal, and maintenance options are inline literals with no spread", () => {
        const bad = outside.flatMap((f) => {
            const code = stripComments(f.src)
            const out: string[] = []
            const lineOf = (i: number) => code.slice(0, i).split("\n").length
            for (const m of code.matchAll(/\bbump\b(?!\s*:\s*(?:true|false)\b)/g)) out.push(`${f.rel}:${lineOf(m.index ?? 0)} non-literal bump`)
            if (/\bMaintainOptions\b/.test(code)) out.push(`${f.rel}: MaintainOptions used outside the module`)
            for (const m of code.matchAll(/\bmaintain(Setlist|Setlists|Rows)\s*(?:<[^()]*?>)?\s*\(/g)) {
                const args = topLevelArgs(code, (m.index ?? 0) + m[0].length)
                const optsAt = m[1] === "Setlist" ? 4 : 3
                const o = args[optsAt]
                if (o !== undefined && (!/^\s*\{/.test(o) || o.includes("..."))) {
                    out.push(`${f.rel}:${lineOf(m.index ?? 0)} options must be an inline literal without spread`)
                }
            }
            return out
        })
        expect(bad, bad.join("\n")).toEqual([])
    })

    it("the module's unstamped writes are never used outside it", () => {
        const bad = outside.flatMap((f) => {
            const code = stripComments(f.src)
            return /\.updateUnstamped\s*\(|\.updateSetlistDerived\s*\(|\bwriteSetlistUnstamped\b|\bwriteSetlistDerived\b/.test(code) ? [f.rel] : []
        })
        expect(bad, bad.join("\n")).toEqual([])
        const index = files.find((x) => x.rel === "lib/setlist-ops/index.ts")!.src
        expect(index).not.toMatch(/writeSetlistUnstamped|writeSetlistDerived/)
    })

    it("the guards above see what they claim to (self-test)", () => {
        // A not-a-setlist marker over a tracks write does not cover it.
        const misused = checkFile(`// setlist-ops-not-a-setlist-write: other docs\nfor (const t of q) bw.delete(db.collection("tracks").doc(t))`)
        expect(misused.unmarked.length).toBe(1)
        const fine = checkFile(`const s = await db.collection("setlists").get()\n// setlist-ops-not-a-setlist-write: token docs\nfor (const t of snap.docs) bw.delete(t.ref)`)
        expect(fine).toEqual({ unmarked: [], staleMarkers: [] })
        expect(topLevelArgs("a, (b, c), { d: [1, 2] }, e)", 0)).toEqual(["a", " (b, c)", " { d: [1, 2] }", " e"])
    })

    it("no allowlist marker is stale", () => {
        const stale = outside.flatMap((f) => checkFile(f.src).staleMarkers.map((n) => `${f.rel}:${n}`))
        expect(stale, stale.join("\n")).toEqual([])
    })

    it("the moved writers write through the module and carry no markers", () => {
        for (const rel of [
            "lib/mcp/server-tracks-write.ts",
            "lib/mcp/tools/setlist-write.ts",
            "lib/mcp/tools/liturgy-bindings.ts",
            "lib/mcp/tools/propose-changes.ts",
            "lib/setlist-write.ts",
            "lib/setlist-track-count.ts",
            "app/api/liturgy/bind-row/route.ts",
            "app/api/setlist/rename/route.ts",
            "app/api/setlist/transfer/route.ts",
            // PR 3b: the server stragglers.
            "lib/mcp/tools/clone-setlist.ts",
            "lib/mcp/tools/templates.ts",
            "lib/mcp/tools/performed.ts",
            "lib/mcp/tools/open-items.ts",
            "lib/mcp/tools/setlist-publish.ts",
            "lib/mcp/tools/setlist-hygiene.ts",
            "lib/mcp/tools/week-key-backfill.ts",
            "lib/mcp/tools/backfill-track-mimetype.ts",
            "lib/beit-mitzvah/service.ts",
            "lib/scheduling/assignment-service.ts",
            "app/api/setlist/delete/route.ts",
            "app/api/setlist/notify-band/route.ts",
        ]) {
            const f = files.find((x) => x.rel === rel)!
            expect(f.src, rel).toMatch(/from ["']@\/lib\/setlist-ops["']/)
            expect(findWriteSites(f.src), rel).toEqual([])
            expect(f.src.includes(MARKER), rel).toBe(false)
        }
    })

    it("PR 3: no browser file writes setlists/* or tracks/*, allowlisted or not", () => {
        const browser = files.filter(
            (f) =>
                f.rel.startsWith("components/") ||
                f.rel.startsWith("hooks/") ||
                f.rel.startsWith("lib/sync/") ||
                f.rel.startsWith("lib/local/") ||
                f.rel.startsWith("lib/setlist-ops-client/") ||
                ["lib/setlist-firebase.ts", "lib/live-director.ts"].includes(f.rel),
        )
        expect(browser.length).toBeGreaterThan(20)
        const hits = browser.flatMap((f) => [
            ...findWriteSites(f.src).map((s) => `${f.rel}:${s.line} [${s.why}]`),
            ...(f.src.includes(MARKER) ? [`${f.rel}: carries an allowlist marker`] : []),
        ])
        expect(hits, hits.join("\n")).toEqual([])
    })

    it("the module's public index does not export raw doc refs", () => {
        const index = files.find((x) => x.rel === "lib/setlist-ops/index.ts")!.src
        expect(index).not.toMatch(/\b(?:trackRef|setlistRef)\b\s*,|\b(?:trackRef|setlistRef)\s*\}/)
    })
})
