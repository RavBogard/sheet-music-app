/**
 * Bridge Latency Test Utility
 *
 * Measures the full end-to-end round-trip latency of the Firestore bridge transport:
 *
 *   iPad sends command (addDoc to commands/pending)
 *     → Bridge receives command (onSnapshot on commands subcollection)
 *     → Bridge executes on X32 (OSC over UDP)
 *     → X32 echoes state back (OSC response)
 *     → Bridge writes updated state (set doc on monitor-live/state)
 *     → iPad receives updated state (onSnapshot on state doc)
 *
 * This measures CROSS-DEVICE latency — the time from command write until
 * the state update is confirmed from the server (hasPendingWrites === false).
 *
 * CRITICAL: Firestore's onSnapshot fires immediately for local writes
 * (latency compensation). You MUST check `snap.metadata.hasPendingWrites === false`
 * to distinguish true server-confirmed updates from local cache hits.
 *
 * Thresholds:
 *   < 200ms — Acceptable for fader control (imperceptible lag)
 *   200–500ms — Noticeable but workable for occasional adjustments
 *   > 500ms — Unusable for real-time fader dragging
 *
 * How to run:
 *   1. Ensure you have a running bridge (or X32 mock + bridge locally)
 *   2. Sign in to the app with a musician account that has monitor access
 *   3. Open browser DevTools console
 *   4. Run: import { runLatencyMeasurement } from '@/lib/__tests__/bridge-latency.test'
 *           runLatencyMeasurement({ rounds: 20, scenarioName: 'single-change' })
 *
 * NOTE: This file is a dev utility, NOT a Vitest test file. It exercises
 * the live Firestore project, which is why it's not auto-run by the test runner.
 * The `.test.ts` extension is used to co-locate it with test files.
 */

// These imports work in the browser app context (Next.js with path aliases)
// They do NOT work in Vitest's Node.js environment because they need Firebase auth.
// This is intentional — this utility is meant to be run from the browser console.

/**
 * Latency measurement result for a single round-trip.
 */
export interface LatencyMeasurement {
    round: number
    /** Time from command write until first onSnapshot (includes local cache) */
    localMs: number
    /** Time from command write until server-confirmed state update (hasPendingWrites === false) */
    serverMs: number
    /** The fader value that was set */
    targetValue: number
    /** Whether the state update was confirmed within the timeout */
    timedOut: boolean
}

/**
 * Aggregate statistics over multiple measurements.
 */
export interface LatencyStats {
    scenarioName: string
    rounds: number
    completed: number
    timedOut: number
    local: {
        minMs: number
        medianMs: number
        p95Ms: number
        maxMs: number
        avgMs: number
    }
    server: {
        minMs: number
        medianMs: number
        p95Ms: number
        maxMs: number
        avgMs: number
    }
    assessment: "excellent" | "acceptable" | "marginal" | "unacceptable"
    recommendation: string
}

export interface MeasurementOptions {
    /** Number of measurement rounds (default: 20) */
    rounds?: number
    /** Scenario name for reporting */
    scenarioName?: string
    /** Timeout per measurement in ms (default: 3000) */
    timeoutMs?: number
    /** Delay between measurements in ms (default: 200) */
    delayBetweenMs?: number
    /** Bus index to test on (default: 1) */
    busIndex?: number
}

/**
 * Run a single latency measurement by sending a command and waiting
 * for the round-trip through Firestore → Bridge → X32 → Firestore → iPad.
 *
 * @returns LatencyMeasurement with both local cache and server-confirmed times
 */
