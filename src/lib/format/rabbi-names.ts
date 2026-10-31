/**
 * WEB-06: normalise the free-text `rabbi` field of a setlist for the /setlists
 * filter chips ONLY. Display and the stored value are untouched: the stored
 * strings are fixed at the source through MCP `update_setlist`.
 *
 * Trim, decode the handful of HTML entities that leaked into stored values,
 * drop parenthetical notes ("(Rabbi Randy — Torah service)"), collapse a doubled
 * "Rabbi Rabbi", and split one field into the people it names on "/" and "&".
 * Pure and client-safe.
 */
const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&#38;": "&",
    "&#x26;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
}

function decodeEntities(s: string): string {
    return s.replace(/&(amp|quot|apos|lt|gt|nbsp|#38|#x26|#39);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

export function rabbiNames(raw: unknown): string[] {
    if (typeof raw !== "string") return []
    const decoded = decodeEntities(decodeEntities(raw)).replace(/\([^)]*\)/g, " ")
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of decoded.split(/[/&]/)) {
        const name = part
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^(rabbi\s+)(rabbi\s+)+/i, "$1")
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(name)
    }
    return out
}

/** Does this setlist's rabbi field name the person the chip stands for? */
export function rabbiMatches(raw: unknown, chip: string): boolean {
    const key = chip.trim().toLowerCase()
    return rabbiNames(raw).some((n) => n.toLowerCase() === key)
}
