/**
 * Review S3 on PR #48: the browser client is @sentry/browser while server code
 * and the sync engine use @sentry/nextjs. They share one client only when they
 * share one @sentry/core, so both are pinned to the same exact version.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("Sentry packages move in lockstep", () => {
    it("pins @sentry/browser and @sentry/nextjs to the same exact version", () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))
        const browser: string = pkg.dependencies["@sentry/browser"]
        const nextjs: string = pkg.dependencies["@sentry/nextjs"]
        expect(browser).toMatch(/^\d+\.\d+\.\d+$/)
        expect(nextjs).toBe(browser)
    })
})