export async function measureSingleRoundTrip(
    options: {
        busIndex: number
        targetValue: number
        timeoutMs: number
        round: number
        // Injected Firebase/Firestore functions for browser context
        // These can't be imported at module level because they need Firebase config
        db: unknown
        auth: unknown
        addDoc: Function
        collection: Function
        doc: Function
        onSnapshot: Function
    }
): Promise<LatencyMeasurement> {
    const { busIndex, targetValue, timeoutMs, round, db, auth, addDoc, collection, doc, onSnapshot } = options

    // @ts-expect-error — auth is typed as unknown for portability
    const user = auth.currentUser
    if (!user) {
        throw new Error("Not authenticated — sign in first")
    }

    const startTime = performance.now()
    let localMs = -1
    let serverMs = -1
    let timedOut = false

    return new Promise<LatencyMeasurement>((resolve) => {
        const timeout = setTimeout(() => {
            timedOut = true
            unsub?.()
            resolve({ round, localMs, serverMs, targetValue, timedOut: true })
        }, timeoutMs)

        // Watch for state updates BEFORE sending the command
        // to avoid race conditions
        // @ts-expect-error
        const stateRef = doc(db, "monitor-live", "state")
        let commandSentAt = -1

        const unsub = onSnapshot(
            stateRef,
            { includeMetadataChanges: true },
            // @ts-expect-error
            (snap: any) => {
                if (!snap.exists()) return

                // Only measure after we've sent the command
                if (commandSentAt < 0) return

                const data = snap.data()
                const buses = data?.buses ?? []
                const bus = buses.find((b: any) => b.index === busIndex)
                if (!bus) return

                // Check if this update reflects our target value (within float precision)
                const reflectsOurChange = Math.abs(bus.fader - targetValue) < 0.001

                if (reflectsOurChange) {
                    const elapsed = performance.now() - commandSentAt

                    if (!snap.metadata.hasPendingWrites) {
                        // Server-confirmed update — true cross-device latency
                        if (serverMs < 0) {
                            serverMs = elapsed
                            clearTimeout(timeout)
                            unsub()
                            resolve({ round, localMs, serverMs, targetValue, timedOut: false })
                        }
                    } else {
                        // Local cache update — fast but not representative of other devices
                        if (localMs < 0) {
                            localMs = elapsed
                        }
                    }
                }
            }
        )

        // Send the command after setting up the listener
        setTimeout(async () => {
            commandSentAt = performance.now()
            try {
                // @ts-expect-error
                await addDoc(collection(db, "monitor-live", "commands", "pending"), {
                    type: "set_bus_master",
                    busIndex,
                    value: targetValue,
                    uid: user.uid,
                    createdAt: Date.now(),
                })
            } catch (err) {
                clearTimeout(timeout)
                unsub()
                throw err
            }
        }, 50) // Small delay to ensure listener is active
    })
}

/**
 * Run multiple latency measurements and produce aggregate statistics.
 *
 * Call this from the browser DevTools console:
 *
 *   const { runLatencyMeasurement } = await import('/src/lib/__tests__/bridge-latency.test')
 *   const stats = await runLatencyMeasurement({ rounds: 20 })
 *   console.table(stats)
 *
 * Or in the app startup code during development:
 *   import { runLatencyMeasurement } from '@/lib/__tests__/bridge-latency.test'
 */
export async function runLatencyMeasurement(
    options: MeasurementOptions = {}
): Promise<LatencyStats> {
    const {
        rounds = 20,
        scenarioName = "single-change",
        timeoutMs = 3000,
        delayBetweenMs = 200,
        busIndex = 1,
    } = options

    // Dynamically import Firebase to work in browser context
    const { db, auth } = await import("@/lib/firebase")
    const { addDoc, collection, doc, onSnapshot } = await import("firebase/firestore")

    console.log(`[LatencyTest] Starting ${rounds} measurements (${scenarioName})...`)
    console.log(`[LatencyTest] Bus: ${busIndex}, Timeout: ${timeoutMs}ms`)
    console.log()

    const measurements: LatencyMeasurement[] = []
    const baseValue = 0.5

    for (let i = 1; i <= rounds; i++) {
        // Alternate between slightly different values to ensure each change is detectable
        const targetValue = baseValue + (i % 2 === 0 ? 0.05 : -0.05)

        const result = await measureSingleRoundTrip({
            busIndex,
            targetValue,
            timeoutMs,
            round: i,
            db,
            auth,
            addDoc,
            collection,
            doc,
            onSnapshot,
        })

        measurements.push(result)

        const status = result.timedOut
            ? "TIMEOUT"
            : `local=${result.localMs.toFixed(0)}ms server=${result.serverMs.toFixed(0)}ms`
        console.log(`[LatencyTest] Round ${i}/${rounds}: ${status}`)

        // Delay between measurements
        if (i < rounds) {
            await new Promise((r) => setTimeout(r, delayBetweenMs))
        }
    }

    const stats = computeStats(measurements, scenarioName)
    printStats(stats)
    return stats
}

/**
 * Simulate rapid fader dragging — 20+ changes per second for 5 seconds.
 * This tests whether the throttling mechanisms work correctly under load.
 */
