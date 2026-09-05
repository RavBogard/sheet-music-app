import type { Page } from '@playwright/test'

/**
 * TS wrapper around `cycle-4/harness/lib/runAxe.mjs` — inline-injected axe-core
 * sweep that evades production CSP (per `runAxe.mjs` docstring). The TS layer
 * exists so e2e specs get types + clean imports without each spec re-declaring
 * the mjs module.
 *
 * Usage in a spec:
 *
 *   import { runAxe, summarizeViolations } from './helpers/axe'
 *
 *   const result = await runAxe(page, 'library')
 *   const summary = summarizeViolations(result.violations)
 *
 * `runAxe` does NOT navigate — caller is responsible for ensuring the page
 * is in the state to sweep. Run AFTER `page.goto(...)` and any auth wake-up
 * (e.g. `roleGate.gotoAs(...)`), once the surface has settled.
 */

export interface AxeViolation {
    id: string
    impact: 'minor' | 'moderate' | 'serious' | 'critical' | null
    description: string
    help: string
    helpUrl: string
    nodes: Array<{ target: string[]; failureSummary?: string }>
}

export interface AxeRunResult {
    surface: string
    url: string
    violations: AxeViolation[]
    passes: object[]
    incomplete: object[]
    inapplicable: object[]
    runAt: string
}

// The mjs source is JSDoc-typed (object[] for violations/passes/incomplete/
// inapplicable — axe returns rich objects but the JSDoc stays loose); the TS
// boundary refines the shape we care about. Cast through `unknown` because
// the structural mismatch is intentional: we know the runtime values are
// AxeViolation-shaped (axe's contract), the JSDoc is just looser than ours.
export async function runAxe(page: Page, surface: string): Promise<AxeRunResult> {
    // Playwright loads TypeScript helpers through its CommonJS transform. A
    // static import of the native ESM harness module makes that transform try
    // to execute the `.mjs` file as CommonJS (`exports is not defined`). Keep
    // the module boundary native by loading it at call time.
    const { runAxe: runAxeImpl } = await import(
        '../../cycle-4/harness/lib/runAxe.mjs'
    )
    const raw = await runAxeImpl(page, surface)
    return raw as unknown as AxeRunResult
}

export interface ViolationSummary {
    total: number
    /** Count of violations by impact level (null impacts grouped under 'unknown'). */
    byImpact: { critical: number; serious: number; moderate: number; minor: number; unknown: number }
    /** Up to 5 most impactful rule ids — for the FINDING annotation. */
    topRules: Array<{ id: string; impact: string | null; help: string; nodeCount: number }>
}

const IMPACT_RANK: Record<string, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
}

/** Compact a list of axe violations into a triage-friendly summary. */
export function summarizeViolations(violations: AxeViolation[]): ViolationSummary {
    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
    for (const v of violations) {
        const k = (v.impact ?? 'unknown') as keyof typeof byImpact
        if (k in byImpact) byImpact[k]++
        else byImpact.unknown++
    }
    const sorted = [...violations].sort((a, b) => {
        const ra = IMPACT_RANK[a.impact ?? 'minor'] ?? 4
        const rb = IMPACT_RANK[b.impact ?? 'minor'] ?? 4
        if (ra !== rb) return ra - rb
        return (b.nodes?.length ?? 0) - (a.nodes?.length ?? 0)
    })
    const topRules = sorted.slice(0, 5).map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodeCount: v.nodes?.length ?? 0,
    }))
    return { total: violations.length, byImpact, topRules }
}
