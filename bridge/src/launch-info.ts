/**
 * Why this bridge process started, and whether the watchdog is installed
 * (BET-4 / MIXER-12).
 *
 * Michael powers the studio PC and Drew runs the desk; neither can tell from the
 * cloud whether a restart came from a reboot, the watchdog, an auto-update or a
 * person. The heartbeat now publishes `bridge.launchReason` and
 * `bridge.watchdogInstalled`, so `get_bridge_health` can say "restarted 2h ago
 * by: update" and confirm the watchdog task exists.
 *
 * How the reason is decided, most reliable first:
 *   1. A marker file the PREVIOUS process wrote just before it relaunched itself
 *      (`update` before quitAndInstall, `manual` before a remote restart). It is
 *      read once and deleted; a marker older than MARKER_MAX_AGE_MS is ignored so
 *      a leftover never mislabels a later launch.
 *   2. An explicit `--launched-by=<reason>` argument.
 *   3. The Windows login item passes `--processStart` → `boot`.
 *   4. The watchdog script starts the exe with a bare `--hidden` → `watchdog`.
 *   5. Anything else (someone double-clicked it) → `manual`.
 */

import * as fs from "fs"
import * as path from "path"
import { execFile } from "child_process"

export type LaunchReason = "boot" | "watchdog" | "update" | "manual"

const REASONS: readonly LaunchReason[] = ["boot", "watchdog", "update", "manual"]

export const LAUNCH_MARKER_FILE = "launch-reason.json"
export const MARKER_MAX_AGE_MS = 10 * 60_000

/** The Windows scheduled task name from bridge/watchdog/INSTALL.md. */
export const WATCHDOG_TASK_NAME = "CRC Bridge Watchdog"

export function isLaunchReason(v: unknown): v is LaunchReason {
    return typeof v === "string" && (REASONS as readonly string[]).includes(v)
}

/** Record why the NEXT launch happens. Never throws. */
export function writeLaunchMarker(dir: string, reason: LaunchReason, now: number = Date.now()): void {
    try {
        fs.writeFileSync(path.join(dir, LAUNCH_MARKER_FILE), JSON.stringify({ reason, at: now }))
    } catch {
        // Best effort: without the marker the launch falls back to argv.
    }
}

/** Read and delete the marker. Returns null when absent, unreadable or stale. */
export function readAndClearLaunchMarker(dir: string, now: number = Date.now()): LaunchReason | null {
    const file = path.join(dir, LAUNCH_MARKER_FILE)
    let raw: string
    try {
        raw = fs.readFileSync(file, "utf8")
    } catch {
        return null
    }
    try {
        fs.unlinkSync(file)
    } catch {
        // A marker we can't delete is still read once per launch; the age check
        // below keeps it from mislabelling launches after the window.
    }
    try {
        const parsed = JSON.parse(raw) as { reason?: unknown; at?: unknown }
        if (!isLaunchReason(parsed.reason)) return null
        if (typeof parsed.at !== "number" || now - parsed.at > MARKER_MAX_AGE_MS || parsed.at > now + 60_000) {
            return null
        }
        return parsed.reason
    } catch {
        return null
    }
}

export function resolveLaunchReason(input: { argv: readonly string[]; marker: LaunchReason | null }): LaunchReason {
    if (input.marker) return input.marker
    const argv = input.argv.map((a) => a.replace(/^"|"$/g, ""))
    for (const a of argv) {
        const m = /^--launched-by=(.+)$/.exec(a)
        if (m && isLaunchReason(m[1])) return m[1]
    }
    if (argv.includes("--processStart")) return "boot"
    if (argv.includes("--hidden")) return "watchdog"
    return "manual"
}

export type CommandRunner = (cmd: string, args: string[]) => Promise<boolean>

const defaultRunner: CommandRunner = (cmd, args) =>
    new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err) => resolve(!err))
        } catch {
            resolve(false)
        }
    })

/**
 * Whether the watchdog scheduled task exists on this PC. Windows only; false
 * elsewhere or when the query fails.
 */
export async function detectWatchdogInstalled(
    run: CommandRunner = defaultRunner,
    platform: string = process.platform,
): Promise<boolean> {
    if (platform !== "win32") return false
    try {
        return await run("schtasks", ["/Query", "/TN", WATCHDOG_TASK_NAME])
    } catch {
        return false
    }
}