export async function runRapidDragTest(
    options: {
        durationMs?: number
        changesPerSecond?: number
        busIndex?: number
    } = {}
): Promise<{
    commandsSent: number
    durationMs: number
    effectiveRate: number
    finalMeasurement: LatencyMeasurement | null
}> {
    const {
        durationMs = 5000,
        changesPerSecond = 20,
        busIndex = 1,
    } = options

    const { db, auth } = await import("@/lib/firebase")
    const { addDoc, collection } = await import("firebase/firestore")

    // @ts-expect-error
    const user = auth.currentUser
    if (!user) throw new Error("Not authenticated")

    const intervalMs = 1000 / changesPerSecond
    const startTime = performance.now()
    let commandsSent = 0

    console.log(`[DragTest] Simulating rapid fader drag: ${changesPerSecond}/sec for ${durationMs}ms`)

    await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            const elapsed = performance.now() - startTime
            if (elapsed >= durationMs) {
                clearInterval(interval)
                resolve()
                return
            }

            // Sine wave to simulate natural fader drag
            const progress = elapsed / durationMs
            const value = 0.3 + Math.sin(progress * Math.PI * 2) * 0.3

            try {
                // @ts-expect-error
                await addDoc(collection(db, "monitor-live", "commands", "pending"), {
                    type: "set_bus_master",
                    busIndex,
                    value,
                    uid: user.uid,
                    createdAt: Date.now(),
                })
                commandsSent++
            } catch (err) {
                console.warn("[DragTest] Command send failed:", err)
            }
        }, intervalMs)
    })

    const actualDuration = performance.now() - startTime
    const effectiveRate = (commandsSent / actualDuration) * 1000

    console.log(`[DragTest] Sent ${commandsSent} commands over ${actualDuration.toFixed(0)}ms`)
    console.log(`[DragTest] Effective rate: ${effectiveRate.toFixed(1)}/sec (target: ${changesPerSecond}/sec)`)

    // Now measure latency of a single command after the drag
    console.log("[DragTest] Measuring post-drag latency...")

    const { doc, onSnapshot } = await import("firebase/firestore")

    let finalMeasurement: LatencyMeasurement | null = null
    try {
        finalMeasurement = await measureSingleRoundTrip({
            busIndex,
            targetValue: 0.6,
            timeoutMs: 5000, // Longer timeout after load
            round: 1,
            db,
            auth,
            addDoc,
            collection,
            doc,
            onSnapshot,
        })
        console.log(
            `[DragTest] Post-drag latency: local=${finalMeasurement.localMs.toFixed(0)}ms server=${finalMeasurement.serverMs.toFixed(0)}ms`
        )
    } catch (err) {
        console.warn("[DragTest] Post-drag measurement failed:", err)
    }

    return {
        commandsSent,
        durationMs: actualDuration,
        effectiveRate,
        finalMeasurement,
    }
}

// ─── Statistics ───────────────────────────────────────────────────────────

function percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1
    return sortedArr[Math.max(0, idx)]
}

function computeStats(measurements: LatencyMeasurement[], scenarioName: string): LatencyStats {
    const completed = measurements.filter((m) => !m.timedOut)
    const timedOut = measurements.filter((m) => m.timedOut).length

    if (completed.length === 0) {
        return {
            scenarioName,
            rounds: measurements.length,
            completed: 0,
            timedOut,
            local: { minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, avgMs: 0 },
            server: { minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, avgMs: 0 },
            assessment: "unacceptable",
            recommendation: "All measurements timed out. Bridge may not be running.",
        }
    }

    const localTimes = completed.map((m) => m.localMs).filter((t) => t >= 0).sort((a, b) => a - b)
    const serverTimes = completed.map((m) => m.serverMs).filter((t) => t >= 0).sort((a, b) => a - b)

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

    const localStats = {
        minMs: localTimes[0] ?? 0,
        medianMs: percentile(localTimes, 50),
        p95Ms: percentile(localTimes, 95),
        maxMs: localTimes[localTimes.length - 1] ?? 0,
        avgMs: avg(localTimes),
    }

    const serverStats = {
        minMs: serverTimes[0] ?? 0,
        medianMs: percentile(serverTimes, 50),
        p95Ms: percentile(serverTimes, 95),
        maxMs: serverTimes[serverTimes.length - 1] ?? 0,
        avgMs: avg(serverTimes),
    }

    // Assessment based on server-confirmed (cross-device) latency
    const p95Server = serverStats.p95Ms
    let assessment: LatencyStats["assessment"]
    let recommendation: string

    if (p95Server < 150) {
        assessment = "excellent"
        recommendation =
            "Firestore transport is excellent for fader control. Proceed with confidence."
    } else if (p95Server < 250) {
        assessment = "acceptable"
        recommendation =
            "Firestore transport is acceptable. Latency is imperceptible for fader control at this level."
    } else if (p95Server < 500) {
        assessment = "marginal"
        recommendation =
            "Latency is noticeable but workable. Consider hybrid WebSocket approach if latency degrades further in production."
    } else {
        assessment = "unacceptable"
        recommendation =
            "Latency is too high for real-time fader control. Switch to hybrid WebSocket approach for commands."
    }

    return {
        scenarioName,
        rounds: measurements.length,
        completed: completed.length,
        timedOut,
        local: localStats,
        server: serverStats,
        assessment,
        recommendation,
    }
}

