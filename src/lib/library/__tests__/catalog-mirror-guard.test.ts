import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * songs/{id} mirrors library_index/{id} (title, status, key, bpm, Vocal Lead,
 * length). Every writer of those fields goes through
 * src/lib/library/catalog-mirror.ts so the two cannot drift (setlist sync
 * later list, 2026-11-03). This scan refuses a direct songs write anywhere
 * else. The writers below are the exceptions, each with why: they create a
 * row in both collections at once, stamp tenancy/visibility (not catalogue
 * fields), or delete the row. Tenancy sweeps that write a list of collections
 * by name (orgId back-fill, visibility stamps, nava-move, test teardown) write
 * no catalogue field and are not matched.
 */
const ALLOWED: Record<string, string> = {
    "lib/library/catalog-mirror.ts": "the writer itself",
    "lib/library-upload.ts": "creates a new chart's library_index and songs docs together",
    "lib/mcp/tools/library-upload.ts": "upload/delete_chart: creates or deletes both docs together",
    "lib/sync-engine.ts": "Drive import: creates or refreshes both docs from the Drive listing",
    "lib/mcp/org-context.ts": "stampOrg: tenant stamp (orgId) on a just-created chart",
    "lib/library/visibility-job.ts": "visibility stamp (visibleToOrgs/collection), the visibility job owns it",
}

const SRC = join(process.cwd(), "src")

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
            if (name === "__tests__" || name === "test" || name === "test-stubs" || name === "node_modules") continue
            walk(p, out)
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
    }
    return out
}

const SONGS_REF = String.raw`collection\(\s*(?:["']songs["']|SONGS(?:_COLLECTION)?)\s*\)`
const WRITE = String.raw`\.(?:set|update|create|delete)\(`

/** Files with a direct write to a songs doc (chained, through a ref variable, or a batch/tx op). */
export function directSongsWriters(files: string[]): string[] {
    const hits: string[] = []
    for (const file of files) {
        const text = readFileSync(file, "utf8")
        if (!new RegExp(SONGS_REF).test(text)) continue
        const chained = new RegExp(SONGS_REF + String.raw`\s*\.doc\([^)]*\)\s*` + WRITE)
        const inOp = new RegExp(String.raw`\.(?:set|update|create|delete)\(\s*[\w.]*` + SONGS_REF)
        let hit = chained.test(text) || inOp.test(text)
        if (!hit) {
            const vars = [...text.matchAll(new RegExp(String.raw`(?:const|let)\s+(\w+)\s*=\s*[\w.]*` + SONGS_REF + String.raw`\s*\.doc\(`, "g"))].map((m) => m[1])
            hit = vars.some((v) => new RegExp(String.raw`\b${v}\s*` + WRITE + "|" + String.raw`\.(?:set|update|create|delete)\(\s*${v}\b`).test(text))
        }
        if (hit) hits.push(relative(SRC, file).split(sep).join("/"))
    }
    return hits.sort()
}

describe("catalog mirror: songs writes go through catalog-mirror.ts", () => {
    const writers = directSongsWriters(walk(SRC))

    it("no direct songs writer outside the allowlist", () => {
        expect(writers.filter((f) => !(f in ALLOWED))).toEqual([])
    })

    it("every allowlist entry still writes songs directly (no stale exceptions)", () => {
        expect(Object.keys(ALLOWED).filter((f) => !writers.includes(f))).toEqual([])
    })
})
