/**
 * Multi-tenant phase 7 — the untranslated-string scanner (test support; never
 * shipped). Parses TS/TSX with the TypeScript compiler API and reports every
 * user-visible string literal that bypasses `t()`:
 *
 *   - JSX text with a letter in it                       <p>Saved</p>
 *   - string-ish JSX children                            {"Saved"} {ok ? "Yes" : "No"} {`${n} songs`}
 *   - user-facing attributes (USER_ATTRS)                title= aria-label= placeholder= alt= label= …
 *   - message calls (MESSAGE_CALLEES)                    toast.error("…") alert("…") confirm("…") announce("…")
 *   - message state setters                              setError("…") setStatusMessage("…")
 *   - API JSON bodies (route handlers only)              NextResponse.json({ error: "Not allowed here" })
 *     — a sentence (has a space and a letter). Machine codes ("not_found",
 *     "FORBIDDEN") are exempt: those are API contract, not text.
 *
 * Exempt: text with no letters ("—", "•", "12"), text inside <code>/<kbd>/
 * <pre>/<samp>, `i18n-ignore` comments (same line or the line above), a
 * file-level `i18n-ignore-file` comment, and the allowlist.
 */
import ts from "typescript"

export const USER_ATTRS = new Set([
    "title",
    "aria-label",
    "aria-description",
    "aria-roledescription",
    "aria-valuetext",
    "aria-placeholder",
    "placeholder",
    "alt",
    "label",
    "description",
    "tooltip",
    "heading",
    "subtitle",
    "emptyText",
    "emptyMessage",
    "confirmLabel",
    "cancelLabel",
    "confirmText",
    "cancelText",
    "actionLabel",
    "helperText",
])

/** `toast.*`, the browser dialogs, the live-region announcer. */
export const MESSAGE_CALLEES = new Set([
    "toast",
    "toast.success",
    "toast.error",
    "toast.info",
    "toast.warning",
    "toast.message",
    "toast.loading",
    "toast.promise",
    "alert",
    "confirm",
    "prompt",
    "window.alert",
    "window.confirm",
    "window.prompt",
    "announce",
])

/** setError("…"), setStatusMessage("…"), setWarningText("…") … */
export const MESSAGE_SETTER_RE = /^set[A-Z]\w*(Error|Message|Msg|Status|Text|Label|Title|Notice|Warning|Hint|Toast|Feedback)$/

/** JSON body keys an API route sends back that the browser shows. */
export const API_MESSAGE_KEYS = new Set(["error", "message", "detail", "details", "reason", "hint", "warning"])

const NON_TEXT_ELEMENTS = new Set(["code", "kbd", "pre", "samp", "script", "style"])

export type FindingKind = "jsx-text" | "jsx-expression" | "attribute" | "message-call" | "message-setter" | "api-message"

export interface Finding {
    file: string
    line: number
    kind: FindingKind
    text: string
    /** attribute name / callee, when relevant */
    where?: string
}

const LETTER = /\p{L}/u

export function hasLetters(s: string): boolean {
    return LETTER.test(s)
}

/** A sentence-like API message: a letter and whitespace. Machine codes have neither spaces nor sentences. */
export function isSentence(s: string): boolean {
    return hasLetters(s) && /\s/.test(s.trim())
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
    ndash: "–", mdash: "—", bull: "•", middot: "·", hellip: "…", times: "×", divide: "÷",
    larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", laquo: "«", raquo: "»",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™",
    deg: "°", plusmn: "±", sharp: "♯", flat: "♭", natur: "♮", check: "✓", star: "☆",
}

/**
 * JSX text and JSX attribute strings are HTML-entity encoded in the source
 * (`&#x2022;`, `&middot;`); judge the text the browser shows, not the escape.
 * Unknown named entities are left as written (they would render literally).
 */
export function decodeEntities(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
        if (body[0] === "#") {
            const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
            return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
        }
        return NAMED_ENTITIES[body] ?? whole
    })
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

function calleeName(expr: ts.Expression): string | null {
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr)) {
        const left = calleeName(expr.expression)
        return left ? `${left}.${expr.name.text}` : null
    }
    return null
}

/** Static text pieces of a string-ish expression (literals, templates, ?:, ||, ??, +). */
function staticTexts(expr: ts.Expression): string[] {
    if (ts.isParenthesizedExpression(expr)) return staticTexts(expr.expression)
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text]
    if (ts.isTemplateExpression(expr)) {
        const parts = [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)]
        return [parts.join(" ")]
    }
    if (ts.isConditionalExpression(expr)) return [...staticTexts(expr.whenTrue), ...staticTexts(expr.whenFalse)]
    if (ts.isBinaryExpression(expr)) {
        const op = expr.operatorToken.kind
        if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...staticTexts(expr.right), ...staticTexts(expr.left)]
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) return staticTexts(expr.right)
        if (op === ts.SyntaxKind.PlusToken) {
            const l = staticTexts(expr.left)
            const r = staticTexts(expr.right)
            return [[...l, ...r].join(" ")]
        }
    }
    if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) return staticTexts(expr.expression)
    return []
}

