"use client"

import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * v11.1-01: org-aware nav logo. Renders the host org's logo image when a
 * `logoUrl` is set, otherwise a brand-colored circular initials monogram.
 *
 * Presentational: it renders from the server-resolved branding props in
 * `(main)/layout.tsx` (SSR'd like any client component), so there is no
 * CRC-default flash. Phase 7: a client component only for `useT()` (the alt
 * text); the server login page renders it as a client island. The monogram inherits the per-org brand color
 * automatically: `bg-brand`/`text-brand-foreground` flip to navy under
 * `[data-org="brotherslazaroff"]` (set on <html> server-side), indigo for CRC.
 *
 * CRC passes `logoUrl="/logo.jpg"` → a <picture> of the pre-sized
 * `/logo-64|128.{avif,webp,jpg}` files (perf audit P1-1), never the 587 KB
 * source. Any other logoUrl renders as given, sized to the circle.
 */

/** CRC's configured logo URL (the full-size source; see the pre-sized branch below). */
const CRC_LOGO = "/logo.jpg"

/** First letter of up to two words, uppercased (e.g. "Brothers Lazaroff" → "BL"). */
function initialsFor(shortName: string): string {
    const words = shortName.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return "?"
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

export function OrgLogo({
    logoUrl,
    shortName,
    sizeClass,
}: {
    logoUrl: string
    shortName: string
    /** Tailwind size for the circle, e.g. "w-8 h-8" (desktop) / "w-7 h-7" (mobile). */
    sizeClass: string
}) {
    const t = useT()
    // CRC keeps its canonical descriptive alt (its full name, a brand: verbatim);
    // other orgs derive from shortName.
    const crcName = "Central Reform Congregation"
    const alt = t("nav.orgLogoAlt", { orgName: logoUrl === CRC_LOGO ? crcName : shortName })

    if (logoUrl === CRC_LOGO) {
        // Perf audit P1-1: the source logo.jpg is 1000x1000 / 587 KB, painted
        // at 28-32 CSS px on every Perform and app page. Serve the committed
        // pre-sized files instead (scripts/ops/make-logo-sizes.mjs): AVIF,
        // then WebP, then a JPEG fallback, 64px for 1x-2x and 128px above.
        // The width/height attributes reserve the box before it decodes.
        return (
            <picture>
                <source type="image/avif" srcSet="/logo-64.avif 64w, /logo-128.avif 128w" sizes="32px" />
                <source type="image/webp" srcSet="/logo-64.webp 64w, /logo-128.webp 128w" sizes="32px" />
                <img
                    src="/logo-64.jpg"
                    srcSet="/logo-64.jpg 64w, /logo-128.jpg 128w"
                    sizes="32px"
                    width={32}
                    height={32}
                    decoding="async"
                    alt={alt}
                    className={cn(sizeClass, "rounded-full border border-border transition-opacity group-hover:opacity-80")}
                />
            </picture>
        )
    }

    if (logoUrl) {
        return (

            <img
                src={logoUrl}
                alt={alt}
                width={32}
                height={32}
                decoding="async"
                className={cn(sizeClass, "rounded-full border border-border object-cover transition-opacity group-hover:opacity-80")}
            />
        )
    }

    return (
        <span
            role="img"
            aria-label={t("nav.orgLogoAlt", { orgName: shortName })}
            className={cn(
                sizeClass,
                "flex items-center justify-center rounded-full border border-border",
                "bg-brand text-brand-foreground font-display font-bold text-xs leading-none",
                "transition-opacity group-hover:opacity-80",
            )}
        >
            {initialsFor(shortName)}
        </span>
    )
}
