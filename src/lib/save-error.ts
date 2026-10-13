/**
 * Save-error reporting helper — wired into user-initiated write paths
 * that were previously `.catch(() => {})`. Surfaces failures as toasts
 * so musicians know their change didn't land, and logs for telemetry.
 *
 * v4.3 B01.
 */
import { toast } from "sonner"
import { plainT } from "@/i18n/plain"
import { logger } from "@/lib/logger"

export interface ReportSaveErrorOpts {
    /** Skip the toast; logger.warn still fires. Use for background paths. */
    silent?: boolean
    /**
     * Phase 7: the thing that failed to save, already translated (from the
     * caller's `t()`), for the toast. Defaults to `action`, which is also the
     * English log label.
     */
    label?: string
}

/** Moved to src/i18n/plain.ts; re-exported so existing imports keep working. */
export { plainT }

export function reportSaveError(
    err: unknown,
    action: string,
    opts?: ReportSaveErrorOpts,
): void {
    logger.warn(`[save] ${action} failed:`, err)
    if (!opts?.silent) {
        toast.error(plainT()("appSync.saveFailed", { action: opts?.label ?? action }))
    }
}
