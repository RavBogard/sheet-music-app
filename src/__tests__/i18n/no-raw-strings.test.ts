import { describe, expect, it } from "vitest"

import { ALLOWLIST } from "./allowlist"
import { NOT_YET_MIGRATED } from "./not-yet-migrated"
import { scanSource, type Finding } from "./scanner"
import { isExempt, listScannedFiles, pendingCovers, readRepoFile } from "./scope"

/**
 * Multi-tenant phase 7 gate: no user-visible string bypasses `t()` in the
 * band-facing and admin code (scope.ts), except under a directory still on the
 * NOT_YET_MIGRATED list. How to fix a failure: P7-I18N-GUIDE.md.
 */

function isPending(file: string): boolean {
    return NOT_YET_MIGRATED.some((e) => pendingCovers(e, file))
}

function allowed(f: Finding): boolean {
    return ALLOWLIST.some((a) => a.file === f.file && a.text === f.text)
}

const files = listScannedFiles()
const findingsByFile = new Map<string, Finding[]>()
for (const f of files) {
    const found = scanSource(f, readRepoFile(f)).filter((x) => !allowed(x))
    if (found.length) findingsByFile.set(f, found)
}

describe("phase 7: no raw user-visible strings outside the not-yet-migrated list", () => {
    it("migrated code has no string that bypasses t()", () => {
        const offenders: string[] = []
        for (const [file, found] of findingsByFile) {
            if (isPending(file)) continue
            for (const x of found) offenders.push(`${x.file}:${x.line} [${x.kind}${x.where ? ` ${x.where}` : ""}] ${JSON.stringify(x.text)}`)
        }
        expect(offenders, `Move these into the catalogue (t("ns.key")) or mark them i18n-ignore with a reason:\n${offenders.join("\n")}`).toEqual([])
    })

    it("every not-yet-migrated entry still has work under it (delete finished entries)", () => {
        const stale = NOT_YET_MIGRATED.filter((e) => ![...findingsByFile.keys()].some((f) => pendingCovers(e, f)))
        expect(stale, `These directories are clean — delete their lines from not-yet-migrated.ts:\n${stale.join("\n")}`).toEqual([])
    })

    it("the list is well-formed: unique, sorted, no exempt or overlapping entries", () => {
        expect(new Set(NOT_YET_MIGRATED).size).toBe(NOT_YET_MIGRATED.length)
        expect([...NOT_YET_MIGRATED]).toEqual([...NOT_YET_MIGRATED].sort((a, b) => a.localeCompare(b)))
        for (const e of NOT_YET_MIGRATED) {
            expect(e, e).toMatch(/^src\/.+\/\*?$/)
            expect(isExempt(e.replace(/\*$/, "x.ts")), `${e} is exempt from the scan anyway`).toBe(false)
        }
        for (const a of NOT_YET_MIGRATED) for (const b of NOT_YET_MIGRATED) {
            if (a !== b && a.endsWith("/") && b.startsWith(a)) throw new Error(`${b} is already covered by ${a}`)
        }
    })

    it("allowlist entries carry a reason and still match something", () => {
        for (const a of ALLOWLIST) {
            expect(a.reason.trim().length, `${a.file}: ${a.text}`).toBeGreaterThan(0)
            const hit = scanSource(a.file, readRepoFile(a.file)).some((x) => x.text === a.text)
            expect(hit, `stale allowlist entry ${a.file}: ${a.text}`).toBe(true)
        }
    })

    it("progress (informational)", () => {
        let pending = 0
        for (const [file, found] of findingsByFile) if (isPending(file)) pending += found.length
        console.info(`[i18n scan] ${files.length} files scanned; ${pending} raw strings left in ${NOT_YET_MIGRATED.length} not-yet-migrated entries`)
        expect(pending).toBeGreaterThanOrEqual(0)
    })
})
