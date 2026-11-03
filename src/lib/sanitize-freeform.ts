/**
 * F-015: Strip null bytes and C0/C1 control characters from user-supplied
 * freeform string fields (notes, title, leadMusician, referenceLink) before
 * writing to Firestore. Printable Unicode (including Hebrew, emoji) is
 * preserved; only invisible/control characters that can corrupt display or
 * break downstream parsers are removed. Applied at the MCP boundary and by
 * the setlist op engine. (Re-exported from server-tracks-write.)
 */
export function sanitizeFreeformString(s: string): string {
    // Remove null bytes and ASCII C0 controls (0x00–0x1F) except tab (0x09),
    // LF (0x0A), CR (0x0D), and DEL (0x7F) + C1 controls (0x80–0x9F).
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, "")
}
