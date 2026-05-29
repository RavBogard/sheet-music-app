import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the prune-inactive-serwist-deps lane (2026-05-29).
//
// Cycle-9 (`f8d7d06a1a`, 2026-05-17) killed the legacy serwist-based PWA
// service worker because of a recovery-loop bug. The replacement is a
// hand-rolled SW at `public/perform-shell-sw.js` (cycle-12 `467e788ed5`)
// with no serwist runtime. The 3 `@serwist*` packages were uninstalled
// 2026-05-29 — this test asserts no future `npm install` (transitive or
// direct) silently re-introduces them. If a dep legitimately needs to
// come back, delete this test in the same commit so the reintroduction
// is reviewable.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const SERWIST_PKGS = ["@serwist/next", "@serwist/precaching", "serwist"] as const;

// Detects an actual import / require / dynamic-import of @serwist or
// bare `serwist`. Does NOT match doc-comments that just say the word
// "serwist" (those exist as removal-history references and are intentional).
const IMPORT_RE = /(?:from|require\s*\(|import\s*\()\s*["']@?serwist(?:\/[^"']*)?["']/;

const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

function walk(dir: string, hits: string[]): void {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name === ".git") continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk(full, hits);
        } else if (st.isFile() && CODE_EXT.test(name)) {
            const text = readFileSync(full, "utf8");
            if (IMPORT_RE.test(text)) hits.push(full);
        }
    }
}

describe("@serwist deps are pruned and stay pruned", () => {
    it("package.json declares no @serwist dependencies", () => {
        const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
        const declared = new Set<string>([
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
            ...Object.keys(pkg.peerDependencies ?? {}),
            ...Object.keys(pkg.optionalDependencies ?? {}),
        ]);
        for (const name of SERWIST_PKGS) {
            expect(declared.has(name), `${name} should not be in package.json`).toBe(false);
        }
    });

    it("no src/, e2e/, scripts/, bridge/ or next.config.* file imports @serwist", () => {
        const hits: string[] = [];
        for (const subdir of ["src", "e2e", "scripts", "bridge"]) {
            walk(resolve(REPO_ROOT, subdir), hits);
        }
        for (const cfg of ["next.config.ts", "next.config.js", "next.config.mjs", "next.config.cjs"]) {
            const full = resolve(REPO_ROOT, cfg);
            if (existsSync(full) && IMPORT_RE.test(readFileSync(full, "utf8"))) {
                hits.push(full);
            }
        }
        expect(hits, `unexpected @serwist imports: ${hits.join(", ")}`).toEqual([]);
    });
});
