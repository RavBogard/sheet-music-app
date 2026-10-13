import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Multi-tenant phase 7 — what the untranslated-string scan covers.
 *
 * Band-facing and admin code: everything under SCAN_ROOTS except the
 * platform console (only Daniel uses it), MCP (its text stays English,
 * R-1012-mt-7 default), tests, stories, and the i18n plumbing itself.
 */
export const REPO_ROOT = join(__dirname, "..", "..", "..")

export const SCAN_ROOTS = ["src/app", "src/components", "src/hooks", "src/lib"]

/** Path prefixes (repo-relative, forward slashes) the scan never covers. */
export const EXEMPT_PREFIXES = [
    // Platform console: English by ruling R-1012-mt-7 (default).
    "src/app/(main)/platform/",
    "src/components/platform/",
    "src/app/api/platform/",
    // MCP: English by ruling R-1012-mt-7 (default).
    "src/app/api/mcp/",
    "src/lib/mcp/",
    "src/mcp-apps/",
    // Machine-to-machine endpoints: their JSON is read by Vercel cron,
    // webhooks and the mixer bridge, never shown to a person.
    "src/app/api/cron/",
    "src/app/api/webhooks/",
    "src/app/api/bridge/",
    "src/app/api/inngest/",
    // The i18n plumbing and its catalogues.
    "src/i18n/",
    // Server-only machinery with no user-facing text of its own: AI prompts
    // (English to the model), dev/ops scripts.
    "src/lib/ai/",
]

/** File patterns never scanned. */
export const EXEMPT_FILE_RE = /(\.test\.tsx?|\.spec\.tsx?|\.stories\.tsx?|\.d\.ts)$|\/__tests__\/|\/__mocks__\//

export function toRepoPath(abs: string): string {
    return relative(REPO_ROOT, abs).replace(/\\/g, "/")
}

export function isExempt(repoPath: string): boolean {
    return EXEMPT_FILE_RE.test(repoPath) || EXEMPT_PREFIXES.some((p) => repoPath.startsWith(p))
}

export function listScannedFiles(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
        let entries: string[]
        try {
            entries = readdirSync(dir)
        } catch {
            return
        }
        for (const name of entries) {
            if (name === "node_modules" || name.startsWith(".")) continue
            const abs = join(dir, name)
            const st = statSync(abs)
            if (st.isDirectory()) walk(abs)
            else if (/\.(ts|tsx)$/.test(name)) {
                const rp = toRepoPath(abs)
                if (!isExempt(rp)) out.push(rp)
            }
        }
    }
    for (const r of SCAN_ROOTS) walk(join(REPO_ROOT, r))
    return out.sort()
}

export function readRepoFile(repoPath: string): string {
    return readFileSync(join(REPO_ROOT, repoPath), "utf8")
}

/** A NOT_YET_MIGRATED entry covers a file: "dir/" recursively, "dir/*" direct children only. */
export function pendingCovers(entry: string, file: string): boolean {
    if (entry.endsWith("/*")) {
        const dir = entry.slice(0, -1)
        return file.startsWith(dir) && !file.slice(dir.length).includes("/")
    }
    return file.startsWith(entry)
}
