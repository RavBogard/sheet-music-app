// scripts/__tests__/setup-coord-worktree.test.mjs
//
// Tests for scripts/setup-coord-worktree.sh and scripts/git-hooks/pre-commit.
// Hermetic: every test creates its own tempdir, runs `git init` there, and
// never touches the real .git/. Uses node:child_process.spawnSync with
// argv-array form (no shell interpolation, no command injection surface).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SETUP_SCRIPT = resolve(REPO_ROOT, "scripts", "setup-coord-worktree.sh");
const HOOK_SCRIPT = resolve(REPO_ROOT, "scripts", "git-hooks", "pre-commit");
// setup-coord-worktree.sh sources scripts/lib/unshallow-current-repo.sh at
// runtime (Step 0 shallow-clone defense). The tempdir harness must mirror
// that file too or the script aborts under `set -euo pipefail` before it
// reaches any of the behavior under test.
const LIB_SCRIPT = resolve(REPO_ROOT, "scripts", "lib", "unshallow-current-repo.sh");

type RunResult = { code: number | null; stdout: string; stderr: string };

/** Run a command with an argv array (no shell), capture stdout/stderr/code. */
function run(cmd: string, args: readonly string[], opts: SpawnSyncOptions = {}): RunResult {
    const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    return { code: r.status, stdout: (r.stdout as string) || "", stderr: (r.stderr as string) || "" };
}

/** Quick `git` helper inside a cwd. */
function git(cwd: string, ...args: string[]): RunResult {
    return run("git", args, { cwd });
}

/** Bootstrap a fresh tempdir as a git repo with one master commit. */
function makeFreshRepo() {
    const tmp = mkdtempSync(join(tmpdir(), "coord-wt-test-"));
    // Use -b master so behavior is deterministic across global init.defaultBranch values.
    expect(run("git", ["init", "-q", "-b", "master", tmp]).code).toBe(0);
    expect(git(tmp, "config", "user.email", "bootstrap@test.local").code).toBe(0);
    expect(git(tmp, "config", "user.name", "bootstrap").code).toBe(0);
    writeFileSync(join(tmp, "README.md"), "# test repo\n");
    expect(git(tmp, "add", "README.md").code).toBe(0);
    expect(git(tmp, "commit", "-q", "-m", "init").code).toBe(0);
    // Drop a copy of the setup script + hook + sourced lib into the repo so
    // the script's self-references resolve at <repo>/scripts/...
    mkdirSync(join(tmp, "scripts", "git-hooks"), { recursive: true });
    mkdirSync(join(tmp, "scripts", "lib"), { recursive: true });
    writeFileSync(join(tmp, "scripts", "setup-coord-worktree.sh"), readFileSync(SETUP_SCRIPT));
    writeFileSync(join(tmp, "scripts", "git-hooks", "pre-commit"), readFileSync(HOOK_SCRIPT));
    writeFileSync(join(tmp, "scripts", "lib", "unshallow-current-repo.sh"), readFileSync(LIB_SCRIPT));
    return tmp;
}

const tempdirs: string[] = [];
beforeEach(() => { tempdirs.length = 0; });
afterEach(() => {
    for (const d of tempdirs) {
        try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ }
    }
});

function track(d: string): string { tempdirs.push(d); return d; }

/** Path to the script COPY inside a tempdir-repo (the test invokes the copy,
 *  not the source-of-truth path, so the script's self-orientation lands on
 *  the tempdir-repo's .git/ rather than the source tree's .git/). */
function copiedScript(repo: string): string { return join(repo, "scripts", "setup-coord-worktree.sh"); }

describe("setup-coord-worktree.sh — argv validation", () => {
    it("exits 2 with usage when N is missing", () => {
        const repo = track(makeFreshRepo());
        const r = run("bash", [copiedScript(repo)], { cwd: repo });
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/Usage:/);
    });

    it("exits 2 when N is non-numeric", () => {
        const repo = track(makeFreshRepo());
        const r = run("bash", [copiedScript(repo), "abc", "feat/test", "../wt"], { cwd: repo });
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/must be a positive integer/);
    });
});