function printStats(stats: LatencyStats): void {
    console.log()
    console.log("=".repeat(60))
    console.log(`LATENCY RESULTS: ${stats.scenarioName}`)
    console.log("=".repeat(60))
    console.log(`Rounds: ${stats.completed}/${stats.rounds} completed (${stats.timedOut} timed out)`)
    console.log()
    console.log("LOCAL CACHE LATENCY (includes Firestore local write optimization):")
    console.log(`  Min:    ${stats.local.minMs.toFixed(0)}ms`)
    console.log(`  Median: ${stats.local.medianMs.toFixed(0)}ms`)
    console.log(`  P95:    ${stats.local.p95Ms.toFixed(0)}ms`)
    console.log(`  Max:    ${stats.local.maxMs.toFixed(0)}ms`)
    console.log()
    console.log("SERVER-CONFIRMED LATENCY (true cross-device round-trip):")
    console.log(`  Min:    ${stats.server.minMs.toFixed(0)}ms`)
    console.log(`  Median: ${stats.server.medianMs.toFixed(0)}ms`)
    console.log(`  P95:    ${stats.server.p95Ms.toFixed(0)}ms`)
    console.log(`  Max:    ${stats.server.maxMs.toFixed(0)}ms`)
    console.log()
    console.log(`ASSESSMENT: ${stats.assessment.toUpperCase()}`)
    console.log(`RECOMMENDATION: ${stats.recommendation}`)
    console.log("=".repeat(60))
    console.log()
    console.log("NOTE: Server-confirmed latency measures the full round trip:")
    console.log("  iPad writes command → Firestore → Bridge → X32 → Bridge → Firestore → iPad")
    console.log("  This is what other devices (musicians) will actually experience.")
    console.log()
    console.log("  Values under 10ms are local cache hits — check bridge is actually running.")
}

/**
 * Convenience function to run all scenarios from the browser console.
 *
 * Usage: window.runBridgeLatencyTests()
 * (After adding this to a dev page or browser console)
 */
export async function runAllScenarios(): Promise<void> {
    console.log("[LatencyTest] === Full Bridge Latency Test Suite ===")
    console.log()

    // Scenario 1: Single changes with pauses
    const singleStats = await runLatencyMeasurement({
        rounds: 20,
        scenarioName: "single-change (1 change, 200ms pause)",
        timeoutMs: 3000,
        delayBetweenMs: 200,
        busIndex: 1,
    })

    await new Promise((r) => setTimeout(r, 2000))

    // Scenario 2: Rapid drag simulation
    const dragResult = await runRapidDragTest({
        durationMs: 5000,
        changesPerSecond: 20,
        busIndex: 1,
    })

    console.log()
    console.log("=".repeat(60))
    console.log("FULL TEST SUMMARY")
    console.log("=".repeat(60))
    console.log()
    console.log("SCENARIO 1: Single Changes")
    console.log(`  Server P95: ${singleStats.server.p95Ms.toFixed(0)}ms (${singleStats.assessment})`)
    console.log()
    console.log("SCENARIO 2: Rapid Drag (20 changes/sec for 5 seconds)")
    console.log(`  Commands sent: ${dragResult.commandsSent}`)
    console.log(`  Effective rate: ${dragResult.effectiveRate.toFixed(1)}/sec`)
    if (dragResult.finalMeasurement && !dragResult.finalMeasurement.timedOut) {
        console.log(`  Post-drag latency: ${dragResult.finalMeasurement.serverMs.toFixed(0)}ms`)
    }
    console.log()

    const finalAssessment = singleStats.assessment
    console.log(`OVERALL ASSESSMENT: ${finalAssessment.toUpperCase()}`)
    console.log()
    console.log("ARCHITECTURE RECOMMENDATION:")
    if (finalAssessment === "excellent" || finalAssessment === "acceptable") {
        console.log("  Use Firestore-only transport. The existing architecture is validated.")
        console.log("  Zero iPad configuration, automatic reconnection, proven reliability.")
    } else if (finalAssessment === "marginal") {
        console.log("  Consider hybrid: Firestore for state sync, WebSocket for commands.")
        console.log("  Monitor latency in production before committing to hybrid approach.")
    } else {
        console.log("  Switch to hybrid WebSocket architecture for commands.")
        console.log("  Firestore remains valid for state sync (one-way, lower frequency).")
    }
}

