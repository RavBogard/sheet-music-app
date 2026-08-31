"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, LockOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useKeepAwakeContext } from "./keep-awake-context"

/**
 * The honest keep-awake status surface (2026-08-31, wake-lock-durability wave).
 *
 * The failure this exists to end: the toggle read "Screen on" for the whole
 * Yizkor service while no sentinel was actually held. `KeepAwakeToggle` already
 * refuses to claim `aria-pressed` on a *failed* request (M3-001), but it has
 * nothing to say about the much worse case — a lock that was genuinely
 * acquired and then quietly dropped by the OS twenty minutes later. `isArmed`
 * (the musician's intent) and `isLocked` (a live sentinel) are different facts,
 * and the gap between them is the only thing worth interrupting anyone about.
 *
 * So this renders NOTHING unless intent is armed and the lock is not held.
 * When it does render it is a small, fixed, tappable strip — not a toast, not
 * a modal, nothing that moves. It is read from a music stand, mid-service, out
 * of the corner of an eye. Tapping it re-arms inside a real gesture, which is
 * also the most likely thing to make the request succeed.
 *
 * Second case, and the more honest one: on a Home-Screen (standalone) install
 * running iPadOS < 18.4, WebKit bug 254545 means the OS will sleep the screen
 * no matter what the page does — `request('screen')` resolves, the sentinel
 * reports held, and the iPad dims anyway. Telling the musician "screen may
 * sleep, tap to fix" there would be a lie. That device gets a different
 * message pointing at the only thing that actually works: Settings →
 * Display & Brightness → Auto-Lock → Never.
 */

/**
 * Is this a Home-Screen install on an iPadOS build predating the WebKit 254545
 * fix (18.4)?
 *
 * Deliberately conservative — it returns `false` whenever it cannot *prove*
 * the answer, because a false warning mid-service is worse than a missing one:
 *
 * - Not `display-mode: standalone` → false. In a normal Safari tab the wake
 *   lock works on these builds; the bug is standalone-only.
 * - iPadOS 13+ can report a desktop `Macintosh` UA with no OS version token at
 *   all. We detect the iPad (Macintosh + multi-touch) but then find no version
 *   → false. Better silent than wrong.
 */
export function isLegacyStandaloneIpad(): boolean {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false

    const mm = window.matchMedia
    if (typeof mm !== "function") return false
    let standalone = false
    try {
        standalone = mm.call(window, "(display-mode: standalone)").matches
    } catch {
        return false
    }
    if (!standalone) return false

    const ua = navigator.userAgent || ""
    const isIpad =
        /iPad/.test(ua) ||
        (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
    if (!isIpad) return false

    // "CPU OS 17_5 like Mac OS X" — the iPad-UA form, which is what a
    // standalone home-screen app actually sends (it omits Version/ and Safari).
    const match = /(?:CPU )?OS (\d+)[._](\d+)/.exec(ua)
    if (!match) return false
    const major = Number(match[1])
    const minor = Number(match[2])
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false

    return major < 18 || (major === 18 && minor < 4)
}

export function KeepAwakeBanner() {
    const keepAwake = useKeepAwakeContext()
    const [legacyStandalone, setLegacyStandalone] = useState(false)
    const [dismissedOsWarning, setDismissedOsWarning] = useState(false)

    // Read the environment in an effect, never during render: `matchMedia` and
    // `navigator.userAgent` do not exist during SSR/prerender, and /perform is
    // statically exported. Starting `false` also keeps hydration byte-identical.
    useEffect(() => {
        setLegacyStandalone(isLegacyStandaloneIpad())
    }, [])

    if (!keepAwake) return null

    const { isArmed, isLocked, isSupported, requestWakeLock } = keepAwake

    // The OS-level warning outranks the tap-to-retry one: on that build a
    // successful acquire does not mean the screen stays on, so we say so even
    // while `isLocked` is true.
    if (isArmed && legacyStandalone && !dismissedOsWarning) {
        return (
            <div
                data-testid="keep-awake-os-warning"
                role="status"
                aria-live="polite"
                className={cn(
                    "fixed inset-x-0 bottom-0 z-40 pointer-events-none",
                    "flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                )}
            >
                <button
                    type="button"
                    onClick={() => setDismissedOsWarning(true)}
                    className={cn(
                        "pointer-events-auto flex items-start gap-2 max-w-md text-left",
                        "rounded-lg border border-amber-500/30 bg-background/90 backdrop-blur",
                        "px-3 py-2 text-[11px] leading-snug text-muted-foreground shadow-lg",
                        "[touch-action:manipulation]",
                    )}
                >
                    <AlertTriangle
                        className="h-4 w-4 shrink-0 mt-px text-amber-400"
                        aria-hidden="true"
                    />
                    <span>
                        <span className="font-medium text-foreground">
                            This iPad can&apos;t be kept awake from the Home-Screen app.
                        </span>{" "}
                        iPadOS before 18.4 ignores the screen wake lock in installed web
                        apps. Set Settings → Display &amp; Brightness → Auto-Lock →
                        Never for the service.{" "}
                        <span className="opacity-60">Tap to dismiss.</span>
                    </span>
                </button>
            </div>
        )
    }

    // The only other thing worth saying: you asked for this, and it isn't on.
    if (!isArmed || isLocked || !isSupported) return null

    return (
        <div
            data-testid="keep-awake-banner"
            role="status"
            aria-live="polite"
            className={cn(
                "fixed inset-x-0 bottom-0 z-40 pointer-events-none",
                "flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
        >
            <button
                type="button"
                onClick={() => void requestWakeLock()}
                aria-label="Screen may sleep — tap to keep awake"
                className={cn(
                    "pointer-events-auto flex items-center gap-2",
                    // h-11 keeps the iOS HIG 44px touch floor even though the
                    // strip itself is visually slim.
                    "h-11 rounded-full border border-border/40 bg-background/90 backdrop-blur",
                    "px-4 text-[11px] font-medium text-muted-foreground shadow-lg",
                    "[touch-action:manipulation]",
                )}
            >
                <LockOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Screen may sleep — tap to keep awake
            </button>
        </div>
    )
}
