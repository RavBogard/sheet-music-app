/**
 * Concurrency limiter for AI validation calls.
 *
 * Extracted from use-smart-transposer.ts so the mutable state
 * is isolated, testable, and resettable (e.g. during hot-reload).
 *
 * Preferred usage: withAiSlot(() => doAiWork()) — guarantees slot release.
 */

let activeAiCalls = 0
const AI_MAX_CONCURRENT = 2
const aiQueue: (() => void)[] = []

const AI_SLOT_TIMEOUT_MS = 30_000

export function acquireAiSlot(timeoutMs = AI_SLOT_TIMEOUT_MS): Promise<void> {
    if (activeAiCalls < AI_MAX_CONCURRENT) {
        activeAiCalls++
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            // Remove from queue if still waiting
            const idx = aiQueue.indexOf(entry)
            if (idx !== -1) aiQueue.splice(idx, 1)
            reject(new Error("AI slot timeout — all slots busy"))
        }, timeoutMs)

        const entry = () => {
            clearTimeout(timer)
            activeAiCalls++
            resolve()
        }
        aiQueue.push(entry)
    })
}

export function releaseAiSlot(): void {
    activeAiCalls = Math.max(0, activeAiCalls - 1)
    if (aiQueue.length > 0) {
        const next = aiQueue.shift()
        next?.()
    }
}

/**
 * Run an async function with a guaranteed AI slot.
 * The slot is always released, even if fn throws.
 * This is the RECOMMENDED way to use the semaphore.
 */
export async function withAiSlot<T>(fn: () => Promise<T>, timeoutMs = AI_SLOT_TIMEOUT_MS): Promise<T> {
    await acquireAiSlot(timeoutMs)
    try {
        return await fn()
    } finally {
        releaseAiSlot()
    }
}

/** Reset for tests and hot-reload cleanup */
export function resetAiConcurrency(): void {
    activeAiCalls = 0
    aiQueue.length = 0
}
