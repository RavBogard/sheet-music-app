/**
 * Multi-tenant phase 3: session cookies stay host-only. A cookie set with a
 * `Domain=` attribute would be sent to every subdomain (another tenant's
 * `<slug>.centralreform.live`, say), so no cookie this app writes may carry one.
 * Static scan of every non-test source file.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = join(__dirname, "..")

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
            if (name === "__tests__" || name === "node_modules") continue
            sourceFiles(p, out)
        } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
            out.push(p)
        }
    }
    return out
}

/** The argument text of every `.cookies.set(` / `cookies().set(` call, by balanced parens. */
function cookieSetCalls(src: string): string[] {
    const calls: string[] = []
    const re = /cookies(?:\(\))?\.set\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
        let depth = 1
        let i = m.index + m[0].length
        const start = i
        while (i < src.length && depth > 0) {
            if (src[i] === "(") depth++
            else if (src[i] === ")") depth--
            i++
        }
        calls.push(src.slice(start, i - 1))
    }
    return calls
}

const files = sourceFiles(ROOT)

describe("cookies are host-only", () => {
    it("scans a real source tree", () => {
        expect(files.length).toBeGreaterThan(100)
        const withSets = files.filter((f) => cookieSetCalls(readFileSync(f, "utf8")).length > 0)
        // session route, refresh-session route and the proxy at least
        expect(withSets.length).toBeGreaterThanOrEqual(3)
    })

    it("no cookies.set(...) call passes a domain option", () => {
        const offenders: string[] = []
        for (const f of files) {
            for (const call of cookieSetCalls(readFileSync(f, "utf8"))) {
                if (/\bdomain\s*:/i.test(call)) offenders.push(`${relative(ROOT, f)}: ${call.slice(0, 80)}`)
            }
        }
        expect(offenders).toEqual([])
    })

    it("no raw cookie string carries a Domain= attribute", () => {
        const offenders = files.filter((f) => /;\s*Domain=/i.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f))
        expect(offenders).toEqual([])
    })
})
