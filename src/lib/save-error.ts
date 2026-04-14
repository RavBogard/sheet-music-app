/**
 * Save-error reporting helper — wired into user-initiated write paths
 * that were previously `.catch(() => {})`. Surfaces failures as toasts
 * so musicians know their change didn't land, and logs for telemetry.
 *
 * v4.3 B01.
 */
import { toast } from "sonner"
import { logger } from "@/lib/logger"

export interface ReportSaveErrorOpts {
    /** Skip the toast; logger.warn still fires. Use for background paths. */
    silent?: boolean
}

export function reportSaveError(
    err: unknown,
    action: string,
    opts?: ReportSaveErrorOpts,
): void {
    logger.warn(`[save] ${action} failed:`, err)
    if (!opts?.silent) {
        toast.error(`Couldn't save ${action} — try again`)
    }
}
