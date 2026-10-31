import { describe, it, expect, afterEach } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
    detectWatchdogInstalled,
    LAUNCH_MARKER_FILE,
    MARKER_MAX_AGE_MS,
    readAndClearLaunchMarker,
    resolveLaunchReason,
    WATCHDOG_TASK_NAME,
    writeLaunchMarker,
} from "../launch-info"

const dirs: string[] = []
function tmp(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-launch-"))
    dirs.push(d)
    return d
}
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe("launch reason (BET-4 / MIXER-12)", () => {
    it("a marker written before the relaunch wins over argv, and is consumed once", () => {
        const dir = tmp()
        writeLaunchMarker(dir, "update", 1_000)
        const marker = readAndClearLaunchMarker(dir, 2_000)
        expect(marker).toBe("update")
        expect(resolveLaunchReason({ argv: ["exe", "--processStart"], marker })).toBe("update")
        expect(fs.existsSync(path.join(dir, LAUNCH_MARKER_FILE))).toBe(false)
        expect(readAndClearLaunchMarker(dir, 3_000)).toBeNull()
    })

    it("a stale or garbled marker is ignored", () => {
        const dir = tmp()
        writeLaunchMarker(dir, "manual", 0)
        expect(readAndClearLaunchMarker(dir, MARKER_MAX_AGE_MS + 1)).toBeNull()
        fs.writeFileSync(path.join(dir, LAUNCH_MARKER_FILE), "{not json")
        expect(readAndClearLaunchMarker(dir, 0)).toBeNull()
        fs.writeFileSync(path.join(dir, LAUNCH_MARKER_FILE), JSON.stringify({ reason: "cosmic-ray", at: 0 }))
        expect(readAndClearLaunchMarker(dir, 0)).toBeNull()
    })

    it("argv: login item → boot, watchdog (--hidden) → watchdog, explicit flag, otherwise manual", () => {
        expect(
            resolveLaunchReason({ argv: ["exe", "--processStart", '"exe"', "--process-start-args", '"--hidden"'], marker: null }),
        ).toBe("boot")
        expect(resolveLaunchReason({ argv: ["exe", "--hidden"], marker: null })).toBe("watchdog")
        expect(resolveLaunchReason({ argv: ["exe", "--hidden", "--launched-by=watchdog"], marker: null })).toBe("watchdog")
        expect(resolveLaunchReason({ argv: ["exe", "--launched-by=boot"], marker: null })).toBe("boot")
        expect(resolveLaunchReason({ argv: ["exe", "--launched-by=bogus"], marker: null })).toBe("manual")
        expect(resolveLaunchReason({ argv: ["exe"], marker: null })).toBe("manual")
    })

    it("watchdogInstalled queries the scheduled task on Windows only", async () => {
        const calls: string[][] = []
        const run = async (cmd: string, args: string[]) => {
            calls.push([cmd, ...args])
            return true
        }
        expect(await detectWatchdogInstalled(run, "win32")).toBe(true)
        expect(calls[0]).toEqual(["schtasks", "/Query", "/TN", WATCHDOG_TASK_NAME])
        expect(await detectWatchdogInstalled(async () => false, "win32")).toBe(false)
        expect(await detectWatchdogInstalled(async () => { throw new Error("x") }, "win32")).toBe(false)
        expect(await detectWatchdogInstalled(run, "linux")).toBe(false)
    })
})
