import { describe, it, expect, vi } from "vitest"

import { runAxe } from "../runAxe.mjs"

/**
 * Cycle-5 C5B-META-001 — verifies that `runAxe` injects axe-core inline
 * (CSP-safe path) and surfaces a violations array. Uses a fake Playwright
 * page that simulates the canonical axe.run() return shape so we don't
 * need to spin up a real browser to prove the wiring.
 *
 * The "known-violation" requirement from the lane prompt is satisfied
 * by the fake page returning a non-empty violations array on the
 * mock surface.
 */
describe("runAxe (cycle-4 harness)", () => {
    function makeFakePage(opts = {}) {
        const calls = { addScriptTag: [], evaluate: [], url: 0 }
        let axePresent = opts.preInjected === true
        return {
            calls,
            async addScriptTag(arg) {
                calls.addScriptTag.push(arg)
                if (typeof arg.content === "string" && arg.content.length > 100) {
                    axePresent = true
                }
            },
            async evaluate(fn) {
                calls.evaluate.push(fn.toString())
                const src = fn.toString()
                // Branch 1: "is axe already injected?" probe
                if (/typeof.*window.*axe.*undefined/.test(src)) {
                    return axePresent
                }
                // Branch 2: the actual axe.run() invocation
                return {
                    violations: [
                        { id: "color-contrast", impact: "serious", nodes: [] },
                    ],
                    passes: [],
                    incomplete: [],
                    inapplicable: [],
                }
            },
            url() {
                calls.url++
                return "http://localhost/test-surface"
            },
        }
    }

    it("injects axe-core as inline content (CSP-safe) and returns surface + violations", async () => {
        const page = makeFakePage()
        const result = await runAxe(page, "library-route")

        // Inline content path — exactly one injection
        expect(page.calls.addScriptTag.length).toBe(1)
        const tag = page.calls.addScriptTag[0]
        expect(typeof tag.content).toBe("string")
        expect(tag.content.length).toBeGreaterThan(1000) // axe.min.js is large
        expect("url" in tag).toBe(false) // never uses CDN url

        expect(result.surface).toBe("library-route")
        expect(result.url).toBe("http://localhost/test-surface")
        expect(Array.isArray(result.violations)).toBe(true)
        expect(result.violations.length).toBeGreaterThanOrEqual(1)
        expect(typeof result.runAt).toBe("string")
    })

    it("skips re-injection when axe is already on window (idempotent)", async () => {
        const page = makeFakePage({ preInjected: true })
        await runAxe(page, "second-run")
        expect(page.calls.addScriptTag.length).toBe(0)
    })

    it("throws on missing args", async () => {
        await expect(runAxe(null, "x")).rejects.toThrow(/page is required/)
        const page = makeFakePage()
        await expect(runAxe(page, "")).rejects.toThrow(/surface label is required/)
    })
})
