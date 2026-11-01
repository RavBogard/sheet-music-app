"use client"

/**
 * Makes a full-screen surface that is not a Radix Dialog behave as a modal
 * dialog for keyboard and screen-reader users (WCAG 2.4.3, 1.3.1):
 *
 * - While mounted, everything outside the surface is `inert` (removed from
 *   the tab order and the accessibility tree). Live regions and the toast
 *   stack are left alone so announcements still reach the screen reader.
 * - Focus moves into the surface on mount and returns to the element that
 *   had it (the setlist row that opened the chart) on unmount.
 * - Tab and Shift+Tab wrap inside the surface.
 *
 * Pointer input is untouched inside the surface: tap zones, the leader's
 * long-press and Escape keep working. Popovers and sheets that portal to
 * <body> after the surface opens are not made inert; they bring their own
 * focus handling.
 */

import { useEffect, type RefObject } from "react"

// `data-modal-keep`: status the musician should still get over the chart (the offline pill).
const SKIP_INERT_SELECTOR = "[aria-live], [data-sonner-toaster], [data-modal-keep]"
const SKIP_INERT_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "LINK", "NOSCRIPT"])

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
].join(",")

/** Sets `inert` on every element outside `root`; returns an undo function. */
export function inertOutside(root: HTMLElement): () => void {
    const changed: HTMLElement[] = []
    let node: HTMLElement | null = root
    while (node && node.parentElement && node !== document.body) {
        const parent: HTMLElement = node.parentElement
        for (const sibling of Array.from(parent.children)) {
            if (sibling === node || !(sibling instanceof HTMLElement)) continue
            if (SKIP_INERT_TAGS.has(sibling.tagName)) continue
            if (sibling.matches(SKIP_INERT_SELECTOR)) continue
            if (sibling.hasAttribute("inert")) continue
            sibling.setAttribute("inert", "")
            changed.push(sibling)
        }
        node = parent
    }
    return () => {
        for (const el of changed) el.removeAttribute("inert")
    }
}

function focusablesIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true",
    )
}

export interface ModalSurfaceOptions {
    /** Element to focus on open. Defaults to the surface itself. */
    initialFocusRef?: RefObject<HTMLElement | null>
}

export function useModalSurface(rootRef: RefObject<HTMLElement | null>, options: ModalSurfaceOptions = {}): void {
    const { initialFocusRef } = options
    useEffect(() => {
        const root = rootRef.current
        if (!root || typeof document === "undefined") return

        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const undoInert = inertOutside(root)

        const target = initialFocusRef?.current ?? root
        try {
            target.focus({ preventScroll: true })
        } catch {
            target.focus()
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab" || e.defaultPrevented) return
            const active = document.activeElement
            // Focus in a portaled popover or sheet: that layer owns Tab.
            if (active && active !== document.body && !root.contains(active)) return
            const items = focusablesIn(root)
            if (items.length === 0) {
                e.preventDefault()
                root.focus()
                return
            }
            const first = items[0]
            const last = items[items.length - 1]
            if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && (active === last || !root.contains(active))) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener("keydown", onKeyDown)

        return () => {
            document.removeEventListener("keydown", onKeyDown)
            undoInert()
            if (opener && opener.isConnected) {
                try {
                    opener.focus({ preventScroll: true })
                } catch {
                    opener.focus()
                }
            }
        }
        // Mount/unmount only: the surface is the same element for its lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
}
