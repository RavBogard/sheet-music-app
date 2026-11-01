import type { ReactNode } from "react"
import { PSEUDO_CLOSE, PSEUDO_OPEN } from "@/i18n/pseudo"

/**
 * The two inline marks a Help string may carry (see the `$comment` in
 * src/i18n/en/helpGuides.json):
 *
 *   **label**   something the reader taps or sees on screen: bold
 *   `thing`     a file, folder or address: a code font, always left to right
 *
 * The translator keeps the marks around the translated words, so word order
 * stays theirs. No other markup is read; everything else is plain text.
 */
const MARK = /(\*\*[^*]+\*\*|`[^`]+`)/g

export function inline(text: string): ReactNode[] {
    // Pseudo-locale wraps the whole string once; re-wrap each text piece so the
    // untranslated-text check sees every piece as coming from t().
    const pseudo = text.startsWith(PSEUDO_OPEN) && text.endsWith(PSEUDO_CLOSE)
    if (pseudo) text = text.slice(PSEUDO_OPEN.length, -PSEUDO_CLOSE.length)
    const piece = (s: string) => (pseudo && /\p{L}/u.test(s) ? `${PSEUDO_OPEN}${s}${PSEUDO_CLOSE}` : s)
    return text
        .split(MARK)
        .filter((part) => part !== "")
        .map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
                return (
                    <strong key={i} className="font-bold text-foreground">
                        {piece(part.slice(2, -2))}
                    </strong>
                )
            }
            if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
                return (
                    <code
                        key={i}
                        dir="ltr"
                        className="help-code rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground [unicode-bidi:isolate]"
                    >
                        {part.slice(1, -1)}
                    </code>
                )
            }
            return piece(part)
        })
}
