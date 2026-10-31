import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    getMonitorLimits as getLimits,
    listSavedMixes as listMixes,
    recallMix as recall,
    setMonitorLimits as setLimits,
    type ListSavedMixesArgs,
    type RecallMixArgs,
    type SetMonitorLimitsArgs,
} from "@/lib/monitor/mixes-server"

/**
 * BET-4 MCP tools: wedge limits and saved mixes. Thin wrappers over
 * `@/lib/monitor/mixes-server`, which the /api/monitor routes share, so the
 * iPad and Claude follow one set of rules. All four are mixer tools
 * (tenant-tools.ts FEATURE_TOOLS.mixer): CRC-only.
 */

function internalError(tool: string, err: unknown): RichErrorEnvelope {
    const msg = err instanceof Error ? err.message : String(err)
    return richError("internal_error", `${tool} internal error: ${msg}`, { tool })
}

function db() {
    initAdmin()
    return getFirestore()
}

export async function getMonitorLimits(uid: string) {
    try {
        return await getLimits(db(), uid)
    } catch (err) {
        return internalError("get_monitor_limits", err)
    }
}

export async function setMonitorLimits(uid: string, args: SetMonitorLimitsArgs) {
    try {
        return await setLimits(db(), uid, args)
    } catch (err) {
        return internalError("set_monitor_limits", err)
    }
}

export async function listSavedMixes(uid: string, args: ListSavedMixesArgs) {
    try {
        return await listMixes(db(), uid, args)
    } catch (err) {
        return internalError("list_saved_mixes", err)
    }
}

export async function recallMix(uid: string, args: RecallMixArgs) {
    try {
        return await recall(db(), uid, args)
    } catch (err) {
        return internalError("recall_mix", err)
    }
}