/**
 * Document size calculator for Firestore write cost analysis.
 *
 * The monitor-live/state document contains:
 * - 32 channel names: ~50 bytes each = ~1,600 bytes
 * - 4 buses with 32 sends each:
 *   - Bus header: ~80 bytes
 *   - Each send (level + on): ~60 bytes
 *   - 4 buses × (80 + 32 × 60) = 4 × 2,000 = ~8,000 bytes
 * - 6 matrices: ~80 bytes each = ~480 bytes
 * - Metadata (updatedAt, config): ~200 bytes
 * Total: ~10,280 bytes (~10KB)
 *
 * Firestore limits:
 * - Max document size: 1MB (well under limit)
 * - Write rate: 1 write/sec/doc recommended for sustained load
 * - The bridge throttles to 10 writes/sec max (STATE_WRITE_INTERVAL = 100ms)
 *
 * At 3-5 musicians simultaneously dragging faders:
 * - Each musician triggers ~1 command per 50ms (COMMAND_THROTTLE_MS = 50)
 * - Bridge batches commands in 20ms window (COMMAND_BATCH_WINDOW = 20)
 * - Bridge writes state at max 10/sec (one write per 100ms)
 * - Expected: 10 writes/sec × 10KB = 100KB/sec bandwidth
 * - At 2-hour service: 100KB/sec × 7200sec = ~720MB data transfer
 * - Firestore pricing (Blaze plan): $0.06/100K reads, $0.18/100K writes, $0.18/GiB storage
 * - Estimated cost per 2-hour service: ~$0.01–0.05 (negligible)
 */
export function analyzeDocumentSize(): void {
    const channelBytes = 32 * 50  // 32 channels × ~50 bytes each
    const sendBytes = 32 * 60     // 32 sends × ~60 bytes (level + on + channelIndex)
    const busHeaderBytes = 80     // bus metadata (index, name, fader)
    const busBytes = 4 * (busHeaderBytes + sendBytes)  // 4 buses
    const matrixBytes = 6 * 80   // 6 matrices × ~80 bytes
    const metadataBytes = 200    // updatedAt, config

    const totalBytes = channelBytes + busBytes + matrixBytes + metadataBytes

    console.log("=".repeat(50))
    console.log("FIRESTORE DOCUMENT SIZE ANALYSIS")
    console.log("=".repeat(50))
    console.log(`32 channels:   ${channelBytes.toLocaleString()} bytes`)
    console.log(`4 buses:       ${busBytes.toLocaleString()} bytes`)
    console.log(`  (32 sends per bus × 60 bytes)`)
    console.log(`6 matrices:    ${matrixBytes.toLocaleString()} bytes`)
    console.log(`Metadata:      ${metadataBytes.toLocaleString()} bytes`)
    console.log("-".repeat(50))
    console.log(`Total:         ${totalBytes.toLocaleString()} bytes (~${(totalBytes / 1024).toFixed(1)}KB)`)
    console.log()
    console.log("Firestore limits:")
    console.log("  Max document size: 1,048,576 bytes (1MB)")
    console.log(`  Usage: ${((totalBytes / 1048576) * 100).toFixed(1)}% of max`)
    console.log()
    console.log("At 10 writes/sec (max bridge rate):")
    const writesPerHour = 10 * 3600
    const mbPerHour = (totalBytes * writesPerHour) / (1024 * 1024)
    console.log(`  ${writesPerHour.toLocaleString()} writes/hour`)
    console.log(`  ${mbPerHour.toFixed(0)}MB data transfer/hour`)
    console.log()
    console.log("Cost estimate (2-hour service, Blaze plan):")
    const writeCost = (writesPerHour * 2 / 100000) * 0.18
    console.log(`  Writes: $${writeCost.toFixed(4)}`)
    console.log(`  Total (incl. reads): ~$0.01–0.05 per service`)
    console.log("=".repeat(50))
}
