"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type DenseListProps = React.HTMLAttributes<HTMLUListElement>

/**
 * DenseList — Logic-Pro track-list density list wrapper.
 * Children should be DenseRow. Renders as <ul> for a11y; pass
 * aria-label or aria-labelledby so screen-readers can announce it.
 */
export const DenseList = React.forwardRef<HTMLUListElement, DenseListProps>(
  function DenseList({ className, children, ...rest }, ref) {
    return (
      <ul ref={ref} className={cn("dense-list", className)} role="list" {...rest}>
        {children}
      </ul>
    )
  }
)

export type DenseRowProps = React.LiHTMLAttributes<HTMLLIElement> & {
  /** Adds cursor-pointer + hover tint; auto-becomes role="button" when onClick set. */
  interactive?: boolean
  /** Renders the row in the v2 accent color (used for "currently playing", etc.). */
  active?: boolean
}

/**
 * DenseRow — single 32px row inside a DenseList.
 * Compose children as flex items (icon | title | meta | trailing).
 * Use `interactive` for hoverable/clickable rows; pair with onClick + onKeyDown
 * for keyboard activation (Enter/Space). Active rows render with an accent
 * left-edge marker so the eye can scan a long list.
 */
export const DenseRow = React.forwardRef<HTMLLIElement, DenseRowProps>(
  function DenseRow({ className, interactive, active, onClick, onKeyDown, children, ...rest }, ref) {
    const isButton = Boolean(onClick)
    const handleKey = React.useCallback(
      (e: React.KeyboardEvent<HTMLLIElement>) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (isButton && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onClick?.(e as unknown as React.MouseEvent<HTMLLIElement>)
        }
      },
      [isButton, onClick, onKeyDown]
    )

    return (
      <li
        ref={ref}
        role={isButton ? "button" : undefined}
        tabIndex={isButton ? 0 : undefined}
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        onKeyDown={handleKey}
        className={cn(
          "dense-row",
          interactive && "dense-row-interactive hover:bg-amber-500/[0.07] focus-visible:bg-amber-500/[0.10]",
          interactive && "focus-visible:outline-none focus-visible:ring-2 ring-v2-accent",
          active && "bg-amber-500/[0.12] border-l-2 border-l-amber-400 pl-[10px]",
          className
        )}
        {...rest}
      >
        {children}
      </li>
    )
  }
)
