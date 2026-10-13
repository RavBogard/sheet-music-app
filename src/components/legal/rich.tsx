import { Fragment, type ReactNode } from "react"
import { PSEUDO_CLOSE, PSEUDO_OPEN } from "@/i18n/pseudo"

/**
 * Multi-tenant phase 7 — a translated sentence with elements inside it.
 *
 *   rich(t("terms.smsHelp"), { term: <strong>HELP</strong>, link: <a href=…>…</a> })
 *
 * The catalogue string carries `{placeholder}`s where an element sits
 * ("For help, reply {term} to any message or contact us at {link}."), so the
 * translator moves the element with the words around it. Placeholders not in
 * `nodes` are left as written (t() already filled its own `{vars}`).
 *
 * Each run of text between elements comes back as ONE string, so React renders
 * it as one text node — the same DOM (and the same server HTML) as the
 * hand-written JSX it replaces. `splitSpaceBefore` keeps a JSX `{' '}` that
 * the original markup had before an element as its own text node, again so
 * CRC's server HTML stays byte-identical.
 *
 * Placeholder names must not be tenant tokens (id, name, shortName,
 * abbreviation, host): t() would fill those first.
 */
export function rich(
    template: string,
    nodes: Record<string, ReactNode>,
    opts: { splitSpaceBefore?: readonly string[] } = {},
): ReactNode[] {
    // Pseudo-locale: the template arrives wrapped once (⟦…⟧); re-wrap each text
    // piece so the untranslated-text check sees every piece as coming from t().
    // English and Hebrew never start with ⟦, so their output is untouched.
    const pseudo = template.startsWith(PSEUDO_OPEN) && template.endsWith(PSEUDO_CLOSE)
    if (pseudo) template = template.slice(PSEUDO_OPEN.length, -PSEUDO_CLOSE.length)
    const piece = (s: string) => (pseudo && /\p{L}/u.test(s) ? `${PSEUDO_OPEN}${s}${PSEUDO_CLOSE}` : s)
    const out: ReactNode[] = []
    const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g
    let last = 0
    let text = ""
    let m: RegExpExecArray | null
    const flushText = (before?: string) => {
        if (!text) return
        if (before && opts.splitSpaceBefore?.includes(before) && text.length > 1 && text.endsWith(" ")) {
            out.push(piece(text.slice(0, -1)), " ")
        } else {
            out.push(piece(text))
        }
        text = ""
    }
    while ((m = re.exec(template))) {
        const name = m[1]
        text += template.slice(last, m.index)
        last = m.index + m[0].length
        if (!Object.prototype.hasOwnProperty.call(nodes, name)) {
            text += m[0]
            continue
        }
        flushText(name)
        out.push(<Fragment key={`${name}-${out.length}`}>{nodes[name]}</Fragment>)
    }
    text += template.slice(last)
    flushText()
    return out
}
