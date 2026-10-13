import { describe, expect, it } from "vitest"
import { scanSource, usedKeys } from "./scanner"
import { pendingCovers } from "./scope"

const tsx = (src: string, file = "src/components/x/Thing.tsx") => scanSource(file, src).map((f) => [f.kind, f.text, f.where ?? ""])

describe("scanner rules", () => {
    it("JSX text, expressions, attributes", () => {
        expect(tsx(`export const A = () => <div title="Hello there" aria-label={ok ? "Yes" : "No"} className="px-2">Saved {"Done"} {n} — {x || "Fallback"}</div>`)).toEqual([
            ["attribute", "Hello there", "title"],
            ["attribute", "Yes", "aria-label"],
            ["attribute", "No", "aria-label"],
            ["jsx-text", "Saved", ""],
            ["jsx-expression", "Done", ""],
            ["jsx-expression", "Fallback", ""],
        ])
    })

    it("t() calls, letterless text, code/kbd and i18n-ignore are fine", () => {
        expect(tsx(`export const A = () => <p title={t("a.b")}>{t("a.c")} 12 • <kbd>Ctrl</kbd> <code>npm run</code></p>`)).toEqual([])
        expect(tsx(`export const A = () => (<p>
            {/* i18n-ignore: brand name */}
            Spotify
        </p>)`)).toEqual([])
        expect(tsx(`// i18n-ignore-file: dev-only page\nexport const A = () => <p>Hi</p>`)).toEqual([])
    })

    it("toasts, dialogs, announce, message setters", () => {
        expect(tsx(`toast.error("Could not save"); toast.promise(p, { loading: "Saving", success: "Saved" }); confirm(\`Delete \${n} rows?\`); setNameError("Too long"); setOpen(true); announce("Done")`, "src/components/x/a.ts")).toEqual([
            ["message-call", "Could not save", "toast.error"],
            ["message-call", "Saving", "toast.promise"],
            ["message-call", "Saved", "toast.promise"],
            ["message-call", "Delete rows?", "confirm"],
            ["message-setter", "Too long", "setNameError"],
            ["message-call", "Done", "announce"],
        ])
    })

    it("API route JSON: sentences flagged, machine codes not; only in route handlers", () => {
        const src = `export async function GET() { return NextResponse.json({ error: "File not found", code: "x y" }, { status: 404 }) }
            export async function POST() { return NextResponse.json({ error: "not_found" }) }`
        expect(scanSource("src/app/api/thing/route.ts", src).map((f) => f.text)).toEqual(["File not found"])
        expect(scanSource("src/components/x/a.ts", src)).toEqual([])
    })

    it("usedKeys finds literal t() keys", () => {
        expect(usedKeys("a.tsx", `const x = t("a.b"); i18n.t('c.d', { n }); t(dynamic); format("x")`).map((k) => k.key)).toEqual(["a.b", "c.d"])
    })

    it("pending entries: dir/ is recursive, dir/* is direct files only", () => {
        expect(pendingCovers("src/a/", "src/a/b/c.tsx")).toBe(true)
        expect(pendingCovers("src/a/*", "src/a/c.tsx")).toBe(true)
        expect(pendingCovers("src/a/*", "src/a/b/c.tsx")).toBe(false)
    })
})
