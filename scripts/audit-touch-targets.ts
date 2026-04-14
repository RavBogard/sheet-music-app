/**
 * U01 touch-target audit — v4.3 Phase 5 Plan 03.
 *
 * Scans TSX under musician-facing surfaces and classifies every interactive
 * element as COMPLIANT / OFFENDER / UNKNOWN against the WCAG 44px floor.
 *
 * Run:  npx tsx scripts/audit-touch-targets.ts
 * Writes: .paul/phases/v43-05-bugs-ux/05-03-AUDIT.md
 * Exits 0 always (report is the artifact; Task 2 fixes offenders).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, relative, resolve } from "path"
import { parse } from "@babel/parser"
// @ts-ignore — @babel/traverse default export interop
import _traverse from "@babel/traverse"
const traverse = (_traverse as any).default ?? _traverse

const ROOT = resolve(__dirname, "..")
const SRC = resolve(ROOT, "src")

// Surfaces per PLAN 05-03 scope. Admin/* intentionally excluded.
const SCAN_DIRS = [
    "components/performance",
    "components/nav",
    "components/setlist",
    "app/perform",
    "app/setlists",
]
const ADDBAR = "components/setlist/v2/AddBar.tsx"

const INTERACTIVE_TAGS = new Set([
    "button",
    "a",
    "Button",
    "PopoverTrigger",
    "DialogTrigger",
    "SheetTrigger",
    "DropdownMenuTrigger",
    "Link",
])

// Compliant sizing tokens:
//   h-11/12/14/16/20/full, size-11+, min-h-11/12/14, min-h-[44px+], py-3 (24+16 icon rarely; require h-*)
const COMPLIANT_RE = new RegExp(
    [
        /\bh-(1[1-9]|[2-9]\d|full|screen)\b/,
        /\bsize-(1[1-9]|[2-9]\d)\b/,
        /\bmin-h-(11|12|14|16|20|full)\b/,
        /\bmin-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]\b/,
        /\bh-\[(4[4-9]|[5-9]\d|\d{3,})px\]\b/,
    ]
        .map((r) => r.source)
        .join("|")
)

// Known-small icon-button patterns (indicators of probable offender).
const OFFENDER_RE = new RegExp(
    [
        /\bh-(?:[1-9]|10)\b(?!\d)/, // h-1..h-10 (but not h-11+)
        /\bsize-(?:[1-9]|10)\b(?!\d)/,
    ]
        .map((r) => r.source)
        .join("|")
)

type Row = {
    file: string
    line: number
    tag: string
    className: string
    verdict: "COMPLIANT" | "OFFENDER" | "UNKNOWN"
    reason: string
}

function walkTsx(dir: string, out: string[] = []): string[] {
    let entries: string[] = []
    try {
        entries = readdirSync(dir)
    } catch {
        return out
    }
    for (const name of entries) {
        const full = join(dir, name)
        let s
        try {
            s = statSync(full)
        } catch {
            continue
        }
        if (s.isDirectory()) walkTsx(full, out)
        else if (name.endsWith(".tsx")) out.push(full)
    }
    return out
}

function extractClassName(attrs: any[]): string | null {
    for (const a of attrs) {
        if (a.type !== "JSXAttribute") continue
        const name = a.name?.name
        if (name !== "className") continue
        const v = a.value
        if (!v) return ""
        if (v.type === "StringLiteral") return v.value
        if (v.type === "JSXExpressionContainer") {
            const expr = v.expression
            if (expr.type === "StringLiteral") return expr.value
            if (expr.type === "TemplateLiteral") {
                return expr.quasis.map((q: any) => q.value.cooked).join(" ")
            }
            if (expr.type === "CallExpression") {
                // cn("...", "...", cond && "...")
                return expr.arguments
                    .map((arg: any) => {
                        if (arg.type === "StringLiteral") return arg.value
                        if (arg.type === "TemplateLiteral")
                            return arg.quasis.map((q: any) => q.value.cooked).join(" ")
                        if (arg.type === "LogicalExpression" || arg.type === "ConditionalExpression") {
                            // Recurse over string operands only
                            const collect = (node: any): string => {
                                if (!node) return ""
                                if (node.type === "StringLiteral") return node.value
                                if (node.type === "TemplateLiteral")
                                    return node.quasis.map((q: any) => q.value.cooked).join(" ")
                                if (node.type === "LogicalExpression")
                                    return `${collect(node.left)} ${collect(node.right)}`
                                if (node.type === "ConditionalExpression")
                                    return `${collect(node.consequent)} ${collect(node.alternate)}`
                                return ""
                            }
                            return collect(arg)
                        }
                        return ""
                    })
                    .join(" ")
            }
            return "<dynamic>"
        }
    }
    return null
}

function classify(className: string, tag: string, asChild: boolean): {
    verdict: Row["verdict"]
    reason: string
} {
    // *Trigger asChild: real target is the child, skip (child gets analyzed separately).
    if (asChild) return { verdict: "COMPLIANT", reason: "asChild — child button is the real target" }

    if (className === "<dynamic>")
        return { verdict: "UNKNOWN", reason: "className is fully dynamic" }
    if (!className.trim())
        return { verdict: "UNKNOWN", reason: "no className (inherits from parent)" }

    const compliant = COMPLIANT_RE.test(className)
    const offender = OFFENDER_RE.test(className)

    if (compliant && !offender)
        return { verdict: "COMPLIANT", reason: "has ≥44px sizing token" }
    if (compliant && offender)
        return {
            verdict: "UNKNOWN",
            reason: "mixed sizing (e.g., h-full with h-10 inner) — manual inspection",
        }
    if (offender) return { verdict: "OFFENDER", reason: "has <44px sizing token and no ≥44px override" }

    // No explicit sizing. Tag heuristic.
    if (tag === "a" || tag === "Link")
        return { verdict: "UNKNOWN", reason: "link — hit area depends on rendered content" }
    if (tag === "Button")
        return { verdict: "UNKNOWN", reason: "shadcn Button — default variant height depends on size prop" }
    return { verdict: "UNKNOWN", reason: "no sizing classes; hit area depends on parent/content" }
}

function scan(file: string): Row[] {
    const rel = relative(ROOT, file).replace(/\\/g, "/")
    const src = readFileSync(file, "utf8")
    let ast
    try {
        ast = parse(src, {
            sourceType: "module",
            plugins: ["typescript", "jsx"],
            errorRecovery: true,
        })
    } catch (e) {
        return [{ file: rel, line: 0, tag: "<parse-error>", className: "", verdict: "UNKNOWN", reason: String(e) }]
    }

    const rows: Row[] = []
    traverse(ast, {
        JSXOpeningElement(path: any) {
            const node = path.node
            const nameNode = node.name
            const tag =
                nameNode.type === "JSXIdentifier"
                    ? nameNode.name
                    : nameNode.type === "JSXMemberExpression"
                        ? `${nameNode.object.name}.${nameNode.property.name}`
                        : "<complex>"
            // Consider Radix/shadcn triggers too
            const isInteractive =
                INTERACTIVE_TAGS.has(tag) ||
                /Trigger$/.test(tag) ||
                tag === "Button" ||
                tag === "Link"
            if (!isInteractive) return

            const asChild = node.attributes.some(
                (a: any) =>
                    a.type === "JSXAttribute" &&
                    a.name?.name === "asChild" &&
                    (!a.value || a.value.type === "JSXExpressionContainer" && a.value.expression?.value !== false)
            )
            const className = extractClassName(node.attributes) ?? ""
            const { verdict, reason } = classify(className, tag, asChild)
            rows.push({
                file: rel,
                line: node.loc?.start.line ?? 0,
                tag,
                className: className.replace(/\s+/g, " ").trim().slice(0, 120),
                verdict,
                reason,
            })
        },
    })
    return rows
}

function main() {
    const files: string[] = []
    for (const d of SCAN_DIRS) walkTsx(resolve(SRC, d), files)
    // Ensure AddBar is scanned (already in setlist/)
    // Deduplicate
    const uniq = Array.from(new Set(files))

    const rows: Row[] = []
    for (const f of uniq) rows.push(...scan(f))

    const compliant = rows.filter((r) => r.verdict === "COMPLIANT")
    const offenders = rows.filter((r) => r.verdict === "OFFENDER")
    const unknowns = rows.filter((r) => r.verdict === "UNKNOWN")

    const esc = (s: string) => s.replace(/\|/g, "\\|")
    const mkTable = (rs: Row[]) =>
        rs.length === 0
            ? "_none_\n"
            : [
                "| file | line | tag | className | reason |",
                "|---|---|---|---|---|",
                ...rs.map(
                    (r) => `| ${esc(r.file)} | ${r.line} | ${esc(r.tag)} | \`${esc(r.className) || "—"}\` | ${esc(r.reason)} |`
                ),
            ].join("\n") + "\n"

    const md = [
        "# 05-03 Touch-Target Audit",
        "",
        `Generated: ${new Date().toISOString()}`,
        `Files scanned: ${uniq.length}`,
        `Interactive elements found: ${rows.length}`,
        "",
        `- COMPLIANT: ${compliant.length}`,
        `- OFFENDER: ${offenders.length}`,
        `- UNKNOWN: ${unknowns.length}`,
        "",
        "## OFFENDERs (<44px target)",
        "",
        mkTable(offenders),
        "## UNKNOWNs (manual inspection required)",
        "",
        mkTable(unknowns),
        "## COMPLIANT (for reference)",
        "",
        mkTable(compliant),
    ].join("\n")

    const out = resolve(ROOT, ".paul/phases/v43-05-bugs-ux/05-03-AUDIT.md")
    writeFileSync(out, md, "utf8")
    console.log(
        `Wrote ${relative(ROOT, out)} — ${compliant.length} compliant, ${offenders.length} offenders, ${unknowns.length} unknowns`
    )
}

main()
