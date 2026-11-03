import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * OPS-CONTRACT §Single writer: `src/lib/setlist-ops/` is the ONLY code that
 * writes `setlists/*` or `tracks/*` (Admin or client SDK). Everything else
 * goes through it, so every write carries `updatedAt` + `version` and no
 * writer can drift past the stamps receivers compare.
 *
 * This scans src for Firestore writes on those two collections:
 *   - chained:   db.collection("tracks").doc(id).update(...)
 *   - sink call: tx.update(db.collection("tracks").doc(id), ...), batch.set(...)
 *   - client:    setDoc/updateDoc/deleteDoc(doc(db, "tracks", id), ...), addDoc(collection(db, "tracks"), ...)
 *   - via a variable holding such a doc ref or collection ref
 *   - via `.ref` of a doc read from a tracks/setlists query
 * Subcollections (`setlists/{id}/history`, …) are not the setlist doc and are
 * not counted.
 *
 * ALLOWLIST: each entry says why it is still here and when it goes. Removing
 * an entry once its file is clean is required (the stale-entry test fails).
 */

const ROOT = resolve(process.cwd(), "src")
const MODULE_DIR = "lib/setlist-ops/"

/**
 * `dynamic: true` marks a writer whose collection is a runtime value (the
 * client outbox adapter writes `doc(db, row.collection, row.docId)`), which
 * the scanner cannot see; it is exempt from the stale-entry check only.
 */
const ALLOWLIST: Record<string, { why: string; dynamic?: boolean }> = {
    // The contract's own allowlist: client outbox writers and client creation paths.
    "lib/sync/init.ts": { why: "client outbox adapter — remove in PR 3", dynamic: true },
    "lib/sync/track-count-sync.ts": { why: "client count reconcile (outbox side write) — remove in PR 3" },
    "lib/setlist-firebase.ts": { why: "client-side creation paths — remove in PR 3" },
    // Server writers outside PR 1's named scope. They still write raw and
    // move onto src/lib/setlist-ops with PR 3.
    "lib/mcp/tools/clone-setlist.ts": { why: "clone_setlist new-setlist batch — remove in PR 3" },
    "lib/mcp/tools/templates.ts": { why: "clone_setlist_from_template new-setlist batch — remove in PR 3" },
    "lib/mcp/tools/performed.ts": { why: "performed-service clone batch — remove in PR 3" },
    "lib/mcp/tools/open-items.ts": { why: "add/resolve_open_item setlist transaction — remove in PR 3" },
    "lib/mcp/tools/setlist-publish.ts": { why: "notify / publish-era setlist stamps — remove in PR 3" },
    "lib/mcp/tools/setlist-hygiene.ts": { why: "isTest hygiene backfill (migration) — remove in PR 3" },
    "lib/mcp/tools/week-key-backfill.ts": { why: "week-key backfill (migration) — remove in PR 3" },
    "lib/mcp/tools/backfill-track-mimetype.ts": { why: "mimetype backfill (migration) — remove in PR 3" },
    "lib/mcp/tools/test-tokens.ts": { why: "test-fixture cleanup deletes — remove in PR 3" },
    "lib/beit-mitzvah/service.ts": { why: "B'nei Mitzvah service creation — remove in PR 3" },
    "lib/scheduling/assignment-service.ts": { why: "assignment fields on the setlist doc — remove in PR 3" },
    "app/api/setlist/notify-band/route.ts": { why: "notify-band stamp on the setlist doc — remove in PR 3" },
}

const WRITE = "(?:set|update|delete|create)"
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Comments are not code. (A `//` inside a string only ever hides text, never adds a hit.) */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
}

