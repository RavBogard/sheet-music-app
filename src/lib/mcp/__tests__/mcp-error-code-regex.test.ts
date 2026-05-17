import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
    MACHINE_CODE_RE,
    richError,
    forbiddenRoleEnvelope,
    zodFormatter,
    zodFormatterFromSdkProse,
} from "../error-envelopes"

/**
 * Cycle-2 MCP-003: every machine-readable `error:` code on the MCP wire
 * must match snake_case `/^[a-z][a-z0-9_]*$/`. Prose belongs in
 * `message`, never in `error`.
 *
 * Two layers of enforcement here:
 *
 *  1. Source-scan: read every `tools/*.ts` (excluding tests) and pull
 *     out the first string arg of every `richError("...", ...)` call,
 *     plus the literal value of any `error: "..."` (or 'error: ' inside
 *     a rich-shape envelope) that isn't a Zod schema or a type field.
 *     Assert each matches MACHINE_CODE_RE. This catches drift before
 *     anyone has to remember to add a new code to the canonical list.
 *
 *  2. Spot-check the foundation helpers — zodFormatter,
 *     zodFormatterFromSdkProse, forbiddenRoleEnvelope, richError —
 *     produce envelopes whose `error` field passes the regex.
 *
 * If a real machine code needs to escape snake_case (e.g. it carries a
 * domain abbreviation), allow-list it in `ALLOWED_NON_SNAKE` below and
 * document the rationale inline. Don't relax the regex.
 */

const TOOLS_DIR = join(__dirname, "..", "tools")

/** Codes intentionally exempt from snake_case (none today). */
const ALLOWED_NON_SNAKE = new Set<string>([])

function* walkTsFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const s = statSync(full)
        if (s.isDirectory()) {
            // Skip test directories; tests deliberately exercise the prose
            // surfaces under controlled fixtures.
            if (entry === "__tests__") continue
            yield* walkTsFiles(full)
            continue
        }
        if (!entry.endsWith(".ts")) continue
        if (entry.endsWith(".test.ts")) continue
        yield full
    }
}

function extractRichErrorCodes(src: string): string[] {
    // Match `richError("code", ...)` — captures the first string arg.
    const out: string[] = []
    const re = /richError\(\s*"([^"]+)"/g
    let m: RegExpMatchArray | null
    const matches = src.matchAll(re)
    for (m of matches) out.push(m[1])
    return out
}

function extractLiteralErrorFields(src: string): string[] {
    // Match a bare `error: "code"` field — pre-cycle-3 callers that
    // hand-built a flat envelope literal instead of going through
    // richError(). Post-cycle-3 the canonical wire shape is
    // `error: { machine_code: "code", ... }` (rich-object), so a
    // literal flat field is an escape hatch worth catching.
    const out: string[] = []
    const re = /(?:^|[,{])\s*error:\s*"([a-zA-Z0-9_]+)"\s*,/g
    const matches = src.matchAll(re)
    for (const m of matches) out.push(m[1])
    return out
}

describe("MCP error codes are snake_case (MCP-003)", () => {
    const sourceFiles = [...walkTsFiles(TOOLS_DIR)].filter(
        (f) => !f.endsWith("index.ts.bak"),
    )

    it("walks the tools directory and finds source files to scan", () => {
        // Sanity check that the test fixture itself is intact.
        expect(sourceFiles.length).toBeGreaterThan(5)
    })

    it.each(sourceFiles)(
        "every richError(code) in %s uses a snake_case machine code",
        (file) => {
            const src = readFileSync(file, "utf-8")
            const codes = extractRichErrorCodes(src)
            for (const code of codes) {
                if (ALLOWED_NON_SNAKE.has(code)) continue
                expect(
                    MACHINE_CODE_RE.test(code),
                    `\n  ${file}\n  richError("${code}", ...) — codes must match ${MACHINE_CODE_RE} (snake_case starting with a lowercase letter).`,
                ).toBe(true)
            }
        },
    )

    it.each(sourceFiles)(
        "every literal `error: \"...\"` envelope field in %s uses a snake_case machine code",
        (file) => {
            const src = readFileSync(file, "utf-8")
            const codes = extractLiteralErrorFields(src)
            for (const code of codes) {
                if (ALLOWED_NON_SNAKE.has(code)) continue
                expect(
                    MACHINE_CODE_RE.test(code),
                    `\n  ${file}\n  error: "${code}" — codes must match ${MACHINE_CODE_RE}. Migrate to richError("${code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}", ...).`,
                ).toBe(true)
            }
        },
    )
})

describe("MCP error envelope helpers emit snake_case codes", () => {
    it("richError builder passes its code through unchanged", () => {
        const env = richError("setlist_not_found", "msg")
        expect(env.error.machine_code).toBe("setlist_not_found")
        expect(MACHINE_CODE_RE.test(env.error.machine_code)).toBe(true)
        expect(typeof env.error.code).toBe("number")
        expect(env.error.message).toBe("msg")
    })

    it("forbiddenRoleEnvelope emits `forbidden_role`", () => {
        const env = forbiddenRoleEnvelope({
            callerRole: "musician",
            requiredRoles: ["admin"],
        })
        expect(env.error.machine_code).toBe("forbidden_role")
        expect(MACHINE_CODE_RE.test(env.error.machine_code)).toBe(true)
        expect(env.error.code).toBe(403)
    })

    it("zodFormatter emits `validation_error`", () => {
        const env = zodFormatter(
            { issues: [{ path: ["name"], message: "required" }] },
            "create_setlist",
        )
        expect(env.error.machine_code).toBe("validation_error")
        expect(MACHINE_CODE_RE.test(env.error.machine_code)).toBe(true)
        expect(env.error.code).toBe(400)
    })

    it("zodFormatterFromSdkProse emits `validation_error` for parseable prose", () => {
        const env = zodFormatterFromSdkProse(
            'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"required"}]',
        )
        expect(env.error.machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
        expect(env.issues).toHaveLength(1)
    })

    it("zodFormatterFromSdkProse falls back to validation_error for unparseable prose", () => {
        const env = zodFormatterFromSdkProse("Some other validation message")
        expect(env.error.machine_code).toBe("validation_error")
        expect(MACHINE_CODE_RE.test(env.error.machine_code)).toBe(true)
        expect(env.toolName).toBeNull()
    })
})
