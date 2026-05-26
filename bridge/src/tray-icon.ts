/**
 * Tray-icon health-color module (Lane #9 / F-A3).
 *
 * Surfaces bridge health at the system tray itself so the operator no longer has to
 * Alt-Tab to the dashboard to read x32Connected / stateFresh — the most common
 * "is the bridge alive?" question gets a 1-glance peripheral answer.
 *
 * Two exports:
 *
 *   - `pickTrayColor(status)` — PURE selector. Picks 'red' | 'orange' | 'green' from
 *     a bridge-status snapshot. No Electron dependencies. Unit-tested directly.
 *
 *   - `createTrayIcon(color)` — Electron-side factory. Generates a tinted 16×16
 *     circle as `nativeImage`, matching the legacy violet shape so the tray slot
 *     keeps its visual identity but the FILL communicates health.
 *
 * Color semantics:
 *   green   — X32 reachable AND monitor-live/state writes are fresh (everything's fine)
 *   orange  — X32 reachable but state writes are stale (write-path stuck; see
 *             [[project_bridge_state_freshness_diagnostic]])
 *   red     — X32 unreachable (broadcast-discovery / socket dead)
 *
 * Defensive defaults: when the status object is missing or `x32Connected` is
 * unknown/false → RED. When `x32Connected: true` but `stateFresh` is undefined
 * (current production reality — `stateFresh` is computed inside `main()` and not
 * yet surfaced via `getBridgeStatus()`) → GREEN, on the principle that "as far
 * as the tray can tell, we're alive". The orange branch lights up automatically
 * the instant `stateFresh` joins `BridgeInternalStatus`.
 */

// Type-only import: erased by tsc → vite's import-analysis pass never sees an
// `electron` runtime reference at module-load (the runtime require is deferred
// into `createTrayIcon()` below). This lets root vitest collect this module
// without electron resolvable in root node_modules (electron is a bridge-scoped
// dep). See tray-icon.test.ts file-header for the matching test-side rationale.
import type { NativeImage } from "electron"

export type TrayHealthColor = "red" | "orange" | "green"

/**
 * Minimal status shape pickTrayColor reads. Intentionally narrower than
 * BridgeInternalStatus so this module stays cheap to test and forward-
 * compatible with the eventual stateFresh extension.
 */
export interface TrayHealthStatus {
    x32Connected?: boolean
    stateFresh?: boolean
}

/**
 * Pure selector. Maps a bridge-status snapshot to a tray health color.
 *
 * Truth table:
 *   status undefined / null              → red  (defensive)
 *   x32Connected !== true                → red  (socket dead)
 *   x32Connected true, stateFresh false  → orange (writes stuck)
 *   x32Connected true, stateFresh true   → green (healthy)
 *   x32Connected true, stateFresh undef  → green (current prod; orange impossible
 *                                                  until stateFresh is surfaced)
 */
export function pickTrayColor(status: TrayHealthStatus | null | undefined): TrayHealthColor {
    if (!status) return "red"
    if (status.x32Connected !== true) return "red"
    if (status.stateFresh === false) return "orange"
    return "green"
}

/**
 * RGB tints per color. Chosen to read clearly at 16×16 in both light + dark
 * Windows tray backgrounds. Tailwind-ish palette to stay coherent with the
 * dashboard UI.
 */
const COLOR_RGB: Record<TrayHealthColor, { r: number; g: number; b: number }> = {
    red: { r: 0xef, g: 0x44, b: 0x44 },   // tailwind red-500
    orange: { r: 0xf5, g: 0x9e, b: 0x0b },// tailwind amber-500
    green: { r: 0x10, g: 0xb9, b: 0x81 }, // tailwind emerald-500
}

/**
 * Render a 16×16 RGBA circle of the given color, returning an Electron
 * `NativeImage` ready for `tray.setImage()`. Same geometry as the legacy
 * violet tray icon so the slot stays visually consistent.
 *
 * Exported separately so callers can stamp the image to disk / inspect bytes
 * during a smoke test; the main path is `createTrayIcon(color)` below.
 */
export function renderTrayIconBuffer(color: TrayHealthColor, size = 16): Buffer {
    const { r, g, b } = COLOR_RGB[color]
    const canvas = Buffer.alloc(size * size * 4) // RGBA

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cx = x - size / 2 + 0.5
            const cy = y - size / 2 + 0.5
            const dist = Math.sqrt(cx * cx + cy * cy)
            const offset = (y * size + x) * 4

            if (dist < size / 2 - 0.5) {
                canvas[offset] = r
                canvas[offset + 1] = g
                canvas[offset + 2] = b
                canvas[offset + 3] = 0xff
            } else if (dist < size / 2 + 0.5) {
                // Anti-aliased edge
                const alpha = Math.round((size / 2 + 0.5 - dist) * 255)
                canvas[offset] = r
                canvas[offset + 1] = g
                canvas[offset + 2] = b
                canvas[offset + 3] = Math.max(0, Math.min(255, alpha))
            }
            // else: transparent (Buffer.alloc already zero-filled)
        }
    }

    return canvas
}

/**
 * Electron-side factory. Returns a 16×16 tinted-circle NativeImage for the
 * given health color. Pure-function-by-default: the only Electron call is the
 * final `nativeImage.createFromBuffer` wrap.
 */
export function createTrayIcon(color: TrayHealthColor): NativeImage {
    // Function-scoped require: defers the only runtime `electron` reference in
    // this module past vite's static import-analysis. Test runners that stub
    // `electron` via `vi.mock` (see tray-icon.test.ts) intercept here as before.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nativeImage } = require("electron") as typeof import("electron")
    const size = 16
    const buffer = renderTrayIconBuffer(color, size)
    return nativeImage.createFromBuffer(buffer, { width: size, height: size })
}
