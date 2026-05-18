import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_1px_rgba(255,255,255,0.1)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 shadow-[inset_0_1px_rgba(255,255,255,0.2)]",
        outline:
          "border border-border/50 bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-border/60 dark:bg-input/10 dark:hover:bg-secondary/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-secondary/30",
        link: "text-primary underline-offset-4 hover:underline",
        brand: "bg-brand text-brand-foreground hover:bg-brand/85 shadow-[inset_0_1px_rgba(255,255,255,0.15)] focus-visible:ring-brand/30",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const ICON_SIZES = new Set(["icon", "icon-xs", "icon-sm", "icon-lg"])

/**
 * Icon-only buttons (size variants from ICON_SIZES) render a single SVG glyph
 * with no surrounding text. Screen readers announce them as bare "button" unless
 * the call-site provides an accessible name. Per WCAG 4.1.2 we require ONE of:
 *   - aria-label / aria-labelledby on the Button
 *   - title attribute (announced as fallback name)
 *   - sr-only text child
 *   - <title> element inside the SVG child
 *
 * Enforced as a dev-mode console.warn so missing labels surface during local
 * work / Storybook / Playwright without breaking prod. Caught the cycle-3.5
 * cluster of 84 unnamed icon-buttons on /setlists; keeps future callsites
 * from re-introducing the regression.
 */
function hasAccessibleName(
  props: React.ComponentProps<"button">,
  children: React.ReactNode,
): boolean {
  if (props["aria-label"]) return true
  if (props["aria-labelledby"]) return true
  if (props.title) return true

  let labeled = false
  React.Children.forEach(children, (child) => {
    if (labeled) return
    if (typeof child === "string" && child.trim().length > 0) {
      labeled = true
      return
    }
    if (!React.isValidElement(child)) return
    const el = child as React.ReactElement<{
      className?: string
      children?: React.ReactNode
      "aria-label"?: string
    }>
    const cls = el.props?.className
    if (typeof cls === "string" && cls.includes("sr-only")) {
      labeled = true
      return
    }
    if (el.props?.["aria-label"]) {
      labeled = true
      return
    }
    // Walk into SVG children one level for <title> elements (lucide icons
    // expose name via aria-label or a <title> child when given a title prop).
    if (el.props?.children) {
      React.Children.forEach(el.props.children, (grand) => {
        if (labeled) return
        if (!React.isValidElement(grand)) return
        if ((grand.type as { displayName?: string } | string) === "title") {
          labeled = true
        }
      })
    }
  })
  return labeled
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  if (
    process.env.NODE_ENV !== "production" &&
    !asChild &&
    typeof size === "string" &&
    ICON_SIZES.has(size) &&
    !hasAccessibleName(props as React.ComponentProps<"button">, children)
  ) {
    console.warn(
      "[Button] icon-only Button is missing an accessible name. Add `aria-label`, `title`, " +
        "an `sr-only` text child, or a `<title>` element inside the SVG. " +
        "(WCAG 4.1.2 — see .coord/inbox/cycle35-a11y-sweep.md P2-001)",
    )
  }

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
