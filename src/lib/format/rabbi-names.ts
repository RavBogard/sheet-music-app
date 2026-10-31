/**
 * WEB-06: normalise the free-text `rabbi` field of a setlist for the /setlists
 * filter chips ONLY. Display and the stored value are untouched: the stored
 * strings are fixed at the source through MCP `update_setlist`.
 *
 * Trim, decode the handful of HTML entities that leaked into stored values,
 * drop parenthetical notes ("(Rabbi Randy — Torah service)"), split one field
 * into the people it names on "/", "&", "," and "and", then reduce each to the
 * person: the title ("Rabbi", "Rabbi Rabbi") is dropped and the first name is
 * the key, so "Rabbi Daniel Bogard", "Rabbi Rabbi Daniel Bogard" and "Daniel"
 * are one chip ("Daniel"; the chip label adds the title back). Two people with
 * the same first name would share a chip. Pure and client-safe.
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
    for (const part of decoded.split(/[/&,]|\s+and\s+/i)) {
        const person = part
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^(rabbi\s+)+/i, "")
            .split(" ")[0]
        if (!person || /^rabbi$/i.test(person)) continue
        const key = person.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(person)
    }
    return out
}

/** Does this setlist's rabbi field name the person the chip stands for? Every raw variant matches. */
export function rabbiMatches(raw: unknown, chip: string): boolean {
    const key = chip.trim().replace(/^(rabbi\s+)+/i, "").split(" ")[0].toLowerCase()
    return rabbiNames(raw).some((n) => n.toLowerCase() === key)
}