export function findWrites(raw: string): string[] {
    const src = stripComments(raw)
    // The collection name: a literal, or a constant this file binds to one.
    const consts = [...src.matchAll(/(?:const|let)\s+(\w+)\s*(?::\s*string\s*)?=\s*["'](?:tracks|setlists)["']/g)].map((m) => esc(m[1]))
    const NAME = `(?:["'](?:tracks|setlists)["']${consts.length ? `|${consts.join("|")}` : ""})`
    const COL = `collection\\(\\s*(?:\\w+\\s*,\\s*)?${NAME}\\s*\\)`
    /** Admin doc ref, not a subcollection of it. */
    const ADMIN_DOC = `(?:[\\w.]+\\.)?${COL}\\s*\\.doc\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)(?!\\s*\\.collection)`
    /** Client doc ref: doc(db, "tracks", id) — exactly three args. */
    const CLIENT_DOC = `doc\\(\\s*\\w+\\s*,\\s*${NAME}\\s*,\\s*[^,()]+(?:\\([^()]*\\))?\\s*\\)`
    const DOC = `(?:${ADMIN_DOC}|${CLIENT_DOC})`

    const hits: string[] = []
    const add = (why: string, re: RegExp) => {
        const m = re.exec(src)
        if (m) hits.push(`${why}: ${m[0].slice(0, 100).replace(/\s+/g, " ")}`)
    }
    add("chained", new RegExp(`${DOC}\\s*\\.${WRITE}\\(`))
    add("sink", new RegExp(`\\.${WRITE}\\(\\s*${DOC}`))
    add("client", new RegExp(`(?:setDoc|updateDoc|deleteDoc)\\(\\s*${DOC}`))
    add("client-add", new RegExp(`addDoc\\(\\s*${COL}`))

    // Variables holding a doc ref or a collection ref.
    for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${DOC}`, "g"))) {
        const v = esc(m[1])
        add(`doc-var ${m[1]}`, new RegExp(`\\b${v}\\s*\\.${WRITE}\\(|\\.${WRITE}\\(\\s*${v}\\b|(?:setDoc|updateDoc|deleteDoc)\\(\\s*${v}\\b`))
    }
    for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:[\\w.]+\\.)?${COL}(?!\\s*\\.)`, "g"))) {
        const v = esc(m[1])
        add(`collection-var ${m[1]}`, new RegExp(`\\b${v}\\.doc\\([^)]*\\)\\s*\\.${WRITE}\\(|\\.${WRITE}\\(\\s*${v}\\.doc\\(|addDoc\\(\\s*${v}\\b|(?:setDoc|updateDoc|deleteDoc)\\(\\s*doc\\(\\s*${v}\\b`))
    }

    // `.ref` of a doc read from a tracks/setlists query (a file that queries
    // one of them and writes through some snapshot's `.ref`).
    if (new RegExp(`${COL}\\s*\\.(?:where|orderBy|limit|get)\\b|query\\(\\s*${COL}`).test(src)) {
        add("query-ref", new RegExp(`\\.${WRITE}\\(\\s*\\w+\\.ref\\b|\\b\\w+\\.ref\\s*\\.${WRITE}\\(`))
    }
    return hits
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

describe("OPS-CONTRACT single writer: only src/lib/setlist-ops writes setlists/* and tracks/*", () => {
    it("the scanner sees the write shapes it claims to (self-test)", () => {
        expect(findWrites(`await db.collection("tracks").doc(id).update({ a: 1 })`)).not.toEqual([])
        expect(findWrites(`tx.update(db.collection("setlists").doc(setlistId), patch)`)).not.toEqual([])
        expect(findWrites(`const r = db.collection('tracks').doc(x)\nawait r.update({})`)).not.toEqual([])
        expect(findWrites(`const r = db.collection('tracks').doc(x)\ntx.delete(r)`)).not.toEqual([])
        expect(findWrites(`await updateDoc(doc(db, 'tracks', id), p)`)).not.toEqual([])
        expect(findWrites(`await addDoc(collection(db, "setlists"), p)`)).not.toEqual([])
        expect(findWrites(`const s = await tx.get(db.collection("tracks").where("setlistId","==",id))\ns.docs.forEach((d) => tx.delete(d.ref))`)).not.toEqual([])
        // Reads and subcollections are not writes on the setlist doc.
        expect(findWrites(`const s = await db.collection("tracks").doc(id).get()`)).toEqual([])
        expect(findWrites(`await addDoc(collection(db, 'setlists', id, 'history'), e)`)).toEqual([])
        expect(findWrites(`await db.collection("setlists").doc(id).collection("performance").doc("x").set({})`)).toEqual([])
        expect(findWrites(`// tx.update(db.collection("tracks").doc(id), p) in a comment`)).toEqual([])
        // A constant naming the collection is still the collection.
        expect(findWrites(`const COLLECTION_PATH = 'setlists'\nawait addDoc(collection(db, COLLECTION_PATH), d)`)).not.toEqual([])
    })

    it("no file outside the module writes setlists/* or tracks/* unless allowlisted", () => {
        const offenders = files
            .filter((f) => !f.rel.startsWith(MODULE_DIR) && !(f.rel in ALLOWLIST))
            .map((f) => ({ rel: f.rel, hits: findWrites(f.src) }))
            .filter((f) => f.hits.length > 0)
        expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
    })

    it("every allowlist entry still writes (remove it once the file is moved) and says when it goes", () => {
        for (const [rel, entry] of Object.entries(ALLOWLIST)) {
            const f = files.find((x) => x.rel === rel)
            expect(f, `${rel} no longer exists`).toBeDefined()
            expect(entry.why).toMatch(/remove in PR 3/)
        }
        const stale = Object.entries(ALLOWLIST)
            .filter(([, entry]) => !entry.dynamic)
            .map(([rel]) => rel)
            .filter((rel) => findWrites(files.find((x) => x.rel === rel)!.src).length === 0)
        expect(stale, `stale allowlist entries: ${stale.join(", ")}`).toEqual([])
    })

    it("the moved writers write through the module", () => {
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
        ]) {
            const f = files.find((x) => x.rel === rel)!
            expect(f.src, rel).toMatch(/from ["']@\/lib\/setlist-ops["']/)
            expect(findWrites(f.src), rel).toEqual([])
        }
    })
})
