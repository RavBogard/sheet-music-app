/**
 * Recordings 2026-11: never during performance (DESIGN.md anti-goal). A stray
 * tap during a service must never make sound, so nothing reachable from
 * /perform may import the recordings player or library, create an audio
 * element, or call new Audio(). This walks the STATIC import graph (static
 * imports, re-exports, dynamic import() and require) from every shipped file
 * under src/app/perform, so a deep transitive import is caught too.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..')
const PERFORM = path.join(SRC, 'app', 'perform')
const FORBIDDEN_DIRS = [path.join(SRC, 'components', 'recordings'), path.join(SRC, 'lib', 'recordings')]
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

const norm = (p: string) => p.split(path.sep).join('/')

function isTestFile(p: string): boolean {
    const n = norm(p)
    return n.includes('/__tests__/') || /\.(test|vitest|spec)\.[tj]sx?$/.test(n)
}

function listFiles(dir: string): string[] {
    const out: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...listFiles(full))
        else if (EXTS.includes(path.extname(e.name))) out.push(full)
    }
    return out
}

function resolveFile(base: string): string | null {
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
    for (const ext of EXTS) if (fs.existsSync(base + ext)) return base + ext
    for (const ext of EXTS) {
        const idx = path.join(base, 'index' + ext)
        if (fs.existsSync(idx)) return idx
    }
    return null
}

const SPEC_RE =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g

function specifiersOf(source: string): string[] {
    const out: string[] = []
    for (const m of source.matchAll(SPEC_RE)) out.push(m[2])
    return out
}

function resolveSpecifier(spec: string, from: string): string | null {
    if (spec.startsWith('@/')) return resolveFile(path.join(SRC, spec.slice(2)))
    if (spec.startsWith('.')) return resolveFile(path.resolve(path.dirname(from), spec))
    return null // a package
}

/** Every file reachable from the shipped (non-test) files under src/app/perform. */
function performGraph(): Set<string> {
    const seen = new Set<string>()
    const stack = listFiles(PERFORM).filter((f) => !isTestFile(f))
    while (stack.length) {
        const file = stack.pop()!
        if (seen.has(file)) continue
        seen.add(file)
        const source = fs.readFileSync(file, 'utf8')
        for (const spec of specifiersOf(source)) {
            const target = resolveSpecifier(spec, file)
            if (target && !seen.has(target)) stack.push(target)
        }
    }
    return seen
}

/**
 * Found while writing this guard: Perform already reaches ONE audio element,
 * components/music/AudioViewer.tsx, the lazy viewer (perform-chart-loaders) for
 * a row whose bonded chart FILE is itself an audio file (legacy mp3 charts).
 * It is the chart the leader bonded and the musician opened, not the recordings
 * feature, and it predates it. Allowed by name; any other file, and any file
 * from the recordings modules, still fails. Remove this entry if audio charts
 * are ever retired.
 */
const PRE_EXISTING_AUDIO_CHART_VIEWER = ['components/music/AudioViewer.tsx']

describe('Perform stays silent', () => {
    const graph = performGraph()
    const files = [...graph]

    it('the walker does reach src/app/perform/setlist/[id]/SetlistPerformClient.tsx', () => {
        expect(graph.has(path.join(PERFORM, 'setlist', '[id]', 'SetlistPerformClient.tsx'))).toBe(true)
        expect(graph.size).toBeGreaterThan(20)
    })

    it('the walker resolves the @/ alias and relative imports', () => {
        expect(resolveSpecifier('@/lib/utils', path.join(PERFORM, 'page.tsx'))).toBeTruthy()
        expect(resolveSpecifier('./PerformClientLayout', path.join(PERFORM, 'layout.tsx'))).toBeTruthy()
        expect(specifiersOf('import x from "@/a"; export * from "./b"; await import("./c"); require("d")')).toEqual([
            '@/a',
            './b',
            './c',
            'd',
        ])
    })

    it('perform graph reaches no recordings module', () => {
        const hits = files.filter((f) => FORBIDDEN_DIRS.some((d) => norm(f).startsWith(norm(d) + '/')))
        expect(hits.map((f) => norm(path.relative(SRC, f)))).toEqual([])
    })

    it('perform graph has no audio element', () => {
        const hits = files.filter((f) => {
            const s = fs.readFileSync(f, 'utf8')
            return s.includes('<audio') || s.includes('new Audio(')
        })
        const rel = hits.map((f) => norm(path.relative(SRC, f))).filter((f) => !PRE_EXISTING_AUDIO_CHART_VIEWER.includes(f))
        expect(rel).toEqual([])
    })

    it('nothing under /perform links to /listen', () => {
        const hits = listFiles(PERFORM)
            .filter((f) => !isTestFile(f))
            .filter((f) => /['"`]\/listen\b/.test(fs.readFileSync(f, 'utf8')))
        expect(hits.map((f) => norm(path.relative(SRC, f)))).toEqual([])
    })
})
