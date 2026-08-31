"use client"

import { useKeepAwake } from "./keep-awake-context"
import { KeepAwakeToggle } from "./KeepAwakeToggle"

/**
 * Self-contained wake-lock control for the public `/perform` landing header.
 *
 * Extracted (FU-c12-3, 2026-05-29) so the `useWakeLock()` hook — and the
 * gesture surface that can fire `navigator.wakeLock.request('screen')` — only
 * mounts for SIGNED-IN viewers. `PublicSetlistListing` renders this component
 * solely inside its `user && !authLoading` branch.
 *
 * Why gate it (option (b), not (a) full-remove): the landing's wake-lock
 * affordance exists for the band-leader who leaves the picker open during a
 * service for quick song-pick (see `PublicSetlistListing` header comment +
 * `KeepAwakeToggle` docstring). Anonymous drive-by visitors and crawlers have
 * no use for it; mounting the hook for them registered an idle
 * `visibilitychange` listener and surfaced a "Keep screen on" button with no
 * purpose. Gating to authed viewers removes that surface from the anon path
 * entirely while preserving the documented leader workflow — full-remove (a)
 * would regress it.
 *
 * NOTE: the wake-lock request never fires on mount here, so this is not
 * fixing an active auto-request bug. It removes a pointless affordance + idle
 * listener from anonymous visitors and makes "the anon landing never touches
 * the WakeLock API" a structural property rather than an incidental one. That
 * property SURVIVES the 2026-08-31 auto-arm wave: `/perform` (this landing)
 * renders no `<KeepAwakeAutoArm/>`, and the layout's KeepAwakeProvider does
 * not arm on its own.
 *
 * 2026-08-31: reads through `useKeepAwake()` rather than `useWakeLock()`
 * directly, so under the /perform layout this toggle drives the ONE shared
 * sentinel instead of minting a private second one that "turn it off" could
 * never fully release.
 */
export function KeepAwakeControl() {
    const {
        isSupported,
        isLocked,
        lastError,
        requestWakeLock,
        releaseWakeLock,
    } = useKeepAwake()

    return (
        <KeepAwakeToggle
            isActive={isLocked}
            isSupported={isSupported}
            onRequest={requestWakeLock}
            onRelease={releaseWakeLock}
            lastError={lastError}
        />
    )
}
