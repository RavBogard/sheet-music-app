/**
 * PERF-05 — edge tap zones on the open chart: the pure decision logic.
 *
 * A single tap in the forward third of the chart area turns forward by about
 * 85% of the viewport (and, at the bottom of the last page, opens the next
 * chart); a tap in the back third does the reverse. The middle third does
 * nothing new. Everything here is a pure function so the gesture rules are
 * unit-tested without a browser; `use-edge-tap-zones.ts` only gathers the
 * pointer samples and applies the result.
 */

/** A tap that moved further than this (in CSS px) is a drag or a scroll. */
export const TAP_MAX_MOVE_PX = 10
/** A press held longer than this (ms) is not a tap (and never a long-press turn). */
export const TAP_MAX_MS = 300
/** A second tap within this window (ms) makes the pair a double-tap: ignored. */
export const DOUBLE_TAP_MS = 300
/** How far one turn scrolls, as a share of the visible height. */
export const TURN_FRACTION = 0.85
/** Slack (px) when deciding "already at the top / bottom". */
export const EDGE_SLACK_PX = 2
/** A tap this soon (ms) after the chart scrolled is a tap to stop momentum scrolling: ignored. */
export const SCROLL_QUIET_MS = 150

export type TapZone = "left" | "middle" | "right"
export type TurnDirection = "forward" | "back"

export interface TapSample {
    x: number
    y: number
    /** Timestamp in ms (any monotonic clock, as long as down and up agree). */
    t: number
}

export interface TapContext {
    /** More than one pointer was down during the gesture (pinch-zoom). */
    multiTouch: boolean
    /** Furthest the pointer travelled from `down` while it was pressed. */
    maxMovePx: number
    /** Zoomed in past fit-width: content wider than the viewport, or a native pinch zoom (see `isZoomedPastFit`). */
    zoomedIn: boolean
    /** Milliseconds between the chart's last scroll event and the press (Infinity when it never scrolled). */
    msSinceScroll: number
    /** A long-press, popover, sheet or other overlay owns the screen. */
    suppressed: boolean
    /** Right-to-left reading order: the LEFT third is forward. */
    isRtl: boolean
}

/** Which third of the chart area an x coordinate falls in. */
export function zoneFor(x: number, left: number, width: number): TapZone {
    if (!(width > 0)) return "middle"
    const rel = (x - left) / width
    if (rel < 1 / 3) return "left"
    if (rel >= 2 / 3) return "right"
    return "middle"
}

/** Map a physical zone to a reading-order direction. */
export function directionForZone(zone: TapZone, isRtl: boolean): TurnDirection | null {
    if (zone === "middle") return null
    const forwardSide: TapZone = isRtl ? "left" : "right"
    return zone === forwardSide ? "forward" : "back"
}

/**
 * Classify one finished press. Returns the turn direction, or `null` when the
 * press is not an edge tap (a drag, a scroll, a held press, a pinch, a tap in
 * the middle third, a tap while zoomed in or while something else is open).
 */
export function classifyTap(
    down: TapSample,
    up: TapSample,
    area: { left: number; width: number },
    ctx: TapContext,
): TurnDirection | null {
    if (ctx.suppressed || ctx.multiTouch || ctx.zoomedIn) return null
    if (ctx.msSinceScroll < SCROLL_QUIET_MS) return null
    const moved = Math.max(ctx.maxMovePx, Math.hypot(up.x - down.x, up.y - down.y))
    if (moved > TAP_MAX_MOVE_PX) return null
    if (up.t - down.t > TAP_MAX_MS) return null
    return directionForZone(zoneFor(down.x, area.left, area.width), ctx.isRtl)
}

/** True when a press starting at `downT` follows the previous tap closely enough to be a double-tap. */
export function isDoubleTap(previousTapUpT: number | null, downT: number): boolean {
    return previousTapUpT !== null && downT - previousTapUpT <= DOUBLE_TAP_MS
}

/**
 * Zoomed in past fit-width: the chart's content is wider than its viewport, or
 * the page is pinch-zoomed. A saved app zoom alone does NOT count — a chart can
 * carry zoom > 1 and still fit the width.
 */
export function isZoomedPastFit(m: { scrollWidth: number; clientWidth: number }, visualScale: number | undefined): boolean {
    if (typeof visualScale === "number" && visualScale > 1.01) return true
    return m.clientWidth > 0 && m.scrollWidth > m.clientWidth + 1
}

export type TurnPlan =
    | { kind: "scroll"; top: number }
    | { kind: "next-chart" }
    | { kind: "previous-chart" }
    | { kind: "none" }

export interface ScrollMetrics {
    scrollTop: number
    clientHeight: number
    scrollHeight: number
}

export interface TurnTargetState {
    /** The viewer has finished rendering the chart (not loading, not an error). */
    ready: boolean
}

/**
 * What a turn does from the current scroll position: scroll a screen, or —
 * already at the bottom (forward) / top (back) — move to the next / previous
 * chart.
 *
 * A forward tap must never skip a chart the musician hasn't seen: nothing
 * happens unless the viewer has finished rendering AND its scroller has been
 * measured (a loading, failed or not-yet-laid-out chart reads as "at the
 * bottom" and would otherwise jump straight to the next song).
 */
export function planTurn(direction: TurnDirection, m: ScrollMetrics, target: TurnTargetState): TurnPlan {
    if (!target.ready) return { kind: "none" }
    if (!(m.clientHeight > 0) || !(m.scrollHeight > 0)) return { kind: "none" }
    const maxTop = Math.max(0, m.scrollHeight - m.clientHeight)
    const step = Math.max(1, Math.round(m.clientHeight * TURN_FRACTION))
    if (direction === "forward") {
        if (m.scrollTop >= maxTop - EDGE_SLACK_PX) return { kind: "next-chart" }
        return { kind: "scroll", top: Math.min(maxTop, m.scrollTop + step) }
    }
    if (m.scrollTop <= EDGE_SLACK_PX) return { kind: "previous-chart" }
    return { kind: "scroll", top: Math.max(0, m.scrollTop - step) }
}

/** Elements inside the chart area whose own taps must never turn a page. */
export const TAP_ZONE_IGNORE_SELECTOR =
    'button, a, input, select, textarea, label, [role="button"], [role="dialog"], [role="menu"], [contenteditable="true"], [data-tap-zone-ignore]'

/** Marks a surface that hosts the tap zones (PDFOverlay's dialog root). It is
 *  never treated as an ignore target, even though it is a `[role="dialog"]`. */
export const TAP_ZONE_SURFACE_ATTR = "data-tap-zone-surface"

/**
 * True when a tap on `target` must not turn a page: some element BETWEEN the
 * target and the tap-zone container (inclusive of the target, exclusive of the
 * container) matches TAP_ZONE_IGNORE_SELECTOR. Ancestors at or above the
 * container never count: the chart viewer itself is a `role="dialog"`, and an
 * unscoped `closest()` would ignore every tap on the chart.
 */
export function isTapZoneIgnoredTarget(target: Element | null, container: Element): boolean {
    let el: Element | null = target
    while (el && el !== container) {
        if (!container.contains(el)) return false
        if (!el.hasAttribute(TAP_ZONE_SURFACE_ATTR) && el.matches(TAP_ZONE_IGNORE_SELECTOR)) return true
        el = el.parentElement
    }
    return false
}
