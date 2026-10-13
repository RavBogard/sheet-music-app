import { Fragment, type ReactNode } from "react"
import { PSEUDO_CLOSE, PSEUDO_OPEN } from "@/i18n/pseudo"

/**
 * Phase 7: put React elements into a translated sentence. The translator
 * moves `{placeholder}`s freely; each one named in `nodes` is replaced by its
 * element, everything else stays text.
 *
 *   interpolateNodes(t("admin.auditChangedRole"), { actor: <b>{who}</b>, target: <code>{id}</code> })
 *
 * Call `t()` WITHOUT vars for the node placeholders (t leaves unknown
 * placeholders as written). Don't name a node placeholder after a tenant
 * token (id, name, shortName, abbreviation, host): t() would fill it first.
 *
 * Under the pseudo-locale the whole template arrives wrapped once (⟦…⟧); each
 * text piece is re-wrapped so the untranslated-text check still sees every
 * piece as coming from t().
 */
export function interpolateNodes(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
    const pseudo = template.startsWith(PSEUDO_OPEN) && template.endsWith(PSEUDO_CLOSE)
    if (pseudo) template = template.slice(PSEUDO_OPEN.length, -PSEUDO_CLOSE.length)
    const text = (s: string) => (pseudo && /\p{L}/u.test(s) ? `${PSEUDO_OPEN}${s}${PSEUDO_CLOSE}` : s)
    const out: ReactNode[] = []
    const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(template))) {
        if (!Object.prototype.hasOwnProperty.call(nodes, m[1])) continue
        if (m.index > last) out.push(text(template.slice(last, m.index)))
        out.push(<Fragment key={`n${i++}`}>{nodes[m[1]]}</Fragment>)
        last = m.index + m[0].length
    }
    if (last < template.length) out.push(text(template.slice(last)))
    return out
}
