/**
 * BET-6 — `backfill_week_keys`: stamp the advisory family week key on existing
 * CRC setlists (and re-key any whose date moved since the key was written —
 * the browser editor's date edit goes through its own outbox, not the server
 * write path that keys new dates).
 *
 * F-05: `dryRun` defaults to true and returns the full plan; a real run needs
 * `dryRun: false, force: true`. Admin-only, ops surface. Writes only
 * `weekKey`, `weekKeyDay` and `parashaName` — no version bump, no row touched,
 * nothing that changes what a service plays. Brothers Lazaroff: nothing to do.
 * A setlist whose week Hebcal cannot answer is reported and left alone.
 */

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"
import { rowOrg } from "@/lib/mcp/org-context"
import { readTenantRole } from "@/lib/org/access"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { computeWeek, isFamilyOrg, serviceDay, storedWeek, weekFields, type WeekInfo } from "@/lib/family/week-key"

export interface BackfillWeekKeysArgs {
    dryRun?: boolean
    force?: boolean
}

export interface WeekKeyDelta {
    setlistId: string
    name: string | null
    day: string
    from: string | null
    to: string
}

export interface BackfillWeekKeysResult {
    scanned: number
    eligible: number
    alreadyKeyed: number
    rowsChanged: number
    /** Services whose week Hebcal could not answer; left unchanged. */
    unresolved: Array<{ setlistId: string; day: string }>
    deltas: WeekKeyDelta[]
    deltasTruncated: boolean
    dryRun: boolean
    /** Present when the tenant has no family spine. */
    note?: string
}

const REPORT_CAP = 500
const CONCURRENCY = 6

export async function backfillWeekKeys(
    uid: string,
    args: BackfillWeekKeysArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
    /** Test seam: the week computer (defaults to Hebcal). */
    compute: (eventDate: unknown, org: OrgId) => Promise<WeekInfo | null> = computeWeek,
): Promise<BackfillWeekKeysResult | RichErrorEnvelope> {
    const dryRun = args.dryRun !== false
    const force = args.force === true
    try {
        initAdmin()
        const db = getFirestore()
        const role = await readTenantRole(db, uid, org)
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "backfill_week_keys is admin-only.",
                { callerRole: role ?? null, requiredRoles: ["admin"] },
                "Ask an admin to run it.",
            )
        }
        if (!dryRun && !force) {
            const plan = await backfillWeekKeys(uid, { dryRun: true }, org, compute)
            if ("ok" in plan && plan.ok === false) return plan
            return richError(
                "force_required",
                "Pass force:true to commit backfill_week_keys writes.",
                { dryRunPlan: plan as BackfillWeekKeysResult },
                "Re-call with `dryRun: false, force: true` to commit, or `dryRun: true` to inspect.",
            )
        }
        const empty: BackfillWeekKeysResult = {
            scanned: 0, eligible: 0, alreadyKeyed: 0, rowsChanged: 0, unresolved: [], deltas: [], deltasTruncated: false, dryRun,
        }
        if (!isFamilyOrg(org)) return { ...empty, note: "The week key is CRC-only; this tenant has nothing to back-fill." }

        const snap = await db.collection("setlists").get()
        const mine = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)
        const todo: Array<{ id: string; data: Record<string, unknown>; day: string }> = []
        let alreadyKeyed = 0
        for (const d of mine) {
            const data = d.data() as Record<string, unknown>
            if (data.isTest === true) continue
            const day = serviceDay(data.eventDate, org)
            if (!day) continue
            if (storedWeek(data, org)) {
                alreadyKeyed++
                continue
            }
            todo.push({ id: d.id, data, day })
        }

        const deltas: WeekKeyDelta[] = []
        const unresolved: Array<{ setlistId: string; day: string }> = []
        const weeks = new Map<string, WeekInfo>()
        for (let i = 0; i < todo.length; i += CONCURRENCY) {
            await Promise.all(
                todo.slice(i, i + CONCURRENCY).map(async (row) => {
                    const week = await compute(row.day, org)
                    if (!week) {
                        unresolved.push({ setlistId: row.id, day: row.day })
                        return
                    }
                    weeks.set(row.id, week)
                    deltas.push({
                        setlistId: row.id,
                        name: typeof row.data.name === "string" ? row.data.name : null,
                        day: row.day,
                        from: typeof row.data.weekKey === "string" ? row.data.weekKey : null,
                        to: week.weekKey,
                    })
                }),
            )
        }
        deltas.sort((a, b) => a.day.localeCompare(b.day) || a.setlistId.localeCompare(b.setlistId))

        if (!dryRun) {
            for (let i = 0; i < deltas.length; i += 400) {
                const batch = db.batch()
                for (const delta of deltas.slice(i, i + 400)) {
                    batch.update(db.collection("setlists").doc(delta.setlistId), weekFields(weeks.get(delta.setlistId)!))
                }
                await batch.commit()
            }
        }
        return {
            scanned: mine.length,
            eligible: todo.length + alreadyKeyed,
            alreadyKeyed,
            rowsChanged: deltas.length,
            unresolved,
            deltas: deltas.slice(0, REPORT_CAP),
            deltasTruncated: deltas.length > REPORT_CAP,
            dryRun,
        }
    } catch (err) {
        logger.warn("[mcp] backfill_week_keys failed:", err)
        return richError(
            "server_error",
            "Failed to run the week-key back-fill.",
            { tool: "backfill_week_keys" },
            "Retry; if it persists check the [mcp] logs.",
        )
    }
}
