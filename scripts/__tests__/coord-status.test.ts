import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// Fixture-driven test for scripts/coord-status.sh.
//
// The script auto-detects coord-root by walking up from cwd or sniffing for a
// `sheet-music-app/.coord/` sibling. To isolate the test from this repo's
// real .coord/, we pass --coord <tmpdir> explicitly and set COORD_ROOT="" so
// the env doesn't leak.
//
// We assert on SECTION HEADERS (stable contract: master tip / worktrees /
// coder census / inbox tails / claims / queue) and on specific fixture
// content, not on exact spacing/order (the dispatch said "be readable, not
// exhaustive"; we want freedom to iterate layout without breaking tests).

const SCRIPT = resolve(__dirname, "..", "coord-status.sh")

function writeFixture(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, "utf8")
  }
}

function run(root: string): string {
  return execFileSync("bash", [SCRIPT, "--coord", root], {
    encoding: "utf8",
    env: { ...process.env, COORD_ROOT: "" },
  })
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "coord-status-test-"))
  // Mandatory marker so the script's --coord arg is accepted as a real
  // coord-root (the auto-detect path keys on .coord/cold-boot/ existence).
  mkdirSync(join(root, ".coord", "cold-boot"), { recursive: true })
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("coord-status.sh — section contract", () => {
  it("prints all standard section headers on a minimal coord-root", () => {
    writeFixture(root, {
      ".coord/shared/master-tip.md": [
        "# Master tip",
        "",
        "**SHA:** deadbeef0",
        "**Pushed at:** 2026-05-26T07:05Z",
        "**Pushed by:** test-fixture",
      ].join("\n"),
    })
    const out = run(root)
    expect(out).toMatch(/CRC \.coord\/ Status/)
    expect(out).toMatch(/MASTER TIP:/)
    expect(out).toMatch(/WORKTREES:/)
    expect(out).toMatch(/CODER CENSUS:/)
    expect(out).toMatch(/SUPERVISOR INBOX/)
    expect(out).toMatch(/AUDITOR INBOX/)
    expect(out).toMatch(/CLAIMS HELD/)
    expect(out).toMatch(/QUEUE/)
    expect(out).toMatch(/=== end ===/)
  })

  it("surfaces master-tip SHA + pushed-at from shared/master-tip.md", () => {
    writeFixture(root, {
      ".coord/shared/master-tip.md": [
        "# Master tip",
        "",
        "**SHA:** abc123def",
        "**Pushed at:** 2026-05-26T07:05Z",
      ].join("\n"),
    })
    const out = run(root)
    expect(out).toMatch(/abc123def/)
    expect(out).toMatch(/2026-05-26T07:05Z/)
  })

  it("marks every coder LIVE when their inbox carries a msg-001 header", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      writeFixture(root, {
        [`.coord/inbox/coder-${n}.md`]: [
          `# Inbox — coder-${n}`,
          "",
          `## msg-fixture-lane-${n}-001 | from supervisor | 2026-05-26T08:00Z | status:NEW`,
          "**Subject:** fixture",
          "**Body:** fixture body",
        ].join("\n"),
      })
    }
    const out = run(root)
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(out).toMatch(new RegExp(`coder-${n}:.*LIVE`))
      expect(out).toMatch(new RegExp(`fixture-lane-${n}-001`))
    }
  })

  it("marks coders idle when their inbox has no ## msg- header", () => {
    writeFixture(root, {
      ".coord/inbox/coder-1.md": "# Inbox — coder-1\n\n(no active dispatch)\n",
    })
    const out = run(root)
    expect(out).toMatch(/coder-1: idle/)
    // Coders without an inbox file are also idle.
    expect(out).toMatch(/coder-7: idle/)
  })

  it("flags BLOCKED status with a critical marker in the coder census", () => {
    writeFixture(root, {
      ".coord/inbox/coder-3.md": [
        "# Inbox — coder-3",
        "",
        "## msg-stuck-001 | from supervisor | 2026-05-26T08:00Z | status:BLOCKED",
        "**Subject:** blocked",
      ].join("\n"),
    })
    const out = run(root)
    // The "!" suffix is the critical marker added on top of LIVE.
    expect(out).toMatch(/coder-3: LIVE !/)
  })

  it("tails the 3 most-recent non-RESOLVED inbox messages", () => {
    const supervisor = [
      "# Inbox — supervisor",
      "",
      "## msg-old-resolved | from coder-1 | 2026-05-26T06:00Z | status:RESOLVED",
      "**Subject:** old",
      "",
      "## msg-new-1 | from coder-2 | 2026-05-26T07:00Z | status:NEW",
      "**Subject:** new 1",
      "",
      "## msg-new-2 | from coder-3 | 2026-05-26T07:30Z | status:ACK",
      "**Subject:** new 2",
      "",
      "## msg-new-3 | from coder-4 | 2026-05-26T08:00Z | status:NEW",
      "**Subject:** new 3",
    ].join("\n")
    writeFixture(root, { ".coord/inbox/supervisor.md": supervisor })
    const out = run(root)
    expect(out).toMatch(/new-1/)
    expect(out).toMatch(/new-2/)
    expect(out).toMatch(/new-3/)
    expect(out).not.toMatch(/old-resolved/)
  })

  it("surfaces non-released claims aged 2–24h as drift candidates", () => {
    const now = new Date()
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000)
    const iso = threeHoursAgo.toISOString().replace(/\..*$/, "Z")
    const claims = [
      "| path | held by | claimed_at (UTC) | TTL | purpose |",
      "|------|---------|------------------|-----|---------|",
      `| src/heldfile.ts | coder-9 fixture-lane | ${iso} | 2h | fixture |`,
      `| src/oldfile.ts | released (was coder-9 old-lane) | 2026-05-01T00:00Z | 2h | fixture released |`,
    ].join("\n")
    writeFixture(root, { ".coord/shared/claims.md": claims })
    const out = run(root)
    expect(out).toMatch(/src\/heldfile\.ts/)
    expect(out).toMatch(/coder-9 fixture-lane/)
    expect(out).not.toMatch(/src\/oldfile\.ts/)
  })

  it("reports empty queue when QUEUE.md has only POPPED comments + headers", () => {
    const queue = [
      "# Lane queue",
      "",
      "### Wave 99 IN FLIGHT",
      "",
      "<!-- W99-1 fixture POPPED → coder-1 -->",
    ].join("\n")
    writeFixture(root, { ".coord/QUEUE.md": queue })
    const out = run(root)
    expect(out).toMatch(/QUEUE/)
    expect(out).toMatch(/empty|POPPED/)
  })

  it("exits with code 2 when no coord-root can be resolved", () => {
    expect(() => {
      execFileSync("bash", [SCRIPT, "--coord", "/no/such/path/exists"], {
        encoding: "utf8",
        env: { ...process.env, COORD_ROOT: "" },
      })
    }).toThrow()
  })

  it("respects COORD_ROOT env var when --coord is omitted", () => {
    writeFixture(root, {
      ".coord/shared/master-tip.md": "**SHA:** envvar123\n**Pushed at:** 2026-05-26T07:05Z\n",
    })
    const out = execFileSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, COORD_ROOT: root },
    })
    expect(out).toMatch(/envvar123/)
  })

  it("rejects --sync without surprising the caller (smoke: --sync exits 0 on missing remote)", () => {
    // --sync calls `git fetch origin` which fails silently on a non-git
    // directory; the script keeps going (non-fatal) and still prints the rest
    // of the dashboard. We assert it doesn't bail.
    const out = execFileSync("bash", [SCRIPT, "--coord", root, "--sync"], {
      encoding: "utf8",
      env: { ...process.env, COORD_ROOT: "" },
    })
    expect(out).toMatch(/=== end ===/)
  })

  it("rejects unknown flags with exit 2", () => {
    expect(() => {
      execFileSync("bash", [SCRIPT, "--coord", root, "--bogus"], {
        encoding: "utf8",
        env: { ...process.env, COORD_ROOT: "" },
      })
    }).toThrow()
  })
})
