import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join, extname } from "path"

/**
 * 2026-09-19 audit, item (e) — every environment variable this app reads is
 * declared in `src/env.mjs`.
 *
 * THE FAILURE THIS PREVENTS. `src/env.mjs` declared 36 variables; `src/` read
 * 58. The difference was not a naming slip — it was nineteen variables with a
 * safe-looking fallback (`process.env.X || "some default"`), which is the worst
 * shape a misconfiguration can take. An unset `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
 * does not crash; it silently stops every device from ever enrolling for push.
 * An unset `NEXT_PUBLIC_BASE_URL` does not crash; it puts the production domain
 * into links sent from a preview deploy. Declaring them makes the boot-time
 * schema the one honest list of what this app reads, and this test is what
 * keeps that list honest as code is added.
 *
 * SO: a new `process.env.SOMETHING` in `src/` fails this test until it is
 * declared in `src/env.mjs` (optional is fine — the point is that it is named)
 * or added to `EXEMPT` below with a reason.
 */

const ROOT = join(__dirname, "..", "..")
const SRC = join(ROOT, "src")

/**
 * Variables that are deliberately NOT in the schema, each with the reason.
 * Keep this list short and keep the reasons real.
 */
const EXEMPT: Record<string, string> = {
    // Set by the platform, never by us. `env.mjs` keys its prod-required
    // logic on VERCEL_ENV, so declaring these would be circular.
    NODE_ENV: "set by the toolchain",
    CI: "set by the CI runner",
    NEXT_RUNTIME: "set by Next.js per-runtime",
    ANALYZE: "build-time bundle-analyzer switch",
    SKIP_ENV_VALIDATION: "the escape hatch env.mjs itself reads",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "injected by Vercel at build time",

    // Test and probe harnesses. These exist only when a harness sets them;
    // the app must behave identically when they are absent, and a boot-time
    // check on them would be a check on the harness, not on the app.
    VITEST_LOAD_FACTOR: "vitest harness — scales timeouts on slow machines",
    NEXT_PUBLIC_PROBE_HARNESS_AUTH: "probe harness switch; PROBE_* family",
    FIRESTORE_EMULATOR_HOST: "set by the Firebase emulator",
    FIREBASE_AUTH_EMULATOR_HOST: "set by the Firebase emulator",
    INTAKE_EXECUTOR: "intake harness, test-only",
    INTAKE_RUN_SECRET: "intake harness, test-only",
    INNGEST_EVENT_KEY: "test fixture only; no runtime Inngest client",
}

/** Anything starting with one of these is platform-supplied. */
const EXEMPT_PREFIXES = ["VERCEL", "PROBE_"]

/** This file names `process.env.X` in its own prose; it must not scan itself. */
const SELF = join(__dirname, "env-coverage.test.ts")

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue
        if (join(dir, name) === SELF) continue
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            walk(full, out)
        } else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(name))) {
            out.push(full)
        }
    }
    return out
}

function readsOf(files: string[]): Map<string, string> {
    // name -> "relative/path.ts" of the first place it is read
    const found = new Map<string, string>()
    for (const file of files) {
        const text = readFileSync(file, "utf8")
        for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
            if (!found.has(m[1])) found.set(m[1], file.slice(ROOT.length + 1))
        }
        for (const m of text.matchAll(/process\.env\[["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\]/g)) {
            if (!found.has(m[1])) found.set(m[1], file.slice(ROOT.length + 1))
        }
    }
    return found
}

function isExempt(name: string): boolean {
    if (name in EXEMPT) return true
    return EXEMPT_PREFIXES.some((p) => name.startsWith(p))
}

/** The names `src/env.mjs` declares, read as text so no import side effects run. */
function declaredNames(): Set<string> {
    const text = readFileSync(join(SRC, "env.mjs"), "utf8")
    // The `runtimeEnv` block names every key exactly once and is the mapping
    // t3-env actually uses, so it is the authoritative list.
    const block = text.slice(text.indexOf("runtimeEnv:"))
    const names = new Set<string>()
    for (const m of block.matchAll(/^\s{8}([A-Z][A-Z0-9_]*):/gm)) names.add(m[1])
    return names
}

describe("env coverage — src/env.mjs names everything src/ reads", () => {
    const declared = declaredNames()

    it("declares a healthy number of variables (sanity check on the parser)", () => {
        expect(declared.size).toBeGreaterThan(40)
        expect(declared.has("FIREBASE_CLIENT_EMAIL")).toBe(true)
        expect(declared.has("NEXT_PUBLIC_FIREBASE_API_KEY")).toBe(true)
    })

    it("has no undeclared, unexempted process.env read anywhere in src/", () => {
        const reads = readsOf(walk(SRC))
        const undeclared = [...reads.entries()]
            .filter(([name]) => !declared.has(name) && !isExempt(name))
            .map(([name, where]) => `${name} (read at ${where})`)
            .sort()

        expect(undeclared).toEqual([])
    })

    it("keeps the seven the audit called out specifically", () => {
        for (const name of [
            "ALLOWED_ORIGINS",
            "MCP_PUBLIC_URL",
            "NEXT_PUBLIC_BASE_URL",
            "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
            "CHART_RENDER_CHROME_PATH",
            "OVERLAYS_WORKSPACE",
            "READER_MUSIC_ORG_ID",
        ]) {
            expect(declared.has(name), `${name} must stay declared`).toBe(true)
        }
    })

    it("names every declared variable in .env.example", () => {
        const example = readFileSync(join(ROOT, ".env.example"), "utf8")
        const documented = new Set(
            [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
        )
        const missing = [...declared].filter((n) => !documented.has(n)).sort()
        expect(missing).toEqual([])
    })

    it("every EXEMPT entry carries a reason", () => {
        for (const [name, reason] of Object.entries(EXEMPT)) {
            expect(reason.length, `${name} needs a reason`).toBeGreaterThan(5)
        }
    })
})