function insideNonTextElement(node: ts.Node): boolean {
    let p: ts.Node | undefined = node.parent
    while (p) {
        if (ts.isJsxElement(p)) {
            const tag = p.openingElement.tagName
            if (ts.isIdentifier(tag) && NON_TEXT_ELEMENTS.has(tag.text)) return true
        }
        p = p.parent
    }
    return false
}

function ignoredLines(text: string): Set<number> {
    const out = new Set<number>()
    const lines = text.split(/\r?\n/)
    lines.forEach((l, i) => {
        if (l.includes("i18n-ignore") && !l.includes("i18n-ignore-file")) {
            out.add(i + 1) // same line
            out.add(i + 2) // the line below
        }
    })
    return out
}

export function isRouteHandler(file: string): boolean {
    return /(^|\/)src\/app\/api\/.*\/route\.tsx?$/.test(file.replace(/\\/g, "/"))
}

/** True for a call whose result is a JSON response body. */
function isJsonResponseCall(call: ts.CallExpression): boolean {
    const name = calleeName(call.expression)
    if (!name) return false
    return /(^|\.)json$/.test(name) || name === "jsonError" || name === "errorResponse" || name === "badRequest"
}

export function scanSource(file: string, text: string): Finding[] {
    if (/i18n-ignore-file/.test(text.slice(0, 2000))) return []
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
    const ignore = ignoredLines(text)
    const route = isRouteHandler(file)
    const findings: Finding[] = []
    const push = (node: ts.Node, k: FindingKind, t: string, where?: string) => {
        const line = lineOf(sf, node)
        if (ignore.has(line)) return
        const trimmed = t.replace(/\s+/g, " ").trim()
        if (!hasLetters(trimmed)) return
        findings.push({ file, line, kind: k, text: trimmed, where })
    }

    const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
            if (!insideNonTextElement(node)) push(node, "jsx-text", decodeEntities(node.text))
        } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
            if (!insideNonTextElement(node)) for (const s of staticTexts(node.expression)) push(node, "jsx-expression", s)
        } else if (ts.isJsxAttribute(node)) {
            const name = node.name.getText(sf)
            if (USER_ATTRS.has(name) && node.initializer) {
                const init = node.initializer
                if (ts.isStringLiteral(init)) push(node, "attribute", decodeEntities(init.text), name)
                else if (ts.isJsxExpression(init) && init.expression) for (const s of staticTexts(init.expression)) push(node, "attribute", s, name)
            }
        } else if (ts.isCallExpression(node)) {
            const name = calleeName(node.expression)
            const first = node.arguments[0]
            if (name && first) {
                if (MESSAGE_CALLEES.has(name)) {
                    for (const s of staticTexts(first)) push(node, "message-call", s, name)
                    // toast.promise(p, { loading: "…", success: "…", error: "…" }) and toast("…", { description: "…" })
                    for (const arg of node.arguments) {
                        if (ts.isObjectLiteralExpression(arg)) {
                            for (const prop of arg.properties) {
                                if (ts.isPropertyAssignment(prop) && /^(loading|success|error|description|title)$/.test(prop.name.getText(sf))) {
                                    for (const s of staticTexts(prop.initializer)) push(prop, "message-call", s, name)
                                }
                            }
                        }
                    }
                } else if (MESSAGE_SETTER_RE.test(name.split(".").pop()!)) {
                    for (const s of staticTexts(first)) push(node, "message-setter", s, name)
                }
            }
            if (route && isJsonResponseCall(node) && first && ts.isObjectLiteralExpression(first)) {
                for (const prop of first.properties) {
                    if (ts.isPropertyAssignment(prop) && API_MESSAGE_KEYS.has(prop.name.getText(sf).replace(/['"]/g, ""))) {
                        for (const s of staticTexts(prop.initializer)) if (isSentence(s)) push(prop, "api-message", s, prop.name.getText(sf))
                    }
                }
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return findings
}

/** Keys passed as a literal to t("ns.key") / t('ns.key') / i18n.t("…"). */
export function usedKeys(file: string, text: string): Array<{ key: string; line: number }> {
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
    const out: Array<{ key: string; line: number }> = []
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node.expression)
            const first = node.arguments[0]
            if (name && (name === "t" || name.endsWith(".t")) && first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
                out.push({ key: first.text, line: lineOf(sf, node) })
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return out
}
