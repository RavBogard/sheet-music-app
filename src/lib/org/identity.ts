import type { OrgId } from "@/lib/org/types"

/**
 * The web-refresh identity as plain hex, for the surfaces that cannot read the
 * CSS tokens in `globals.css`: the favicon, the Apple touch icon, the OG and
 * Twitter cards (rasters drawn by `next/og`), the browser `theme-color` and the
 * PWA manifest. Keep these in step with the `:root` / `.dark` /
 * `[data-org="brotherslazaroff"]` tokens and with `docs/design/DESIGN.md`.
 *
 * CRC is book-cloth blue on cool white; Brothers Lazaroff is its own deep teal
 * (forced dark), with a slate fourth band instead of CRC's book-cloth blue.
 * A tenant created through config gets CRC's neutral system.
 */
export type OrgIdentity = {
    /** Page ground (OG card background, manifest `background_color`). */
    ground: string
    /** Raised surface (the page block in the icon). */
    paper: string
    /** Primary text on `ground`. */
    ink: string
    /** Secondary text on `ground`. */
    muted: string
    /** The top-bar cloth: icon field, OG top bar, light `theme-color`. */
    shell: string
    /** The top bar in dark mode: dark `theme-color`. */
    shellDark: string
    /** Text on `shell`. */
    shellInk: string
    /** The four section-band hues, in band order (green, oxblood, ochre, fourth). */
    bands: readonly [string, string, string, string]
}

const CRC_IDENTITY: OrgIdentity = {
    ground: "#F6F7FB",
    paper: "#FFFFFF",
    ink: "#18202E",
    muted: "#556072",
    shell: "#23356B",
    shellDark: "#141B30",
    shellInk: "#FFFFFF",
    bands: ["#1F7A6E", "#8E2E3B", "#C58B1A", "#23356B"],
}

const BL_IDENTITY: OrgIdentity = {
    // oklch(0.16 0.028 198) and friends, converted to sRGB hex.
    ground: "#001112",
    paper: "#ECF8F8",
    ink: "#ECF8F8",
    muted: "#99B0B2",
    // Matches BL's manifest / branding themeColor.
    shell: "#04201F",
    shellDark: "#04201F",
    shellInk: "#ECF8F8",
    // The dark-mode section hues (BL is forced dark), slate fourth band.
    bands: ["#1A6A60", "#7E2834", "#B57F17", "#424E5E"],
}

const IDENTITY: Partial<Record<OrgId, OrgIdentity>> = {
    crc: CRC_IDENTITY,
    brotherslazaroff: BL_IDENTITY,
}

export function getOrgIdentity(orgId: OrgId): OrgIdentity {
    return IDENTITY[orgId] ?? CRC_IDENTITY
}
