"use client"

import { Lock, LockOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { WakeLockError } from "@/hooks/use-wake-lock"

/**
 * "🔒 Keep screen on" toggle — gesture-gated WakeLock surface.
 *
 * Pure presentation; the wake-lock state and controls come from
 * `useWakeLock()` (or `useSetlistPerformance` which threads them through).
 * Lives in the glass-bordered header of the Perform setlist surfaces
 * (`SetlistPerformClient`, `PublicSetlistListing`) — the iPad-first hardware
 * Daniel + band run during services ([[project_band_ipad_hardware]]).
 *
 * Role, as of 2026-08-31: a MANUAL OVERRIDE and a status readout — no longer
 * the only way to arm the lock. Perform chart surfaces auto-arm on mount
 * (`<KeepAwakeAutoArm/>`), so the band no longer performs the tap-before-every-
 * service ritual. What this button is still for: turning the lock OFF (that
 * choice is persisted, and auto-arm honours it), and letting Daniel confirm
 * the engaged state before the service starts.
 *
 * The comment that used to live here claimed iOS Safari requires transient
 * user-activation for `navigator.wakeLock.request('screen')`. It does not —
 * the W3C algorithm requires only a visible, active document. The 2026-05-23
 * Yizkor screen-timeout was the iPadOS <18.4 Home-Screen-app wake-lock bug
 * (WebKit 254545); see `use-wake-lock.ts` for the full correction, and
 * `KeepAwakeBanner` for the warning that device now gets.
 *
 * M3-001 peripheral confirmation + failure feedback (cycle-11, 2026-05-28):
 * - **Peripheral pulse-dot:** when `engaged` is true a small pulsing dot
 *   anchors to the top-right of the button so a musician glancing at the
 *   iPad from a music stand can confirm the lock is held without parsing
 *   the icon or label.
 * - **Inline failure alert:** when `lastError` is non-null an absolute-
 *   positioned `role="alert"` pill pops above the button (no toast, no
 *   modal — spatially anchored per UX guidance). Verdict drives the copy:
 *   `'hidden'` → "Tab not focused — tap chart to retry"; `'denied'` →
 *   "Wake-lock blocked — tap again to retry". The pill is auto-dismissed
 *   on the next `onRequest` / `onRelease` (the parent hook clears
 *   `lastError`). `aria-pressed` stays `false` while the verdict is set
 *   so the button doesn't visually claim an engaged lock that isn't.
 *
 * Accessibility:
 * - `aria-pressed` toggle semantics (Button role="button" by default).
 * - h-11 min-w-11 → meets iOS HIG 44px touch-target floor.
 * - When `isSupported === false` (older iPad / non-WakeLock-API browser),
 *   the button stays mounted but disabled with a `title` tooltip — Daniel
 *   sees the affordance and knows why it's inert.
 * - `touch-action: manipulation` kills the iOS 300ms tap delay.
 */

export interface KeepAwakeToggleProps {
    /** Whether the wake-lock is currently held by the browser. */
    isActive: boolean
    /** Whether the WakeLock API is available in this browser. */
    isSupported: boolean
    /** Acquire a wake-lock. A direct user gesture is the strongest retry path. */
    onRequest: () => void | Promise<void>
    /** Release the held wake-lock. */
    onRelease: () => void | Promise<void>
    /** M3-001: reactive failure verdict from the parent `useWakeLock` hook.
     *  When non-null, an inline alert pill surfaces with verdict-specific
     *  recovery copy. Optional — call sites that don't thread it through
     *  fall back to the prior silent-fail behavior. */
    lastError?: WakeLockError
    /** Compact mode hides the label below sm (icon-only). Defaults to true on
     *  Perform surfaces where header space is tight. */
    compact?: boolean
    className?: string
}

const ERROR_COPY: Record<Exclude<WakeLockError, null>, string> = {
    hidden: "Tab not focused — tap chart to retry",
    denied: "Wake-lock blocked — tap again to retry",
}

export function KeepAwakeToggle({
    isActive,
    isSupported,
    onRequest,
    onRelease,
    lastError = null,
    compact = true,
    className,
}: KeepAwakeToggleProps) {
    const handleClick = () => {
        if (isActive) {
            void onRelease()
        } else {
            void onRequest()
        }
    }

    // M3-001: if the last attempt failed, the toggle must NOT claim engaged
    // state. `aria-pressed` and the active styling drive off the composite
    // `engaged` flag (not raw `isActive`), so a failed optimistic flip
    // can't slip through. The hook already keeps `isLocked` false on
    // rejection — this is belt+braces, and aligns with the dispatch AC1.
    const engaged = isActive && !lastError

    const label = engaged ? "Screen lock on — tap to release" : "Keep screen on"
    const ariaLabel = isSupported
        ? label
        : "Keep screen on — wake-lock unavailable on this device"
    const errorText = lastError ? ERROR_COPY[lastError] : null

    return (
        <div className={cn("relative inline-flex", className)}>
            <Button
                type="button"
                onClick={handleClick}
                disabled={!isSupported}
                aria-pressed={engaged}
                aria-label={ariaLabel}
                aria-describedby={errorText ? "keep-awake-error" : undefined}
                title={
                    isSupported
                        ? undefined
                        : "Wake-lock unavailable on this device (needs iOS 16.4+ or a modern browser)"
                }
                size="sm"
                variant="ghost"
                className={cn(
                    // Touch target: iOS HIG floor + native iOS tap-delay kill.
                    "relative h-11 min-w-11 gap-1.5 [touch-action:manipulation]",
                    // Active state: subtle dark-OKLCH-indigo glow on the glass
                    // header so Daniel can see at a glance that the lock holds.
                    // Uses the existing theme `primary` token (indigo OKLCH).
                    engaged
                        ? "text-primary bg-primary/10 hover:bg-primary/15"
                        : "text-muted-foreground",
                    // M3-001: a failed attempt tints the toggle so peripheral
                    // vision picks up the problem even before the alert text
                    // is read.
                    lastError && "text-destructive bg-destructive/10 hover:bg-destructive/15",
                )}
            >
                {engaged ? (
                    <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <LockOpen className="h-4 w-4" aria-hidden="true" />
                )}
                <span
                    className={cn(
                        "text-[11px] font-medium",
                        compact ? "hidden sm:inline" : "inline",
                    )}
                >
                    {engaged ? "Screen on" : "Keep on"}
                </span>
                {/* M3-001 peripheral confirmation pulse — readable in
                    peripheral vision from a music stand. aria-hidden because
                    aria-pressed already announces the engaged state. */}
                {engaged && (
                    <span
                        aria-hidden="true"
                        data-testid="keep-awake-pulse"
                        className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    />
                )}
            </Button>
            {/* M3-001 inline failure alert — spatially anchored above the
                button via absolute positioning so it doesn't reflow the
                toolbar layout. */}
            {errorText && (
                <div
                    id="keep-awake-error"
                    role="alert"
                    data-testid="keep-awake-error"
                    className={cn(
                        "absolute bottom-full right-0 mb-2 z-50 whitespace-nowrap",
                        "rounded-md border border-destructive/40 bg-destructive/95 text-destructive-foreground",
                        "px-2.5 py-1.5 text-[11px] font-medium shadow-lg",
                    )}
                >
                    {errorText}
                </div>
            )}
        </div>
    )
}
