/**
 * Concurrency limiter for AI validation calls.
 *
 * Extracted from use-smart-transposer.ts so the mutable state
 * is isolated, testable, and resettable (e.g. during hot-reload).
 */

let activeAiCalls = 0
const AI_MAX_CONCURRENT = 2
const aiQueue: (() => void)[] = []

export function acquireAiSlot(): Promise<void> {
    if (activeAiCalls < AI_MAX_CONCURRENT) {
        activeAiCalls++
        return Promise.resolve()
    }
    return new Promise(resolve => {
        aiQueue.push(() => { activeAiCalls++; resolve() })
    })
}

export function releaseAiSlot(): void {
    activeAiCalls--
    if (aiQueue.length > 0) {
        const next = aiQueue.shift()
        next?.()
    }
}

/** Reset for tests and hot-reload cleanup */
export function resetAiConcurrency(): void {
    activeAiCalls = 0
    aiQueue.length = 0
}
