// @vitest-environment node
/**
 * The branch of record is `master`; there is no `main` branch, local or
 * remote (CLAUDE.md). No workflow may trigger on a branch that does not exist.
 */
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const DIR = path.join(process.cwd(), ".github", "workflows")

describe("GitHub workflow branch triggers", () => {
    const files = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))

    it("finds the workflows", () => {
        expect(files).toContain("ci.yml")
    })

    for (const file of files) {
        it(`${file} triggers on no branch but master`, () => {
            const text = fs.readFileSync(path.join(DIR, file), "utf8")
            for (const m of text.matchAll(/^\s*branches:\s*\[([^\]]*)\]/gm)) {
                const branches = m[1].split(",").map((b) => b.trim().replace(/^['"]|['"]$/g, ""))
                expect(branches).toEqual(["master"])
            }
            expect(text).not.toMatch(/^\s*-\s*['"]?main['"]?\s*$/m)
        })
    }
})
