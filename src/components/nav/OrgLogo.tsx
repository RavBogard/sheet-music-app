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
 * CRC always passes `logoUrl="/logo.jpg"` → the <img> branch reproduces the
 * prior hardcoded DesktopHeader/MobileHeader logo byte-identically.
 */

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
    const alt = t("nav.orgLogoAlt", { orgName: logoUrl === "/logo.jpg" ? crcName : shortName })

    if (logoUrl) {
        return (

            <img
                src={logoUrl}
                alt={alt}
                className={cn(sizeClass, "rounded-full border border-border transition-opacity group-hover:opacity-80")}
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
