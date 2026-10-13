/**
 * Multi-tenant phase 7 — justified exceptions to the untranslated-string scan.
 *
 * Prefer an inline comment at the string (`// i18n-ignore: <reason>` on the
 * line or the line above, `{/* i18n-ignore: <reason> *\/}` in JSX): it lives
 * next to the code, so lanes never edit this shared file. Use this list only
 * for text that must stay verbatim and cannot carry a comment. Every entry
 * needs a reason; `text` is matched exactly against the finding's text.
 */
export interface AllowEntry {
    file: string
    text: string
    reason: string
}

export const ALLOWLIST: readonly AllowEntry[] = []