describe("setup-coord-worktree.sh — happy path", () => {
    it("enables extensions.worktreeConfig, sets --worktree identity, writes marker, verifies", () => {
        const repo = track(makeFreshRepo());
        const wtPath = join(dirname(repo), "wt-" + Date.now());
        tempdirs.push(wtPath);
        const r = run("bash", [copiedScript(repo), "6", "feat/test-lane", wtPath, "master"], { cwd: repo });
        expect(r.code, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
        // 1. Extension enabled
        expect(git(repo, "config", "--get", "extensions.worktreeConfig").stdout.trim()).toBe("true");
        // 2. Per-worktree identity set
        expect(git(wtPath, "config", "user.email").stdout.trim()).toBe("coder-6@coord.local");
        expect(git(wtPath, "config", "user.name").stdout.trim()).toBe("coder-6");
        // 3. Marker file present with correct content
        expect(readFileSync(join(wtPath, ".coord", ".worktree-coder"), "utf8").trim()).toBe("coder-6");
        // 4. hooksPath set on shared .git (fresh repo, was unset)
        expect(git(repo, "config", "--get", "core.hooksPath").stdout.trim()).toBe("scripts/git-hooks");
    });

    it("is idempotent: re-running on an existing worktree does not crash and preserves identity", () => {
        const repo = track(makeFreshRepo());
        const wtPath = join(dirname(repo), "wt-idem-" + Date.now());
        tempdirs.push(wtPath);
        const r1 = run("bash", [copiedScript(repo), "9", "feat/idem", wtPath, "master"], { cwd: repo });
        expect(r1.code, r1.stderr).toBe(0);
        const r2 = run("bash", [copiedScript(repo), "9", "feat/idem", wtPath, "master"], { cwd: repo });
        expect(r2.code, r2.stderr).toBe(0);
        expect(r2.stdout).toMatch(/already exists/);
        expect(git(wtPath, "config", "user.email").stdout.trim()).toBe("coder-9@coord.local");
    });

    it("does not overwrite a pre-existing core.hooksPath value (warns instead)", () => {
        const repo = track(makeFreshRepo());
        expect(git(repo, "config", "core.hooksPath", ".husky").code).toBe(0);
        const wtPath = join(dirname(repo), "wt-hooks-" + Date.now());
        tempdirs.push(wtPath);
        const r = run("bash", [copiedScript(repo), "3", "feat/h", wtPath, "master"], { cwd: repo });
        expect(r.code, r.stderr).toBe(0);
        // Original value preserved
        expect(git(repo, "config", "--get", "core.hooksPath").stdout.trim()).toBe(".husky");
        // Warning emitted
        expect(r.stderr).toMatch(/WARN.*core\.hooksPath already set/);
    });
});

describe("pre-commit hook — bypass / accept / reject", () => {
    type HookSandboxOpts =
        | { coderId: string; email: string; name: string; withMarker: true }
        | { coderId?: undefined; email: string; name: string; withMarker: false };

    /** Build a per-coder-worktree-shaped tempdir without involving `git worktree add`.
     *  We only need: a git repo, a marker file, configured identity, and the hook script. */
    function makeHookSandbox(opts: HookSandboxOpts): string {
        const tmp = track(mkdtempSync(join(tmpdir(), "hook-sandbox-")));
        expect(run("git", ["init", "-q", "-b", "master", tmp]).code).toBe(0);
        expect(git(tmp, "config", "user.email", opts.email).code).toBe(0);
        expect(git(tmp, "config", "user.name", opts.name).code).toBe(0);
        if (opts.withMarker) {
            mkdirSync(join(tmp, ".coord"), { recursive: true });
            writeFileSync(join(tmp, ".coord", ".worktree-coder"), `${opts.coderId}\n`);
        }
        return tmp;
    }

    it("bypasses (exit 0) when .coord/.worktree-coder is absent (canonical worktree shape)", () => {
        const sb = makeHookSandbox({ email: "anyone@anywhere", name: "anyone", withMarker: false });
        const r = run("bash", [HOOK_SCRIPT], { cwd: sb });
        expect(r.code, r.stderr).toBe(0);
        expect(r.stderr).toBe("");
    });

    it("accepts (exit 0) when marker matches effective git identity", () => {
        const sb = makeHookSandbox({
            coderId: "coder-6",
            email: "coder-6@coord.local",
            name: "coder-6",
            withMarker: true,
        });
        const r = run("bash", [HOOK_SCRIPT], { cwd: sb });
        expect(r.code, r.stderr).toBe(0);
    });

    it("rejects (exit 1) with actionable recovery recipe when identity mismatches marker", () => {
        const sb = makeHookSandbox({
            coderId: "coder-6",
            email: "coder-7@coord.local",
            name: "coder-7",
            withMarker: true,
        });
        const r = run("bash", [HOOK_SCRIPT], { cwd: sb });
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/git identity mismatch/);
        expect(r.stderr).toMatch(/expected:\s+coder-6 <coder-6@coord\.local>/);
        expect(r.stderr).toMatch(/actual:\s+coder-7 <coder-7@coord\.local>/);
        expect(r.stderr).toMatch(/git config --worktree user\.email coder-6@coord\.local/);
    });

    it("rejects (exit 1) when marker file is malformed", () => {
        const sb = makeHookSandbox({
            email: "coder-6@coord.local",
            name: "coder-6",
            withMarker: false,
        });
        // Hand-poison the marker bypassing the sandbox helper's union type.
        mkdirSync(join(sb, ".coord"), { recursive: true });
        writeFileSync(join(sb, ".coord", ".worktree-coder"), "not-a-coder-id\n");
        const r = run("bash", [HOOK_SCRIPT], { cwd: sb });
        expect(r.code).toBe(1);
        expect(r.stderr).toMatch(/malformed \.coord\/\.worktree-coder/);
    });
});
