"use client"

import { Lock, LockOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * "🔒 Keep screen on" toggle — gesture-gated WakeLock surface.
 *
 * Pure presentation; the wake-lock state and controls come from
 * `useWakeLock()` (or `useSetlistPerformance` which threads them through).
 * Lives in the glass-bordered header of the Perform setlist surfaces
 * (`SetlistPerformClient`, `PublicSetlistListing`) — the iPad-first hardware
 * Daniel + band run during services ([[project_band_ipad_hardware]]).
 *
 * Why a header toggle and not auto-on-mount: iOS Safari requires
 * `navigator.wakeLock.request('screen')` to run inside transient
 * user-activation. A mount-time call rejects with NotAllowedError and the
 * lock silently never engages — exactly the Yizkor-service screen-timeout
 * Daniel reported 2026-05-23. A tap-to-arm pattern guarantees the gesture
 * and surfaces the lock state so the band can verify it before the service
 * starts.
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
    /** Acquire a wake-lock — MUST be called from inside a user-gesture handler. */
    onRequest: () => void | Promise<void>
    /** Release the held wake-lock. */
    onRelease: () => void | Promise<void>
    /** Compact mode hides the label below sm (icon-only). Defaults to true on
     *  Perform surfaces where header space is tight. */
    compact?: boolean
    className?: string
}

export function KeepAwakeToggle({
    isActive,
    isSupported,
    onRequest,
    onRelease,
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

    const label = isActive ? "Screen lock on — tap to release" : "Keep screen on"
    const ariaLabel = isSupported
        ? label
        : "Keep screen on — wake-lock unavailable on this device"

    return (
        <Button
            type="button"
            onClick={handleClick}
            disabled={!isSupported}
            aria-pressed={isActive}
            aria-label={ariaLabel}
            title={
                isSupported
                    ? undefined
                    : "Wake-lock unavailable on this device (needs iOS 16.4+ or a modern browser)"
            }
            size="sm"
            variant="ghost"
            className={cn(
                // Touch target: iOS HIG floor + native iOS tap-delay kill.
                "h-11 min-w-11 gap-1.5 [touch-action:manipulation]",
                // Active state: subtle dark-OKLCH-indigo glow on the glass
                // header so Daniel can see at a glance that the lock holds.
                // Uses the existing theme `primary` token (indigo OKLCH).
                isActive
                    ? "text-primary bg-primary/10 hover:bg-primary/15"
                    : "text-muted-foreground",
                className,
            )}
        >
            {isActive ? (
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
                {isActive ? "Screen on" : "Keep on"}
            </span>
        </Button>
    )
}
